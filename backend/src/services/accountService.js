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
const {
	FIELD_LIMITS,
	normalizeBadgeNumber,
	normalizeEmail,
	normalizeHumanName,
	normalizeLoginId,
	normalizeMobileNumber,
	validateBadgeNumber,
	validateFullName,
	validateLoginId,
	validateMobileNumber,
	validateOfficialEmail,
	validateRank,
} = require('../utils/accountValidation')
const { fetchRegisteredDevices } = require('./flespiService')
const { toMediaAccessPath } = require('./mediaStorageService')
const { createNotification } = require('./notificationService')

const normalizeStatus = (status) => (
	String(status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active'
)

const createHttpError = (message, status = 400, code, field) => {
	const error = new Error(message)
	error.status = status
	if (code) error.code = code
	if (field) error.field = field
	return error
}

const assertValidField = (field, message) => {
	if (message) {
		throw createHttpError(message, 400, 'INVALID_ACCOUNT_FIELD', field)
	}
}

const serializeAccount = (user, profile, device) => ({
	id: String(user._id),
	personnelId: user.personnelId,
	fullName: profile?.fullName || '',
	badgeNumber: profile?.badgeNumber || '',
	rank: profile?.rank || '',
	mobileNumber: profile?.mobileNumber || '',
	photoUrl: toMediaAccessPath(profile?.photoUrl || user.photoUrl || ''),
	loginId: user.username,
	officialEmail: user.email || '',
	emailVerified: Boolean(user.emailVerifiedAt),
	role: user.role === 'officer' ? 'Officer' : 'Supervisor',
	isMockAccount: Boolean(user.isMockAccount),
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
	{
		requirePassword = true,
		requirePersonnel = true,
		requireDevice = requirePersonnel,
		existingLoginId = '',
	} = {},
) => {
	const requiredFields = requirePersonnel
		? [
			['fullName', 'Full name'],
			['badgeNumber', 'Badge number'],
			['rank', 'Rank'],
			['loginId', 'Login ID'],
			['officialEmail', 'Official email'],
			...(requireDevice ? [
				['imei', 'GPS device ID'],
				['flespiDeviceId', 'Flespi device'],
			] : []),
		]
		: [
			['loginId', 'Login ID'],
			['officialEmail', 'Official email'],
		]

	for (const [field, label] of requiredFields) {
		if (!String(payload[field] || '').trim()) {
			throw createHttpError(`${label} is required.`, 400, 'INVALID_ACCOUNT_FIELD', field)
		}
	}

	if (requirePersonnel) {
		assertValidField('fullName', validateFullName(payload.fullName))
		assertValidField('badgeNumber', validateBadgeNumber(payload.badgeNumber))
		assertValidField('rank', validateRank(payload.rank))
		assertValidField('mobileNumber', validateMobileNumber(payload.mobileNumber))
	}
	assertValidField('loginId', validateLoginId(payload.loginId, {
		accountType: requirePersonnel ? 'officer' : 'supervisor',
		existingLoginId,
	}))
	assertValidField('officialEmail', validateOfficialEmail(payload.officialEmail))

	const password = String(payload.temporaryPassword || '')
	if (requirePassword && !password) {
		throw createHttpError('Enter a temporary password.', 400, 'INVALID_ACCOUNT_FIELD', 'temporaryPassword')
	}
	if (password && !isStrongPassword(password)) {
		throw createHttpError(
			`Use 10-${FIELD_LIMITS.password} characters, including an uppercase letter, lowercase letter, number, and symbol.`,
			400,
			'INVALID_ACCOUNT_FIELD',
			'temporaryPassword',
		)
	}

	if (payload.accountStatus && !['active', 'inactive'].includes(String(payload.accountStatus).toLowerCase())) {
		throw createHttpError('Select a valid account status.', 400, 'INVALID_ACCOUNT_FIELD', 'accountStatus')
	}

	const hasImei = Boolean(String(payload.imei || '').trim())
	const hasFlespiDeviceId = Boolean(String(payload.flespiDeviceId || '').trim())
	if (hasImei !== hasFlespiDeviceId) {
		throw createHttpError('Select both parts of a registered GPS device.')
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
			io.to('role:supervisor').emit('personnel:identity-updated', identity)
			io.to(`personnel:${identity.personnelId}`).emit('personnel:identity-updated', identity)
		}
		if (personnelService) {
			personnelService.emitPersonnelCollection(
				io,
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

	const getAccountPhotoReference = async (accountId) => {
		const user = await User.findById(accountId).select('role personnelId photoUrl').lean()
		if (!user) throw createHttpError('Account not found.', 404)
		if (user.role !== 'officer' || !user.personnelId) return user.photoUrl || ''
		const profile = await Personnel.findOne({ personnelId: user.personnelId })
			.select('photoUrl')
			.lean()
		return profile?.photoUrl || user.photoUrl || ''
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
				badgeNumber: normalizeBadgeNumber(payload.badgeNumber),
				fullName: normalizeHumanName(payload.fullName),
				rank: payload.rank,
				mobileNumber: normalizeMobileNumber(payload.mobileNumber),
				photoUrl: payload.photoUrl || '',
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
				username: normalizeLoginId(payload.loginId),
				email: normalizeEmail(payload.officialEmail),
				passwordHash: await hashPassword(payload.temporaryPassword),
				role: 'officer',
				personnelId,
				photoUrl: payload.photoUrl || '',
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
			requireDevice: !isSupervisor && !user.isMockAccount,
			existingLoginId: user.username,
		})

		if (isSupervisor) {
			user.username = normalizeLoginId(payload.loginId)
			const nextEmail = normalizeEmail(payload.officialEmail)
			if (user.email !== nextEmail) {
				user.email = nextEmail
				user.emailVerifiedAt = null
			}
			user.status = normalizeStatus(payload.accountStatus)
			if (payload.photoUrl) user.photoUrl = payload.photoUrl
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
		const requestedImei = String(payload.imei || '').trim()
		const requestedFlespiDeviceId = String(payload.flespiDeviceId || '').trim()
		const wantsDevice = Boolean(requestedImei && requestedFlespiDeviceId)
		const deviceChanged = wantsDevice
			? (
				!currentAssignment
				|| currentAssignment.imei !== requestedImei
				|| currentAssignment.flespiDeviceId !== requestedFlespiDeviceId
			)
			: Boolean(currentAssignment)

		if (deviceChanged && wantsDevice) {
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
		} else if (deviceChanged && user.isMockAccount) {
			currentAssignment.status = 'released'
			currentAssignment.unassignedAt = new Date()
			await currentAssignment.save()
			assignment = null
		}

		profile.fullName = normalizeHumanName(payload.fullName)
		profile.badgeNumber = normalizeBadgeNumber(payload.badgeNumber)
		profile.rank = String(payload.rank).trim()
		profile.mobileNumber = normalizeMobileNumber(payload.mobileNumber)
		if (payload.photoUrl) profile.photoUrl = payload.photoUrl
		profile.status = normalizeStatus(payload.accountStatus)

		user.username = normalizeLoginId(payload.loginId)
		const nextEmail = normalizeEmail(payload.officialEmail)
		if (user.email !== nextEmail) {
			user.email = nextEmail
			user.emailVerifiedAt = null
		}
		user.status = normalizeStatus(payload.accountStatus)
		if (payload.photoUrl) user.photoUrl = payload.photoUrl
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
			photoUrl: toMediaAccessPath(profile.photoUrl),
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
		getAccountPhotoReference,
		loadAccounts,
		updateAccount,
	}
}

module.exports = createAccountService
