const {
	Barangay,
	CurrentLocation,
	Deployment,
	GpsDeviceAssignment,
	LocationHistory,
	Personnel,
	Report,
	Task,
	User,
} = require('../models')
const { hashPassword } = require('../utils/password')
const { CABAGAN_BARANGAYS } = require('../constants/cabaganBarangays')

const point = (longitude, latitude) => ({
	type: 'Point',
	coordinates: [longitude, latitude],
})

const gpsOfficerPersonnelId = String(
	process.env.DEMO_OFFICER_PERSONNEL_ID || 'pcpl-001',
).trim()
const gpsOfficerFullName = String(
	process.env.DEMO_OFFICER_FULL_NAME || 'GPS-Linked Officer',
).trim()

const mockOfficerEnabled = String(
	process.env.ENABLE_MOCK_OFFICER || '',
).trim().toLowerCase() === 'true'
const mockOfficerPersonnelId = String(
	process.env.MOCK_OFFICER_PERSONNEL_ID || 'psms-002',
).trim()
const mockOfficerFullName = String(
	process.env.MOCK_OFFICER_FULL_NAME || 'Backup Officer',
).trim()

const buildMockDeploymentSeedUpdate = () => ({
	$setOnInsert: {
		assignmentId: 'ASG-CENTRO-002',
		groupId: 'GRP-CENTRO-002',
		personnelId: mockOfficerPersonnelId,
		personnelName: mockOfficerFullName,
		rank: 'Police Staff Sergeant',
		barangayCode: 'CENTRO',
		patrolArea: 'Cabagan Municipal Hall',
		instructions: 'Maintain visibility around the municipal hall perimeter.',
		assignedBy: 'seed',
		assignedAt: new Date(),
		status: 'active',
		location: point(121.7683, 17.4213),
	},
})

const buildEmailAlias = (email, alias) => {
	const [localPart, domain] = String(email || '').trim().toLowerCase().split('@')
	if (!localPart || !domain) return ''
	const baseLocalPart = localPart.split('+')[0]
	return `${baseLocalPart}+${alias}@${domain}`
}

const seedPersonnel = [
	{
		personnelId: gpsOfficerPersonnelId,
		badgeNumber: 'P-1001',
		fullName: gpsOfficerFullName,
		rank: 'Police Corporal',
		dutyStatus: 'On Patrol',
		defaultLocationName: 'Cabagan Public Market',
		photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
	},
	{
		personnelId: mockOfficerPersonnelId,
		badgeNumber: 'P-1002',
		fullName: mockOfficerFullName,
		rank: 'Police Staff Sergeant',
		dutyStatus: 'Monitoring',
		defaultLocationName: 'Cabagan Municipal Hall',
		photoUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
	},
]

const seedLocations = [
	[mockOfficerPersonnelId, 'Cabagan Municipal Hall', 121.7683, 17.4213],
]

const LEGACY_SEEDED_PERSONNEL_IDS = ['pltc-003']

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

const findProvisionedUser = ({ username, email, personnelId }) => {
	const identities = [
		username && { username },
		email && { email },
		personnelId && { personnelId },
	].filter(Boolean)

	return identities.length
		? User.findOne({ $or: identities })
		: null
}

const removeLegacySeedData = async () => {
	await Promise.all([
		Personnel.deleteMany({ personnelId: { $in: LEGACY_SEEDED_PERSONNEL_IDS } }),
		CurrentLocation.deleteMany({ personnelId: { $in: LEGACY_SEEDED_PERSONNEL_IDS } }),
		LocationHistory.deleteMany({ personnelId: { $in: LEGACY_SEEDED_PERSONNEL_IDS } }),
		GpsDeviceAssignment.deleteMany({
			personnelId: { $in: LEGACY_SEEDED_PERSONNEL_IDS },
		}),
		Deployment.deleteMany({
			assignmentId: { $in: ['ASG-DEMO-2', 'ASG-MOCK-BACKUP'] },
		}),
		Report.deleteMany({
			reportNumber: { $in: ['RPT-MOB-001', 'RPT-MOB-002'] },
		}),
		Task.deleteMany({ taskId: { $in: ['TSK-001', 'TSK-002'] } }),
		User.deleteMany({ personnelId: { $in: LEGACY_SEEDED_PERSONNEL_IDS } }),
		Task.updateMany(
			{},
			{
				$pull: {
					responders: {
						personnelId: { $in: LEGACY_SEEDED_PERSONNEL_IDS },
					},
				},
			},
		),
	])
}

