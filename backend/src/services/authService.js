const { createHash, randomBytes } = require('crypto')
const {
	AuthSession,
	EmailVerification,
	Personnel,
	User,
} = require('../models')
const {
	hashPassword,
	isStrongPassword,
	verifyPassword,
} = require('../utils/password')
const {
	createCode,
	hashCode,
	maskEmail,
	verifyCodeHash,
} = require('../utils/verification')
const { sendVerificationCode } = require('./emailService')

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const OTP_DURATION_MS = 10 * 60 * 1000
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000
const OTP_RATE_LIMIT = 3
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const serializeUser = (user, profile) => ({
	id: String(user._id),
	username: user.username,
	email: user.email || '',
	emailVerified: Boolean(user.emailVerifiedAt),
	role: user.role,
	personnelId: user.personnelId,
	photoUrl: profile?.photoUrl || user.photoUrl || '',
	forcePasswordReset: user.forcePasswordReset,
	createdAt: user.createdAt?.toISOString(),
	lastLoginAt: user.lastLoginAt?.toISOString(),
	profile: profile ? {
		fullName: profile.fullName,
		badgeNumber: profile.badgeNumber,
		rank: profile.rank,
		mobileNumber: profile.mobileNumber,
		photoUrl: profile.photoUrl || user.photoUrl || '',
		dutyStatus: profile.dutyStatus,
	} : null,
})

const createAuthError = (message, status = 401, code = 'AUTHENTICATION_FAILED') => {
	const error = new Error(message)
	error.status = status
	error.code = code
	return error
}

const getAccountEmail = async (user) => {
	let email = String(user.email || '').trim().toLowerCase()
	if (!email && String(user.username).includes('@')) {
		email = String(user.username).trim().toLowerCase()
	}
	if (!email && user.role === 'supervisor') {
		email = String(process.env.SUPERVISOR_EMAIL || '').trim().toLowerCase()
	}
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw createAuthError(
			'No official email is configured for this account. Contact the supervisor.',
			409,
			'EMAIL_NOT_CONFIGURED',
		)
	}
	if (!user.email) {
		user.email = email
		await user.save()
	}
	return email
}

const createVerificationChallenge = async (
	user,
	purpose,
	{ deviceName, requestIp } = {},
) => {
	const email = await getAccountEmail(user)
	const recentCount = await EmailVerification.countDocuments({
		userId: user._id,
		createdAt: { $gte: new Date(Date.now() - OTP_RATE_WINDOW_MS) },
	})
	if (recentCount >= OTP_RATE_LIMIT) {
		throw createAuthError(
			'Too many verification codes were requested. Please wait 15 minutes before trying again.',
			429,
			'OTP_RATE_LIMITED',
		)
	}

	await EmailVerification.updateMany(
		{ userId: user._id, purpose, consumedAt: null },
		{ $set: { consumedAt: new Date() } },
	)

	const code = createCode()
	const challenge = await EmailVerification.create({
		userId: user._id,
		email,
		purpose,
		otpHash: hashCode(code),
		expiresAt: new Date(Date.now() + OTP_DURATION_MS),
		requestIp,
		deviceName: String(deviceName || 'Unknown device'),
	})

	try {
		const delivery = await sendVerificationCode({ email, code, purpose })
		return {
			challengeId: String(challenge._id),
			maskedEmail: maskEmail(email),
			expiresAt: challenge.expiresAt.toISOString(),
			debugCode: delivery.debugCode,
		}
	} catch (error) {
		await EmailVerification.deleteOne({ _id: challenge._id })
		throw error
	}
}

