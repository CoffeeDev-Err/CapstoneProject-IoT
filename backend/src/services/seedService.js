const { Barangay, User } = require('../models')
const { hashPassword } = require('../utils/password')
const { CABAGAN_BARANGAYS } = require('../constants/cabaganBarangays')
const { LOGIN_ID_PATTERN } = require('../utils/accountValidation')

const point = (longitude, latitude) => ({
	type: 'Point',
	coordinates: [longitude, latitude],
})

const KNOWN_BARANGAY_CENTERS = {
	CENTRO: [121.7681, 17.4239],
	CUBAG: [121.7658, 17.4272],
	GARITA: [121.7762, 17.4148],
	'SAN-JUAN': [121.7546, 17.4192],
}

const initializeCollections = async (models) => {
	for (const model of Object.values(models)) {
		await model.createCollection()
		await model.createIndexes()
	}
}

const findProvisionedSupervisor = async ({ username, email }, userModel = User) => {
	const primary = await userModel.findOne({ supervisorAuthority: 'primary' })
	if (primary) return primary
	const emailMatch = email ? await userModel.findOne({ email }) : null
	if (emailMatch) {
		if (emailMatch.role !== 'supervisor') throw new Error('The configured supervisor email belongs to another role.')
		return emailMatch
	}
	const usernameMatch = username ? await userModel.findOne({ username }) : null
	if (usernameMatch) {
		if (usernameMatch.role !== 'supervisor') throw new Error('The configured supervisor Login ID belongs to another role.')
		return usernameMatch
	}
	const supervisors = await userModel.find({ role: 'supervisor' }).limit(2)
	if (supervisors.length > 1) {
		throw new Error(
			'Multiple supervisor accounts exist but none matches the configured Login ID or email.',
		)
	}
	return supervisors[0] || null
}

const migrateProvisionedLoginId = async (
	user,
	desiredLoginId,
	expectedRole,
	userModel = User,
) => {
	if (!user || user.username === desiredLoginId) return false
	if (user.role !== expectedRole) {
		throw new Error(`The configured ${expectedRole} identity belongs to a different account role.`)
	}
	const conflict = await userModel.findOne({
		username: desiredLoginId,
		_id: { $ne: user._id },
	}).select('_id').lean()
	if (conflict) {
		throw new Error(`Login ID ${desiredLoginId} is already assigned to another account.`)
	}
	const previousLoginId = user.username
	user.username = desiredLoginId
	console.log(`Migrated ${expectedRole} Login ID from ${previousLoginId} to ${desiredLoginId}`)
	return true
}

const requireProvisionedLoginId = (loginId, label) => {
	if (loginId && !LOGIN_ID_PATTERN.test(loginId)) {
		throw new Error(`${label} must use the NN-NNNN format, such as 12-2004.`)
	}
}

const seedDatabase = async (models) => {
	await initializeCollections(models)

	const supervisorLoginId = String(process.env.SUPERVISOR_LOGIN_ID || '').trim().toLowerCase()
	const supervisorEmail = String(process.env.SUPERVISOR_EMAIL || '').trim().toLowerCase()
	const supervisorPassword = String(process.env.SUPERVISOR_TEMP_PASSWORD || '')
	const supervisorFullName = String(process.env.SUPERVISOR_FULL_NAME || '').trim()
	const supervisorRank = String(process.env.SUPERVISOR_RANK || '').trim()
	requireProvisionedLoginId(supervisorLoginId, 'SUPERVISOR_LOGIN_ID')
	if (supervisorLoginId && supervisorEmail && supervisorPassword) {
		const existingSupervisor = await findProvisionedSupervisor({
			username: supervisorLoginId,
			email: supervisorEmail,
		})
		if (!existingSupervisor) {
			await User.create({
				username: supervisorLoginId,
				email: supervisorEmail,
				fullName: supervisorFullName,
				rank: supervisorRank,
				passwordHash: await hashPassword(supervisorPassword),
				role: 'supervisor',
				supervisorAuthority: 'primary',
				status: 'active',
				forcePasswordReset: true,
			})
			console.log(`Created initial supervisor account: ${supervisorLoginId}`)
		} else {
			const otherPrimary = await User.findOne({ supervisorAuthority: 'primary', _id: { $ne: existingSupervisor._id } })
			if (otherPrimary) throw new Error('A different primary supervisor account already exists.')
			const alreadyPrimary = existingSupervisor.supervisorAuthority === 'primary'
			existingSupervisor.supervisorAuthority = 'primary'
			if (!alreadyPrimary) await migrateProvisionedLoginId(existingSupervisor, supervisorLoginId, 'supervisor')
			if (!existingSupervisor.email) existingSupervisor.email = supervisorEmail
			if (supervisorFullName) existingSupervisor.fullName = supervisorFullName
			if (supervisorRank) existingSupervisor.rank = supervisorRank
			if (existingSupervisor.status !== 'active') existingSupervisor.status = 'active'
			await existingSupervisor.save()
		}
	}

	await Barangay.updateMany(
		{
			municipality: 'Cabagan',
			code: { $nin: CABAGAN_BARANGAYS.map(({ code }) => code) },
		},
		{ $set: { active: false } },
	)

	await Promise.all(CABAGAN_BARANGAYS.map(({ code, name, psgcCode }) => {
		const [longitude, latitude] = KNOWN_BARANGAY_CENTERS[code]
			|| [121.7681, 17.4239]
		return (
			Barangay.updateOne(
				{ code },
				{
					$set: {
						name,
						psgcCode,
						municipality: 'Cabagan',
						active: true,
					},
					$setOnInsert: {
						code,
						center: point(longitude, latitude),
					},
				},
				{ upsert: true },
			)
		)
	}))

}

module.exports = seedDatabase
module.exports.findProvisionedSupervisor = findProvisionedSupervisor
module.exports.migrateProvisionedLoginId = migrateProvisionedLoginId
module.exports.requireProvisionedLoginId = requireProvisionedLoginId
