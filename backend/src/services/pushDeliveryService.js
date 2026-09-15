const { randomUUID } = require('crypto')
const { Notification, PushDevice, PushDelivery } = require('../models')

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const RECEIPT_DELAY_MS = 15 * 60_000
const DELIVERY_WINDOW_MS = 24 * 60 * 60_000
const RETENTION_MS = 30 * DELIVERY_WINDOW_MS
const LEASE_MS = 60_000
const MAX_SEND_ATTEMPTS = 5
const MAX_RECEIPT_CHECKS = 12
const TRANSIENT_ERRORS = new Set([
	'MessageRateExceeded', 'PUSH_TOO_MANY_REQUESTS', 'ExpoServerError',
])

const createPushDeliveryService = ({
	notifications = Notification,
	devices = PushDevice,
	deliveries = PushDelivery,
	fetchImpl = (...args) => fetch(...args),
	clock = () => Date.now(),
	logger = console,
	accessToken = process.env.EXPO_ACCESS_TOKEN,
} = {}) => {
	const finish = async (job, changes) => {
		const terminal = ['provider_accepted', 'failed', 'unknown', 'cancelled'].includes(changes.status)
		const result = await deliveries.updateOne(
			{ _id: job._id, leaseId: job.leaseId },
			{
				$set: {
					...changes,
					...(terminal ? {
						completedAt: new Date(clock()), purgeAt: new Date(clock() + RETENTION_MS),
					} : {}),
				},
				$unset: { leaseId: '', leaseUntil: '' },
			},
		)
		if (result.modifiedCount && ['failed', 'unknown'].includes(changes.status)) {
			logger.warn('Push delivery ended:', job.notificationId, changes.status, changes.lastError)
		}
	}

	const post = async (url, payload) => {
		try {
			const response = await fetchImpl(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json', 'Content-Type': 'application/json',
					...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(10_000),
			})
			if (!response.ok) {
				return { error: `HTTP_${response.status}`, retryable: response.status === 429 || response.status >= 500 }
			}
			const result = await response.json()
			if (result?.errors?.length) {
				const code = result.errors[0]?.code || 'ExpoRequestError'
				return { error: code, retryable: TRANSIENT_ERRORS.has(code) }
			}
			return { data: result?.data }
		} catch {
			return { error: 'NetworkOrResponseError', retryable: true }
		}
	}

	const retrySend = (job, error, retryable) => {
		if (!retryable || job.attempts >= MAX_SEND_ATTEMPTS || clock() >= +job.expiresAt) {
			return finish(job, { status: 'failed', lastError: error })
		}
		return finish(job, {
			status: 'pending', lastError: error, ticketId: null, ticketCreatedAt: null,
			nextAttemptAt: new Date(clock() + Math.min(15 * 60_000, 30_000 * 2 ** (job.attempts - 1))),
		})
	}

	const retryReceipt = (job, error) => {
		// A missing receipt is ambiguous: poll again, never blindly resend it.
		if (job.receiptChecks >= MAX_RECEIPT_CHECKS || clock() >= +job.expiresAt) {
			return finish(job, { status: 'unknown', lastError: error })
		}
		return finish(job, {
			status: 'awaiting_receipt', lastError: error,
			nextAttemptAt: new Date(Math.min(+job.expiresAt,
				clock() + Math.min(60 * 60_000, RECEIPT_DELAY_MS * 2 ** (job.receiptChecks - 1)))),
		})
	}

	const handleExpoError = async (job, result) => {
		const code = result.details?.error || 'UnknownExpoError'
		if (code === 'DeviceNotRegistered') {
			await devices.updateOne({
				expoPushToken: job.expoPushToken, personnelId: job.personnelId, status: 'active',
				lastSeenAt: { $lte: job.ticketCreatedAt || new Date(clock()) },
			}, { $set: { status: 'invalid' } })
		}
		return retrySend(job, code, TRANSIENT_ERRORS.has(code))
	}

	const send = async (job) => {
		if (clock() >= +job.expiresAt || job.attempts > MAX_SEND_ATTEMPTS) {
			return finish(job, { status: 'failed', lastError: 'DeliveryWindowOrAttemptsExceeded' })
		}
		// Recheck ownership and registration on every attempt (logout/account switch).
		const device = await devices.findOne({
			expoPushToken: job.expoPushToken, personnelId: job.personnelId, status: 'active',
		}).lean()
		if (!device) return finish(job, { status: 'cancelled', lastError: 'DeviceUnavailable' })
		const sentAt = new Date(clock())
		const response = await post(SEND_URL, [{
			...job.message, to: job.expoPushToken,
			ttl: Math.max(1, Math.floor((+job.expiresAt - clock()) / 1000)),
		}])
		if (response.error) return retrySend(job, response.error, response.retryable)
		const ticket = Array.isArray(response.data) ? response.data[0] : response.data
		if (ticket?.status === 'error') return handleExpoError({ ...job, ticketCreatedAt: sentAt }, ticket)
		if (ticket?.status !== 'ok' || typeof ticket.id !== 'string' || !ticket.id) {
			return retrySend(job, 'InvalidPushTicket', true)
		}
		return finish(job, {
			status: 'awaiting_receipt', ticketId: ticket.id, ticketCreatedAt: sentAt,
			receiptChecks: 0, lastError: null,
			nextAttemptAt: new Date(clock() + RECEIPT_DELAY_MS),
		})
	}

	const checkReceipt = async (job) => {
		if (clock() >= +job.expiresAt || job.receiptChecks > MAX_RECEIPT_CHECKS) {
			return finish(job, { status: 'unknown', lastError: 'ReceiptWindowOrAttemptsExceeded' })
		}
		const response = await post(RECEIPTS_URL, { ids: [job.ticketId] })
		if (response.error) {
			return response.retryable
				? retryReceipt(job, response.error)
				: finish(job, { status: 'unknown', lastError: response.error })
		}
		const receipt = response.data?.[job.ticketId]
		if (receipt?.status === 'ok') {
			return finish(job, { status: 'provider_accepted', lastError: null })
		}
		if (receipt?.status === 'error') return handleExpoError(job, receipt)
		return retryReceipt(job, 'ReceiptNotAvailable')
	}

	const enqueuePending = async () => {
		const pending = await notifications.find({ pushQueuePending: true })
			.sort({ createdAt: 1 }).limit(50).lean()
		for (const notification of pending) {
			try {
				const expiresAt = new Date(+notification.createdAt + DELIVERY_WINDOW_MS)
				const activeDevices = +expiresAt > clock()
					? await devices.find({ personnelId: notification.recipientId, status: 'active' }).lean()
					: []
				for (const device of activeDevices) {
					try {
						await deliveries.updateOne({
							notificationId: notification.notificationId, expoPushToken: device.expoPushToken,
						}, { $setOnInsert: {
							notificationId: notification.notificationId,
							personnelId: notification.recipientId, expoPushToken: device.expoPushToken,
							status: 'pending', attempts: 0, receiptChecks: 0,
							nextAttemptAt: new Date(clock()), expiresAt,
							message: {
								title: notification.title, body: notification.message,
								sound: notification.priority === 'low' ? null : 'default',
								priority: ['critical', 'high'].includes(notification.priority) ? 'high' : 'default',
								channelId: 'officer-alerts',
								data: {
									...notification.data,
									notificationId: notification.notificationId,
									referenceType: notification.referenceType, referenceId: notification.referenceId,
								},
							},
						} }, { upsert: true })
					} catch (error) {
						if (error?.code !== 11000) throw error
					}
				}
				await notifications.updateOne({ _id: notification._id }, { $set: { pushQueuePending: false } })
			} catch (error) {
				logger.error('Push enqueue failed:', notification.notificationId, error.name)
			}
		}
	}

	const drain = async (status, limit) => {
		for (let index = 0; index < limit; index += 1) {
			const job = await deliveries.findOneAndUpdate({
				status, nextAttemptAt: { $lte: new Date(clock()) },
				$or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date(clock()) } }],
			}, {
				$set: { leaseId: randomUUID(), leaseUntil: new Date(clock() + LEASE_MS) },
				$inc: { [status === 'pending' ? 'attempts' : 'receiptChecks']: 1 },
			}, { sort: { nextAttemptAt: 1 }, returnDocument: 'after' }).lean()
			if (!job) break
			try {
				if (status === 'pending') await send(job)
				else await checkReceipt(job)
			} catch (error) {
				// Keep the lease on DB failure; another worker can recover it on expiry.
				logger.error('Push worker failed:', job.notificationId, error.name)
			}
		}
	}

	const runOnce = async () => {
		await enqueuePending()
		await drain('awaiting_receipt', 20)
		await drain('pending', 20)
	}
	return { runOnce }
}

module.exports = { createPushDeliveryService, RECEIPT_DELAY_MS, DELIVERY_WINDOW_MS, LEASE_MS }
