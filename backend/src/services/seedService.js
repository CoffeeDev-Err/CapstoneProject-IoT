const {
	Barangay,
	CurrentLocation,
	Deployment,
	Personnel,
	Report,
	Task,
	User,
} = require('../models')
const { hashPassword } = require('../utils/password')

const point = (longitude, latitude) => ({
	type: 'Point',
	coordinates: [longitude, latitude],
})

const seedPersonnel = [
	{
		personnelId: 'pcpl-001',
		badgeNumber: 'P-1001',
		fullName: 'Mon Maguas',
		rank: 'Police Corporal',
		dutyStatus: 'On Patrol',
		defaultLocationName: 'Cabagan Public Market',
		photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
	},
	{
		personnelId: 'psms-002',
		badgeNumber: 'P-1002',
		fullName: 'GerryBoy Aggabao',
		rank: 'Police Staff Sergeant',
		dutyStatus: 'Monitoring',
		defaultLocationName: 'Cabagan Municipal Hall',
		photoUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
	},
	{
		personnelId: 'pltc-003',
		badgeNumber: 'P-1003',
		fullName: 'Romel Manzano',
		rank: 'Police Lieutenant',
		dutyStatus: 'Responding',
		defaultLocationName: 'Barangay Centro',
		photoUrl: 'https://randomuser.me/api/portraits/men/18.jpg',
	},
]

const seedLocations = [
	['pcpl-001', 'Cabagan Public Market', 121.7692, 17.4271],
	['psms-002', 'Cabagan Municipal Hall', 121.7683, 17.4213],
	['pltc-003', 'Barangay Centro', 121.7748, 17.4189],
]

const seedBarangays = [
	['CENTRO', 'Centro', 121.7681, 17.4239],
	['CUBAG', 'Cubag', 121.7658, 17.4272],
	['GARITA', 'Garita', 121.7762, 17.4148],
	['SAN-JUAN', 'San Juan', 121.7546, 17.4192],
	['SANTA-MARIA', 'Santa Maria', 121.7574, 17.4843],
]

const initializeCollections = async (models) => {
	for (const model of Object.values(models)) {
		await model.createCollection()
		await model.createIndexes()
	}
}

const seedDatabase = async (models) => {
	await initializeCollections(models)

	const supervisorLoginId = String(process.env.SUPERVISOR_LOGIN_ID || '').trim().toLowerCase()
	const supervisorEmail = String(process.env.SUPERVISOR_EMAIL || '').trim().toLowerCase()
	const supervisorPassword = String(process.env.SUPERVISOR_TEMP_PASSWORD || '')
	if (supervisorLoginId && supervisorEmail && supervisorPassword) {
		const existingSupervisor = await User.findOne({ username: supervisorLoginId })
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
		const existingOfficer = await User.findOne({ username: officerLoginId })
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

	await Promise.all(seedBarangays.map(([code, name, longitude, latitude]) => (
		Barangay.updateOne(
			{ code },
			{
				$setOnInsert: {
					code,
					name,
					municipality: 'Cabagan',
					center: point(longitude, latitude),
				},
			},
			{ upsert: true },
		)
	)))

	await Promise.all([
		Deployment.updateOne(
			{ assignmentId: 'ASG-DEMO-1' },
			{
				$setOnInsert: {
					assignmentId: 'ASG-DEMO-1',
					groupId: 'GRP-DEMO-CUBAG',
					personnelId: 'pcpl-001',
					personnelName: 'Mon Maguas',
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
		Deployment.updateOne(
			{ assignmentId: 'ASG-DEMO-2' },
			{
				$setOnInsert: {
					assignmentId: 'ASG-DEMO-2',
					groupId: 'GRP-DEMO-CUBAG',
					personnelId: 'pltc-003',
					personnelName: 'Romel Manzano',
					rank: 'Police Lieutenant',
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

	await Promise.all([
		Report.updateOne(
			{ reportNumber: 'RPT-MOB-001' },
			{
				$setOnInsert: {
					reportNumber: 'RPT-MOB-001',
					submittedBy: 'pcpl-001',
					officerName: 'Mon Maguas',
					submittedAt: new Date('2026-07-25T09:15:00+08:00'),
					incidentAt: new Date('2026-07-25T08:45:00+08:00'),
					assignedArea: 'Barangay Cubag',
					barangayCode: 'CUBAG',
					reportType: 'incident',
					isIncident: true,
					severity: 3,
					validationStatus: 'pending',
					caseStatus: 'open',
					title: 'Roadside disturbance',
					description: 'Several individuals were reported arguing near the market access road.',
					locationName: 'Cubag Public Market Access Road',
					location: point(121.7658, 17.4272),
				},
			},
			{ upsert: true },
		),
		Report.updateOne(
			{ reportNumber: 'RPT-MOB-002' },
			{
				$setOnInsert: {
					reportNumber: 'RPT-MOB-002',
					submittedBy: 'pcpl-001',
					officerName: 'Mon Maguas',
					submittedAt: new Date('2026-07-24T18:10:00+08:00'),
					incidentAt: new Date('2026-07-24T17:30:00+08:00'),
					assignedArea: 'Barangay Cubag',
					barangayCode: 'CUBAG',
					reportType: 'patrol',
					isIncident: false,
					severity: 1,
					validationStatus: 'validated',
					caseStatus: 'not_applicable',
					title: 'Evening visibility patrol',
					description: 'Completed routine visibility patrol around the public market.',
					locationName: 'Cubag Public Market Zone',
					location: point(121.7658, 17.4272),
				},
			},
			{ upsert: true },
		),
	])

	await Promise.all([
		Task.updateOne(
			{ taskId: 'TSK-001' },
			{
				$setOnInsert: {
					taskId: 'TSK-001',
					type: 'backup',
					title: 'Backup requested',
					description: 'Additional personnel needed for crowd control.',
					requestedBy: 'psms-002',
					requesterName: 'GerryBoy Aggabao',
					requiredResponders: 3,
					locationName: 'Municipal Transport Terminal',
					location: point(121.7692, 17.4256),
					status: 'open',
					createdAt: new Date('2026-07-25T10:30:00+08:00'),
				},
			},
			{ upsert: true, timestamps: false },
		),
		Task.updateOne(
			{ taskId: 'TSK-002' },
			{
				$setOnInsert: {
					taskId: 'TSK-002',
					type: 'urgent',
					title: 'Traffic assistance required',
					description: 'Assist with traffic control while an obstruction is cleared.',
					requestedBy: 'supervisor',
					requesterName: 'Duty Supervisor',
					requiredResponders: 2,
					responders: [{
						personnelId: 'psms-002',
						acceptedAt: new Date('2026-07-25T10:46:00+08:00'),
					}],
					locationName: 'San Juan School Access Road',
					location: point(121.7546, 17.4192),
					status: 'open',
					createdAt: new Date('2026-07-25T10:45:00+08:00'),
				},
			},
			{ upsert: true, timestamps: false },
		),
	])
}

module.exports = seedDatabase