const consumeChallenge = async (
	challengeId,
	code,
	{ purposes, userId } = {},
) => {
	if (!challengeId || !/^\d{6}$/.test(String(code || ''))) {
		throw createAuthError(
			'Enter the complete 6-digit verification code.',
			400,
			'INVALID_OTP_INPUT',
		)
	}
	let challenge
	try {
		challenge = await EmailVerification.findById(challengeId).select('+otpHash')
	} catch {
		throw createAuthError(
			'This verification request is no longer valid. Request a new code.',
			400,
			'INVALID_OTP',
		)
	}
	const acceptedPurposes = Array.isArray(purposes) ? purposes : [purposes].filter(Boolean)
	const belongsToUser = !userId || String(challenge?.userId) === String(userId)
	if (
		!challenge
		|| challenge.consumedAt
		|| !belongsToUser
		|| (acceptedPurposes.length > 0 && !acceptedPurposes.includes(challenge.purpose))
	) {
		throw createAuthError(
			'This verification request is no longer valid. Request a new code.',
			400,
			'INVALID_OTP',
		)
	}
	if (challenge.expiresAt <= new Date()) {
		throw createAuthError(
			'This verification code has expired. Request a new code.',
			400,
			'EXPIRED_OTP',
		)
	}
	if (challenge.attempts >= challenge.maxAttempts) {
		throw createAuthError(
			'Too many incorrect attempts. Request a new code to continue.',
			429,
			'OTP_ATTEMPTS_EXCEEDED',
		)
	}
	if (!verifyCodeHash(code, challenge.otpHash)) {
		challenge.attempts += 1
		if (challenge.attempts >= challenge.maxAttempts) challenge.consumedAt = new Date()
		await challenge.save()
		throw createAuthError(
			'The verification code is incorrect. Check the code and try again.',
			400,
			'INVALID_OTP',
		)
	}

	challenge.consumedAt = new Date()
	await challenge.save()
	return challenge
}