const configureDemoGpsAssignment = async (personnelId) => {
	const flespiDeviceId = String(process.env.DEMO_GPS_FLESPI_DEVICE_ID || '').trim()
	const deviceIdent = String(process.env.DEMO_GPS_DEVICE_IDENT || '').trim()
	const deviceName = String(process.env.DEMO_GPS_DEVICE_NAME || 'GPS-001').trim()

	if (!personnelId || !flespiDeviceId || !deviceIdent) return

	const conflictingAssignment = await GpsDeviceAssignment.findOne({
		status: 'active',
		$or: [
			{ personnelId },
			{ flespiDeviceId },
			{ imei: deviceIdent },
		],
	}).lean()

	if (conflictingAssignment && conflictingAssignment.personnelId !== personnelId) {
		console.warn(
			`Demo GPS device is already assigned to ${conflictingAssignment.personnelId}; `
			+ `skipping automatic assignment to ${personnelId}.`,
		)
		return
	}

	await GpsDeviceAssignment.updateOne(
		{ assignmentId: conflictingAssignment?.assignmentId || 'GPS-DEMO-001' },
		{
			$set: {
				personnelId,
				flespiDeviceId,
				imei: deviceIdent,
				deviceName,
				assignedBy: 'seed',
				status: 'active',
				unassignedAt: null,
			},
			$setOnInsert: {
				assignmentId: 'GPS-DEMO-001',
				assignedAt: new Date(),
			},
		},
		{ upsert: true },
	)

	await Promise.all([
		CurrentLocation.deleteMany({ personnelId, source: 'mock' }),
		LocationHistory.deleteMany({ personnelId, source: 'mock' }),
	])
}

