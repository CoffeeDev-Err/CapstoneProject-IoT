const { createValidationError, validateText } = require('../utils/operationalValidation')

const normalizeAnnouncement = (input = {}) => {
	if (typeof input.request_id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.request_id)) {
		throw createValidationError('A valid announcement request ID is required.', 'request_id')
	}
	const message = validateText(input.message, { field: 'message', label: 'Message / reason', required: true, maxLength: 600 })
	const location = validateText(input.location, { field: 'location', label: 'Location', maxLength: 200, allowNewlines: false })
	if (!['immediately', 'scheduled'].includes(input.when)) {
		throw createValidationError('Choose Immediately or a date and time.', 'when')
	}
	let eventAt = null
	if (input.when === 'scheduled') {
		if (typeof input.event_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(input.event_at)
			|| !Number.isFinite(Date.parse(input.event_at))) {
			throw createValidationError('Choose a valid event date and time with a timezone.', 'event_at')
		}
		eventAt = new Date(input.event_at)
		const day = input.event_at.slice(0, 10)
		if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
			|| Number(input.event_at.slice(11, 13)) > 23 || Number(input.event_at.slice(14, 16)) > 59) {
			throw createValidationError('Choose a valid calendar date and time.', 'event_at')
		}
	}
	return { message, location, when: input.when, eventAt }
}

const announcementMessage = (announcement) => [
	announcement.message,
	announcement.location && `Location: ${announcement.location}`,
	`When: ${announcement.when === 'immediately' ? 'Immediately' : new Date(announcement.eventAt).toLocaleString('en-PH', {
		timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
	}) + ' PHT'}`,
].filter(Boolean).join('\n')

const createAnnouncementService = ({ models, deliverNotification, io, clock = () => new Date(), logger = console }) => {
	const { PersonnelAnnouncement, User, Personnel } = models
	const response = (record) => ({ id: record._id, recipientCount: record.recipientIds.length,
		status: record.completedAt ? 'saved_to_inboxes' : 'queued' })
	const submit = async (input, actor) => {
		if (actor?.role !== 'supervisor' || !actor._id) {
			const error = new Error('Supervisor access is required.'); error.status = 403; throw error
		}
		const values = normalizeAnnouncement(input)
		const id = `${actor._id}:${input.request_id}`
		const checkExisting = (record) => {
			if (['message', 'location', 'when'].some(key => record[key] !== values[key])
				|| (record.eventAt ? +new Date(record.eventAt) : null) !== (values.eventAt ? +values.eventAt : null)) {
				const error = new Error('This send request was already used for a different announcement.')
				error.status = 409; throw error
			}
			return response(record)
		}
		const existing = await PersonnelAnnouncement.findById(id).lean()
		if (existing) return checkExisting(existing)
		if (values.eventAt && +values.eventAt <= +clock()) {
			throw createValidationError('Choose a future event time or Immediately.', 'event_at')
		}
		const users = await User.find({ role: 'officer', status: 'active', isMockAccount: { $ne: true } }).select('personnelId').lean()
		const officers = await Personnel.find({ status: 'active', personnelId: { $in: users.map(user => user.personnelId).filter(Boolean) } }).select('personnelId').lean()
		const recipientIds = [...new Set(officers.map(officer => officer.personnelId))]
		if (!recipientIds.length) {
			const error = new Error('There are no active police accounts to notify.'); error.status = 409; throw error
		}
		try {
			return response(await PersonnelAnnouncement.create({ _id: id, createdBy: String(actor._id), ...values,
				recipientIds, pendingRecipientIds: recipientIds }))
		} catch (error) {
			if (error.code !== 11000) throw error
			const record = await PersonnelAnnouncement.findById(id).lean()
			if (!record) throw error
			return checkExisting(record)
		}
	}

	let running = false
	const runOnce = async () => {
		if (running) return
		running = true
		try {
			const announcements = await PersonnelAnnouncement.find({ completedAt: null }).sort({ createdAt: 1 }).limit(10).lean()
			for (const announcement of announcements) {
				for (const recipientId of announcement.pendingRecipientIds) {
					try {
						await deliverNotification({ io, recipientId, type: 'announcement', title: 'Personnel announcement',
							message: announcementMessage(announcement), referenceType: 'announcement', referenceId: announcement._id,
							dedupeKey: `announcement:${announcement._id}`, priority: 'high',
							data: { eventAt: announcement.eventAt, when: announcement.when },
						})
						await PersonnelAnnouncement.updateOne({ _id: announcement._id }, { $pull: { pendingRecipientIds: recipientId } })
					} catch (error) {
						logger.error('Announcement recipient will be retried:', announcement._id, recipientId, error.name)
					}
				}
				await PersonnelAnnouncement.updateOne({ _id: announcement._id, pendingRecipientIds: { $size: 0 }, completedAt: null },
					{ $set: { completedAt: clock() } })
			}
		} finally { running = false }
	}
	return { submit, runOnce }
}

module.exports = { createAnnouncementService, normalizeAnnouncement, announcementMessage }