const createSession = async (user, deviceName) => {
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

const login = async (
	{
		username,
		password,
		device_name: deviceName,
		application,
	} = {},
	{ requestIp } = {},
) => {
	const normalizedUsername = String(username || '').trim().toLowerCase()
	if (!normalizedUsername || !password) {
		throw createAuthError('Login ID and password are required.', 400, 'INVALID_LOGIN_INPUT')
	}

	const user = await User.findOne({
		username: normalizedUsername,
		status: 'active',
	}).select('+passwordHash')
	if (!user || !(await verifyPassword(password, user.passwordHash))) {
		throw createAuthError('Invalid Login ID or password.')
	}
	if (application === 'web' && user.role !== 'supervisor') {
		throw createAuthError('This account is assigned to the police mobile app.', 403, 'WRONG_APPLICATION')
	}
	if (application === 'mobile' && user.role !== 'officer') {
		throw createAuthError('Supervisor accounts must sign in through the web portal.', 403, 'WRONG_APPLICATION')
	}

	const purpose = user.emailVerifiedAt ? 'login' : 'verify_email'
	const challenge = await createVerificationChallenge(user, purpose, {
		deviceName,
		requestIp,
	})
	return {
		requiresVerification: true,
		purpose,
		...challenge,
	}
}

const verifyLogin = async (
	{ challenge_id: challengeId, code, device_name: deviceName } = {},
) => {
	const challenge = await consumeChallenge(challengeId, code, {
		purposes: ['login', 'verify_email'],
	})
	const user = await User.findOne({ _id: challenge.userId, status: 'active' })
	if (!user) throw createAuthError('Account is inactive or unavailable.')

	if (challenge.purpose === 'verify_email' && !user.emailVerifiedAt) {
		user.emailVerifiedAt = new Date()
	}
	return createSession(user, deviceName || challenge.deviceName)
}

const resendVerification = async (
	{ challenge_id: challengeId, device_name: deviceName } = {},
	{ requestIp } = {},
) => {
	let previous
	try {
		previous = await EmailVerification.findById(challengeId)
	} catch {
		throw createAuthError(
			'This verification request is no longer valid. Start again to request a new code.',
			400,
			'INVALID_OTP',
		)
	}
	if (!previous) {
		throw createAuthError(
			'This verification request is no longer valid. Start again to request a new code.',
			400,
			'INVALID_OTP',
		)
	}
	const user = await User.findOne({ _id: previous.userId, status: 'active' })
	if (!user) throw createAuthError('Account is inactive or unavailable.')
	return createVerificationChallenge(user, previous.purpose, {
		deviceName: deviceName || previous.deviceName,
		requestIp,
	})
}

const requestPasswordReset = async (
	{ identifier, device_name: deviceName } = {},
	{ requestIp } = {},
) => {
	const normalizedIdentifier = String(identifier || '').trim().toLowerCase()
	if (!normalizedIdentifier) {
		throw createAuthError(
			'Login ID or official email is required.',
			400,
			'INVALID_RESET_INPUT',
		)
	}
	const user = await User.findOne({
		status: 'active',
		$or: [
			{ username: normalizedIdentifier },
			{ email: normalizedIdentifier },
		],
	})
	if (!user) {
		return {
			accepted: true,
			message: 'If the account exists, a verification code was sent.',
		}
	}
	const challenge = await createVerificationChallenge(user, 'reset_password', {
		deviceName,
		requestIp,
	})
	return {
		accepted: true,
		message: 'If the account exists, a verification code was sent.',
		...challenge,
	}
}

const resetPassword = async (
	{ challenge_id: challengeId, code, new_password: newPassword } = {},
) => {
	if (!isStrongPassword(String(newPassword || ''))) {
		throw createAuthError(
			'Use at least 10 characters, including an uppercase letter, lowercase letter, number, and symbol.',
			400,
			'WEAK_PASSWORD',
		)
	}
	const challenge = await consumeChallenge(challengeId, code, {
		purposes: ['reset_password'],
	})
	const user = await User.findById(challenge.userId).select('+passwordHash')
	if (!user || user.status !== 'active') {
		throw createAuthError('Account is inactive or unavailable.')
	}
	user.passwordHash = await hashPassword(newPassword)
	user.forcePasswordReset = false
	if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date()
	await Promise.all([
		user.save(),
		AuthSession.updateMany(
			{ userId: user._id, revokedAt: null },
			{ $set: { revokedAt: new Date() } },
		),
	])
	return { success: true }
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
	const lastUsedAt = session.lastUsedAt?.getTime() || 0
	if (Date.now() - lastUsedAt >= SESSION_TOUCH_INTERVAL_MS) {
		const touchedAt = new Date()
		await AuthSession.updateOne(
			{ _id: session._id },
			{ $set: { lastUsedAt: touchedAt } },
		)
		session.lastUsedAt = touchedAt
	}
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

const requestPasswordChange = async (
	user,
	{ current_password: currentPassword, device_name: deviceName } = {},
	{ requestIp } = {},
) => {
	if (!String(currentPassword || '')) {
		throw createAuthError(
			'Enter your current password.',
			400,
			'CURRENT_PASSWORD_REQUIRED',
		)
	}
	const securedUser = await User.findById(user._id).select('+passwordHash')
	if (!securedUser || !(await verifyPassword(String(currentPassword || ''), securedUser.passwordHash))) {
		throw createAuthError('The current password is incorrect. Try again.')
	}
	return createVerificationChallenge(securedUser, 'change_password', {
		deviceName,
		requestIp,
	})
}

const changePassword = async (user, payload = {}) => {
	const newPassword = String(payload.new_password || '')
	if (!isStrongPassword(newPassword)) {
		throw createAuthError(
			'Use at least 10 characters, including an uppercase letter, lowercase letter, number, and symbol.',
			400,
			'WEAK_PASSWORD',
		)
	}
	const securedUser = await User.findById(user._id).select('+passwordHash')
	if (!securedUser) throw createAuthError('Account is unavailable.')
	if (await verifyPassword(newPassword, securedUser.passwordHash)) {
		throw createAuthError(
			'Your new password must be different from your current password.',
			400,
			'PASSWORD_REUSED',
		)
	}
	await consumeChallenge(payload.challenge_id, payload.code, {
		purposes: ['change_password'],
		userId: user._id,
	})
	securedUser.passwordHash = await hashPassword(newPassword)
	securedUser.forcePasswordReset = false
	await Promise.all([
		securedUser.save(),
		AuthSession.updateMany(
			{ userId: securedUser._id, revokedAt: null },
			{ $set: { revokedAt: new Date() } },
		),
	])
	return getCurrentUser(securedUser)
}

module.exports = {
	authenticate,
	changePassword,
	getCurrentUser,
	login,
	logout,
	requestPasswordChange,
	requestPasswordReset,
	resendVerification,
	resetPassword,
	verifyLogin,
}