const seedDatabase = async (models) => {
	await initializeCollections(models)
	await removeLegacySeedData()

	const supervisorLoginId = String(process.env.SUPERVISOR_LOGIN_ID || '').trim().toLowerCase()
	const supervisorEmail = String(process.env.SUPERVISOR_EMAIL || '').trim().toLowerCase()
	const supervisorPassword = String(process.env.SUPERVISOR_TEMP_PASSWORD || '')
	if (supervisorLoginId && supervisorEmail && supervisorPassword) {
		const existingSupervisor = await findProvisionedUser({
			username: supervisorLoginId,
			email: supervisorEmail,
		})
		if (!existingSupervisor) {
			await User.create({
				username: supervisorLoginId,
				email: supervisorEmail,
				passwordHash: await hashPassword(supervisorPassword),
				role: 'supervisor',
				status: 'active',
				forcePasswordReset: true,
			})
			console.log(`Created initial supervisor account: ${supervisorLoginId}`)
		} else if (!existingSupervisor.email) {
			existingSupervisor.email = supervisorEmail
			await existingSupervisor.save()
		}
	}

	const officerLoginId = String(process.env.DEMO_OFFICER_LOGIN_ID || '').trim().toLowerCase()
	const officerEmail = String(process.env.DEMO_OFFICER_EMAIL || '').trim().toLowerCase()
	const officerPassword = String(process.env.DEMO_OFFICER_TEMP_PASSWORD || '')
	const officerPersonnelId = String(process.env.DEMO_OFFICER_PERSONNEL_ID || '').trim()
	if (officerLoginId && officerEmail && officerPassword && officerPersonnelId) {
		const existingOfficer = await findProvisionedUser({
			username: officerLoginId,
			email: officerEmail,
			personnelId: officerPersonnelId,
		})
		if (!existingOfficer) {
			await User.create({
				username: officerLoginId,
				email: officerEmail,
				passwordHash: await hashPassword(officerPassword),
				role: 'officer',
				personnelId: officerPersonnelId,
				status: 'active',
				forcePasswordReset: true,
			})
			console.log(`Created demo officer account: ${officerLoginId}`)
		} else {
			let shouldSave = false
			if (!existingOfficer.email) {
				existingOfficer.email = officerEmail
				shouldSave = true
			}
			if (!existingOfficer.personnelId) {
				existingOfficer.personnelId = officerPersonnelId
				shouldSave = true
			}
			if (shouldSave) await existingOfficer.save()
		}
	}

	if (mockOfficerEnabled) {
		const mockLoginId = String(
			process.env.MOCK_OFFICER_LOGIN_ID || 'officer.mock',
		).trim().toLowerCase()
		const mockPassword = String(
			process.env.MOCK_OFFICER_TEMP_PASSWORD || 'MockOfficer!2026',
		)
		const mockEmail = String(
			process.env.MOCK_OFFICER_EMAIL
			|| buildEmailAlias(
				process.env.GMAIL_USER || process.env.DEMO_OFFICER_EMAIL,
				'mock-officer',
			),
		).trim().toLowerCase()

		if (!mockEmail) {
			throw new Error(
				'MOCK_OFFICER_EMAIL or a base GMAIL_USER/DEMO_OFFICER_EMAIL is required when ENABLE_MOCK_OFFICER=true.',
			)
		}

		const existingMockOfficer = await findProvisionedUser({
			username: mockLoginId,
			email: mockEmail,
			personnelId: mockOfficerPersonnelId,
		})
		if (existingMockOfficer && existingMockOfficer.role !== 'officer') {
			throw new Error('The configured mock officer identity belongs to a non-officer account.')
		}
		if (!existingMockOfficer) {
			await User.create({
				username: mockLoginId,
				email: mockEmail,
				emailVerifiedAt: new Date(),
				passwordHash: await hashPassword(mockPassword),
				role: 'officer',
				personnelId: mockOfficerPersonnelId,
				isMockAccount: true,
				status: 'active',
				forcePasswordReset: false,
			})
			console.log(`Created mock officer account: ${mockLoginId}`)
		} else {
			existingMockOfficer.personnelId = mockOfficerPersonnelId
			existingMockOfficer.isMockAccount = true
			if (!existingMockOfficer.email) existingMockOfficer.email = mockEmail
			await existingMockOfficer.save()
		}
	}

	await Promise.all(seedPersonnel.map((profile) => (
		Personnel.updateOne(
			{ personnelId: profile.personnelId },
			{ $setOnInsert: profile },
			{ upsert: true },
		)
	)))

	await Promise.all(seedLocations.map(([personnelId, locationName, longitude, latitude]) => (
		CurrentLocation.updateOne(
			{ personnelId },
			{
				$setOnInsert: {
					personnelId,
					locationName,
					location: point(longitude, latitude),
					source: 'mock',
					isSimulated: true,
					recordedAt: new Date(),
					receivedAt: new Date(),
				},
			},
			{ upsert: true },
		)
	)))
	if (mockOfficerEnabled) {
		await Personnel.updateOne(
			{ personnelId: mockOfficerPersonnelId, fullName: 'GerryBoy Aggabao' },
			{ $set: { fullName: mockOfficerFullName } },
		)
	}

	await configureDemoGpsAssignment(officerPersonnelId)

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

	await Promise.all([
		Deployment.updateOne(
			{ assignmentId: 'ASG-DEMO-1' },
			{
				$setOnInsert: {
					assignmentId: 'ASG-DEMO-1',
					groupId: 'GRP-DEMO-CUBAG',
					personnelId: gpsOfficerPersonnelId,
					personnelName: gpsOfficerFullName,
					rank: 'Police Corporal',
					barangayCode: 'CUBAG',
					patrolArea: 'Barangay Cubag',
					shiftStart: new Date('2026-07-25T08:00:00+08:00'),
					shiftEnd: new Date('2026-07-25T20:00:00+08:00'),
					instructions: 'Maintain visibility around the public market and highway approach.',
					assignedAt: new Date('2026-07-25T07:30:00+08:00'),
					location: point(121.7658, 17.4272),
				},
			},
			{ upsert: true },
		),
	])

	if (mockOfficerEnabled) {
		await Deployment.updateOne(
			{ assignmentId: 'ASG-CENTRO-002' },
			buildMockDeploymentSeedUpdate(),
			{ upsert: true },
		)
	}

}

module.exports = seedDatabase
module.exports.buildMockDeploymentSeedUpdate = buildMockDeploymentSeedUpdate
