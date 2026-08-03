const { randomUUID } = require('crypto')
const {
	AuditLog,
	Deployment,
	GpsDeviceAssignment,
	Personnel,
	Report,
	Task,
	User,
} = require('../models')
const { hashPassword, isStrongPassword } = require('../utils/password')
const { fetchRegisteredDevices } = require('./flespiService')
const { createNotification } = require('./notificationService')

const normalizeStatus = (status) => (
	String(status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active'
)

const createHttpError = (message, status = 400, code) => {
	const error = new Error(message)
	error.status = status
	if (code) error.code = code
	return error
}

const serializeAccount = (user, profile, device) => ({
	id: String(user._id),
	personnelId: user.personnelId,
	fullName: profile?.fullName || '',
	badgeNumber: profile?.badgeNumber || '',
	rank: profile?.rank || '',
	mobileNumber: profile?.mobileNumber || '',
	loginId: user.username,
	officialEmail: user.email || '',
	emailVerified: Boolean(user.emailVerifiedAt),
	role: user.role === 'officer' ? 'Officer' : 'Supervisor',
	accountStatus: user.status === 'active' ? 'Active' : 'Inactive',
	forcePasswordReset: user.forcePasswordReset,
	imei: device?.imei || '',
	flespiDeviceId: device?.flespiDeviceId || '',
	flespiDeviceName: device?.deviceName || '',
	createdAt: user.createdAt?.toISOString(),
	updatedAt: user.updatedAt?.toISOString(),
})

const validateAccountPayload = (
	payload,
	{ requirePassword = true, requirePersonnel = true } = {},
) => {
	const requiredFields = requirePersonnel
		? [
			['fullName', 'Full name'],
			['badgeNumber', 'Badge number'],
			['rank', 'Rank'],
			['loginId', 'Login ID'],
			['officialEmail', 'Official email'],
			['imei', 'GPS device ID'],
			['flespiDeviceId', 'Flespi device'],
		]
		: [
			['loginId', 'Login ID'],
			['officialEmail', 'Official email'],
		]

	for (const [field, label] of requiredFields) {
		if (!String(payload[field] || '').trim()) {
			throw createHttpError(`${label} is required.`)
		}
	}

	const password = String(payload.temporaryPassword || '')
	if (requirePassword && !password) {
		throw createHttpError('Temporary password is required.')
	}
	if (password && !isStrongPassword(password)) {
		throw createHttpError(
			'Password must have at least 10 characters with upper, lower, number, and symbol.',
		)
	}

	const mobileNumber = String(payload.mobileNumber || '').trim()
	if (mobileNumber && !/^\+?\d{10,14}$/.test(mobileNumber)) {
		throw createHttpError(
			'Mobile number must use 10-14 digits with an optional + prefix.',
		)
	}

	const officialEmail = String(payload.officialEmail || '').trim().toLowerCase()
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(officialEmail)) {
		throw createHttpError('Enter a valid official email address.')
	}
}

const validateRegisteredDevice = async ({ imei, flespiDeviceId }) => {
	const devices = await fetchRegisteredDevices()
	const device = devices.find((item) => (
		item.imei === String(imei)
		&& item.id === String(flespiDeviceId)
	))

	if (!device) {
		throw createHttpError(
			'Select a GPS device currently registered in Flespi.',
			400,
			'FLESPI_DEVICE_NOT_FOUND',
		)
	}
	return device
}

