const { createHash, randomBytes } = require('crypto')
const {
	AuthSession,
	Personnel,
	User,
} = require('../models')
const {
	hashPassword,
	isStrongPassword,
	verifyPassword,
} = require('../utils/password')

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const serializeUser = (user, profile) => ({
	id: String(user._id),
	username: user.username,
	role: user.role,
	personnelId: user.personnelId,
	forcePasswordReset: user.forcePasswordReset,
	profile: profile ? {
		fullName: profile.fullName,
		badgeNumber: profile.badgeNumber,
		rank: profile.rank,
		mobileNumber: profile.mobileNumber,
		photoUrl: profile.photoUrl,
		dutyStatus: profile.dutyStatus,
	} : null,
})

const createAuthError = (message, status = 401, code = 'AUTHENTICATION_FAILED') => {
	const error = new Error(message)
	error.status = status
	error.code = code
	return error
}

const login = async ({ username, password, device_name: deviceName } = {}) => {
	const normalizedUsername = String(username || '').trim().toLowerCase()
	if (!normalizedUsername || !password) {
		throw createAuthError('Username and password are required.', 400, 'INVALID_LOGIN_INPUT')
	}

	const user = await User.findOne({
		username: normalizedUsername,
		status: 'active',
	}).select('+passwordHash')
	if (!user || !(await verifyPassword(password, user.passwordHash))) {
		throw createAuthError('Invalid username or password.')
	}

	const token = randomBytes(48).toString('base64url')
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
	await AuthSession.create({
		userId: user._id,
		refreshTokenHash: hashToken(token),
		deviceName: String(deviceName || 'Unknown device'),
		lastUsedAt: new Date(),
		expiresAt,
	})
	user.lastLoginAt = new Date()
	await user.save()

	const profile = user.personnelId
		? await Personnel.findOne({ personnelId: user.personnelId }).lean()
		: null
	return {
		token,
		expiresAt: expiresAt.toISOString(),
		user: serializeUser(user, profile),
	}
}

const authenticate = async (token) => {
	if (!token) throw createAuthError('Authentication token is required.')
	const session = await AuthSession.findOne({
		refreshTokenHash: hashToken(token),
		revokedAt: null,
		expiresAt: { $gt: new Date() },
	})
	if (!session) throw createAuthError('Session is invalid or expired.')

	const user = await User.findOne({ _id: session.userId, status: 'active' })
	if (!user) throw createAuthError('Account is inactive or unavailable.')
	session.lastUsedAt = new Date()
	await session.save()

	return { session, user }
}

const getCurrentUser = async (user) => {
	const profile = user.personnelId
		? await Personnel.findOne({ personnelId: user.personnelId }).lean()
		: null
	return serializeUser(user, profile)
}

const logout = async (session) => {
	session.revokedAt = new Date()
	await session.save()
}

const changePassword = async (user, payload = {}) => {
	const currentPassword = String(payload.current_password || '')
	const newPassword = String(payload.new_password || '')
	if (!isStrongPassword(newPassword)) {
		throw createAuthError(
			'New password must have at least 10 characters with upper, lower, number, and symbol.',
			400,
			'WEAK_PASSWORD',
		)
	}

	const securedUser = await User.findById(user._id).select('+passwordHash')
	if (!securedUser || !(await verifyPassword(currentPassword, securedUser.passwordHash))) {
		throw createAuthError('Current password is incorrect.')
	}
	securedUser.passwordHash = await hashPassword(newPassword)
	securedUser.forcePasswordReset = false
	await securedUser.save()
	return getCurrentUser(securedUser)
}

module.exports = {
	authenticate,
	changePassword,
	getCurrentUser,
	login,
	logout,
}
