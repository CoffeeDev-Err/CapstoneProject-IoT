const mongoose = require('mongoose')
const model = require('./modelFactory')

const userSchema = new mongoose.Schema({
	username: { type: String, required: true, trim: true, lowercase: true, maxlength: 50 },
	email: { type: String, trim: true, lowercase: true, maxlength: 254 },
	fullName: { type: String, trim: true, default: '', maxlength: 100 },
	rank: { type: String, trim: true, default: '', maxlength: 80 },
	emailVerifiedAt: Date,
	passwordHash: { type: String, required: true, select: false },
	role: { type: String, enum: ['supervisor', 'officer'], default: 'officer' },
	personnelId: { type: String, trim: true, maxlength: 100 },
	photoUrl: { type: String, trim: true, default: '', maxlength: 2048 },
	isMockAccount: { type: Boolean, default: false },
	status: { type: String, enum: ['active', 'inactive'], default: 'active' },
	forcePasswordReset: { type: Boolean, default: true },
	lastLoginAt: Date,
}, {
	collection: 'users',
	timestamps: true,
})
userSchema.index({ username: 1 }, { unique: true })
userSchema.index(
	{ email: 1 },
	{ unique: true, partialFilterExpression: { email: { $type: 'string' } } },
)
userSchema.index({ personnelId: 1 })
userSchema.index({ status: 1 })

const authSessionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	refreshTokenHash: { type: String, required: true, select: false },
	deviceName: String,
	lastUsedAt: { type: Date, default: Date.now },
	expiresAt: { type: Date, required: true },
	revokedAt: Date,
}, {
	collection: 'auth_sessions',
	timestamps: true,
})
authSessionSchema.index({ userId: 1, expiresAt: -1 })
authSessionSchema.index({ refreshTokenHash: 1 }, { unique: true })
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const emailVerificationSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	email: { type: String, required: true, trim: true, lowercase: true },
	purpose: {
		type: String,
		enum: ['verify_email', 'login', 'reset_password', 'change_password'],
		required: true,
	},
	otpHash: { type: String, required: true, select: false },
	attempts: { type: Number, default: 0 },
	maxAttempts: { type: Number, default: 5 },
	expiresAt: { type: Date, required: true },
	consumedAt: Date,
	requestIp: String,
	deviceName: String,
}, {
	collection: 'email_verifications',
	timestamps: true,
})
emailVerificationSchema.index({ userId: 1, purpose: 1, createdAt: -1 })
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = {
	User: model('User', userSchema),
	AuthSession: model('AuthSession', authSessionSchema),
	EmailVerification: model('EmailVerification', emailVerificationSchema),
}