const createAccountService = ({ io, personnelService }) => {
	const broadcastAccountData = async (identity) => {
		io.emit('accounts:updated')
		if (identity?.personnelId) {
			io.emit('personnel:identity-updated', identity)
		}
		if (personnelService) {
			io.emit(
				'personnel:update',
				await personnelService.getPersonnelWithLocations(),
			)
		}
		io.emit('dashboard:updated')
	}

	const loadAccounts = async () => {
		const users = await User.find().sort({ createdAt: -1 }).lean()
		const personnelIds = users.map((user) => user.personnelId).filter(Boolean)
		const [profiles, assignments] = await Promise.all([
			Personnel.find({ personnelId: { $in: personnelIds } }).lean(),
			GpsDeviceAssignment.find({
				personnelId: { $in: personnelIds },
				status: 'active',
			}).lean(),
		])
		const profilesById = new Map(
			profiles.map((profile) => [profile.personnelId, profile]),
		)
		const assignmentsById = new Map(
			assignments.map((assignment) => [assignment.personnelId, assignment]),
		)

		return users.map((user) => (
			serializeAccount(
				user,
				profilesById.get(user.personnelId),
				assignmentsById.get(user.personnelId),
			)
		))
	}

	const createAccount = async (payload, { ipAddress } = {}) => {
		validateAccountPayload(payload)
		const device = await validateRegisteredDevice(payload)
		const personnelId = `officer-${String(payload.badgeNumber)
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')}`
		let profileCreated = false

		try {
			const profile = await Personnel.create({
				personnelId,
				badgeNumber: payload.badgeNumber,
				fullName: payload.fullName,
				rank: payload.rank,
				mobileNumber: payload.mobileNumber || '',
				dutyStatus: 'Off Duty',
				status: 'active',
			})
			profileCreated = true

			const assignment = await GpsDeviceAssignment.create({
				assignmentId: `GPS-${randomUUID()}`,
				personnelId,
				flespiDeviceId: device.id,
				imei: device.imei,
				deviceName: device.name,
				assignedBy: 'supervisor',
				assignedAt: new Date(),
			})
			const user = await User.create({
				username: String(payload.loginId).trim().toLowerCase(),
				email: String(payload.officialEmail).trim().toLowerCase(),
				passwordHash: await hashPassword(payload.temporaryPassword),
				role: 'officer',
				personnelId,
				status: 'active',
				forcePasswordReset: true,
			})

			await Promise.all([
				AuditLog.create({
					action: 'account.created',
					entityType: 'user',
					entityId: String(user._id),
					changes: {
						personnelId,
						badgeNumber: profile.badgeNumber,
						imei: assignment.imei,
					},
					ipAddress,
				}),
				createNotification({
					title: 'Officer Account Created',
					message: `${profile.fullName} was provisioned for mobile access.`,
					referenceType: 'user',
					referenceId: String(user._id),
				}),
			])

			await broadcastAccountData()
			return serializeAccount(user, profile, assignment)
		} catch (error) {
			if (profileCreated) {
				await Promise.allSettled([
					User.deleteOne({ personnelId }),
					GpsDeviceAssignment.deleteMany({ personnelId }),
					Personnel.deleteOne({ personnelId }),
				])
			}
			throw error
		}
	}

	const updateAccount = async (accountId, payload, { ipAddress } = {}) => {
		const user = await User.findById(accountId)
		if (!user) throw createHttpError('Account not found.', 404)
		const isSupervisor = user.role === 'supervisor'

		validateAccountPayload(payload, {
			requirePassword: false,
			requirePersonnel: !isSupervisor,
		})

		if (isSupervisor) {
			user.username = String(payload.loginId).trim().toLowerCase()
			const nextEmail = String(payload.officialEmail).trim().toLowerCase()
			if (user.email !== nextEmail) {
				user.email = nextEmail
				user.emailVerifiedAt = null
			}
			user.status = normalizeStatus(payload.accountStatus)
			if (payload.temporaryPassword) {
				user.passwordHash = await hashPassword(payload.temporaryPassword)
				user.forcePasswordReset = true
			}

			await user.save()
			await AuditLog.create({
				action: 'account.updated',
				entityType: 'user',
				entityId: String(user._id),
				changes: { role: user.role },
				ipAddress,
			})

			await broadcastAccountData()
			return serializeAccount(user, null, null)
		}

		const [profile, currentAssignment] = await Promise.all([
			Personnel.findOne({ personnelId: user.personnelId }),
			GpsDeviceAssignment.findOne({
				personnelId: user.personnelId,
				status: 'active',
			}),
		])
		if (!profile) throw createHttpError('Personnel profile not found.', 404)

		let assignment = currentAssignment
		const deviceChanged = (
			!currentAssignment
			|| currentAssignment.imei !== String(payload.imei)
			|| currentAssignment.flespiDeviceId !== String(payload.flespiDeviceId)
		)

		if (deviceChanged) {
			const device = await validateRegisteredDevice(payload)
			if (currentAssignment) {
				currentAssignment.status = 'released'
				currentAssignment.unassignedAt = new Date()
				await currentAssignment.save()
			}
			assignment = await GpsDeviceAssignment.create({
				assignmentId: `GPS-${randomUUID()}`,
				personnelId: user.personnelId,
				flespiDeviceId: device.id,
				imei: device.imei,
				deviceName: device.name,
				assignedBy: 'supervisor',
			})
		}

		profile.fullName = String(payload.fullName).trim()
		profile.badgeNumber = String(payload.badgeNumber).trim()
		profile.rank = String(payload.rank).trim()
		profile.mobileNumber = String(payload.mobileNumber || '').trim()
		profile.status = normalizeStatus(payload.accountStatus)

		user.username = String(payload.loginId).trim().toLowerCase()
		const nextEmail = String(payload.officialEmail).trim().toLowerCase()
		if (user.email !== nextEmail) {
			user.email = nextEmail
			user.emailVerifiedAt = null
		}
		user.status = normalizeStatus(payload.accountStatus)
		if (payload.temporaryPassword) {
			user.passwordHash = await hashPassword(payload.temporaryPassword)
			user.forcePasswordReset = true
		}

		await Promise.all([
			profile.save(),
			user.save(),
			Deployment.updateMany(
				{ personnelId: user.personnelId },
				{
					$set: {
						personnelName: profile.fullName,
						rank: profile.rank,
					},
				},
			),
			Task.updateMany(
				{ requestedBy: user.personnelId },
				{ $set: { requesterName: profile.fullName } },
			),
			Report.updateMany(
				{ submittedBy: user.personnelId },
				{ $set: { officerName: profile.fullName } },
			),
		])
		await AuditLog.create({
			action: 'account.updated',
			entityType: 'user',
			entityId: String(user._id),
			changes: {
				personnelId: user.personnelId,
				deviceChanged,
			},
			ipAddress,
		})

		await broadcastAccountData({
			personnelId: user.personnelId,
			name: profile.fullName,
			rank: profile.rank,
		})
		return serializeAccount(user, profile, assignment)
	}

	const deactivateAccount = async (accountId, { ipAddress } = {}) => {
		const user = await User.findById(accountId)
		if (!user) throw createHttpError('Account not found.', 404)

		const now = new Date()
		user.status = 'inactive'
		await Promise.all([
			user.save(),
			Personnel.updateOne(
				{ personnelId: user.personnelId },
				{ $set: { status: 'inactive', dutyStatus: 'Off Duty' } },
			),
			GpsDeviceAssignment.updateMany(
				{ personnelId: user.personnelId, status: 'active' },
				{ $set: { status: 'released', unassignedAt: now } },
			),
		])
		await AuditLog.create({
			action: 'account.deactivated',
			entityType: 'user',
			entityId: String(user._id),
			changes: { personnelId: user.personnelId },
			ipAddress,
		})

		await broadcastAccountData()
		return {
			message: 'Account deactivated and GPS assignment released.',
		}
	}

	return {
		createAccount,
		deactivateAccount,
		loadAccounts,
		updateAccount,
	}
}

module.exports = createAccountService
