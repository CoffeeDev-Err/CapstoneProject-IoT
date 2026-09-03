require('dotenv').config()

const mongoose = require('mongoose')
const {
	AuthSession,
	EmailVerification,
	User,
} = require('../src/models')
const { LOGIN_ID_PATTERN } = require('../src/utils/accountValidation')

const apply = process.argv.includes('--apply')
const desiredLoginId = String(process.env.SUPERVISOR_LOGIN_ID || '').trim().toLowerCase()

const fail = (message) => {
	throw new Error(message)
}

const main = async () => {
	if (!LOGIN_ID_PATTERN.test(desiredLoginId)) {
		fail('SUPERVISOR_LOGIN_ID must use the NN-NNNN format.')
	}
	if (!/^mongodb(?:\+srv)?:\/\//i.test(String(process.env.MONGO_URI || ''))) {
		fail('MONGO_URI is missing or invalid.')
	}

	await mongoose.connect(process.env.MONGO_URI)
	const supervisors = await User.find({ role: 'supervisor' })
		.select('username role status forcePasswordReset lastLoginAt createdAt')
		.sort({ createdAt: 1 })
		.lean()
	const desiredAccount = supervisors.find((user) => user.username === desiredLoginId)
	const legacyCandidates = supervisors.filter((user) => (
		user.username !== desiredLoginId
		&& user.status === 'active'
		&& user.forcePasswordReset === false
	))

	if (desiredAccount && legacyCandidates.length === 0) {
		console.log(`Supervisor Login ID ${desiredLoginId} is already reconciled.`)
		return
	}
	if (legacyCandidates.length !== 1) {
		fail(`Expected exactly one established active supervisor; found ${legacyCandidates.length}.`)
	}

	const establishedAccount = legacyCandidates[0]
	if (desiredAccount) {
		if (!desiredAccount.forcePasswordReset || desiredAccount.lastLoginAt) {
			fail(`The ${desiredLoginId} account has been used and cannot be retired automatically.`)
		}
		console.log(
			`Plan: remove unused duplicate ${desiredLoginId}, then rename `
			+ `${establishedAccount.username} to ${desiredLoginId}.`,
		)
	} else {
		console.log(`Plan: rename ${establishedAccount.username} to ${desiredLoginId}.`)
	}

	if (!apply) {
		console.log('Dry run only. Re-run with --apply after reviewing this plan.')
		return
	}

	let retiredLoginId = ''
	if (desiredAccount) {
		retiredLoginId = `retired-${String(desiredAccount._id).slice(-8)}-${Date.now()}`
		const retired = await User.updateOne(
			{
				_id: desiredAccount._id,
				username: desiredLoginId,
				forcePasswordReset: true,
				lastLoginAt: null,
			},
			{
				$set: { username: retiredLoginId, status: 'inactive' },
				$unset: { email: 1 },
			},
		)
		if (retired.modifiedCount !== 1) {
			fail('The duplicate supervisor changed during reconciliation; no Login ID was moved.')
		}
	}

	const migrated = await User.updateOne(
		{
			_id: establishedAccount._id,
			username: establishedAccount.username,
			role: 'supervisor',
			status: 'active',
		},
		{ $set: { username: desiredLoginId } },
	)
	if (migrated.modifiedCount !== 1) {
		fail('The established supervisor changed during reconciliation; run the dry check again.')
	}
	if (desiredAccount) {
		await Promise.all([
			AuthSession.deleteMany({ userId: desiredAccount._id }),
			EmailVerification.deleteMany({ userId: desiredAccount._id }),
		])
		const removed = await User.deleteOne({
			_id: desiredAccount._id,
			username: retiredLoginId,
			status: 'inactive',
			forcePasswordReset: true,
			lastLoginAt: null,
		})
		if (removed.deletedCount !== 1) {
			console.warn('The unused duplicate is inactive but could not be removed automatically.')
		}
	}
	console.log(`Reconciled established supervisor Login ID to ${desiredLoginId}.`)
}

main()
	.catch((error) => {
		console.error(`Supervisor Login ID reconciliation failed: ${error.message}`)
		process.exitCode = 1
	})
	.finally(async () => {
		await mongoose.disconnect().catch(() => {})
	})
