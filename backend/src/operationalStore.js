const AREA_COORDINATES = {
	'Barangay Centro': { latitude: 17.4239, longitude: 121.7681 },
	'Barangay Cubag': { latitude: 17.4272, longitude: 121.7658 },
	'Barangay Garita': { latitude: 17.4148, longitude: 121.7762 },
	'Barangay San Juan': { latitude: 17.4192, longitude: 121.7546 },
	'Barangay Santa Maria': { latitude: 17.4843, longitude: 121.7574 },
	'Cabagan Public Market Zone': { latitude: 17.4272, longitude: 121.7658 },
	'Municipal Hall Perimeter': { latitude: 17.4239, longitude: 121.7681 },
	'Barangay Centro Route': { latitude: 17.4248, longitude: 121.7669 },
	'Highway Checkpoint North': { latitude: 17.4326, longitude: 121.7624 },
	'School Safety Patrol Route': { latitude: 17.4192, longitude: 121.7546 },
}

const getAreaCoordinates = (area) => AREA_COORDINATES[area] || {
	latitude: 17.4239,
	longitude: 121.7681,
}

const createOperationalStore = ({ app, io, personnel }) => {
	let sequence = 100
	let deployments = [
		{
			id: 'ASG-DEMO-1',
			groupId: 'GRP-DEMO-CUBAG',
			personnelId: 'pcpl-001',
			personnelName: 'Mon Maguas',
			rank: 'Police Corporal',
			patrolArea: 'Barangay Cubag',
			shiftStart: '2026-07-25T08:00:00',
			shiftEnd: '2026-07-25T20:00:00',
			notes: 'Maintain visibility around the public market and highway approach.',
			assignedAt: '2026-07-25T07:30:00',
			...getAreaCoordinates('Barangay Cubag'),
		},
		{
			id: 'ASG-DEMO-2',
			groupId: 'GRP-DEMO-CUBAG',
			personnelId: 'pltc-003',
			personnelName: 'Romel Manzano',
			rank: 'Police Lieutenant',
			patrolArea: 'Barangay Cubag',
			shiftStart: '2026-07-25T08:00:00',
			shiftEnd: '2026-07-25T20:00:00',
			notes: 'Maintain visibility around the public market and highway approach.',
			assignedAt: '2026-07-25T07:30:00',
			...getAreaCoordinates('Barangay Cubag'),
		},
	]

	const reports = [
		{
			id: 'RPT-MOB-001',
			personnel_id: 'pcpl-001',
			officer: 'Mon Maguas',
			date_time: '2026-07-25T09:15:00',
			occurred_at: '2026-07-25T08:45:00',
			assigned_area: 'Barangay Cubag',
			barangay: 'Cubag',
			report_type: 'incident',
			is_incident: true,
			severity: 3,
			validation_status: 'pending',
			case_status: 'open',
			title: 'Roadside disturbance',
			description: 'Several individuals were reported arguing near the market access road.',
			location: 'Cubag Public Market Access Road',
			latitude: 17.4272,
			longitude: 121.7658,
		},
		{
			id: 'RPT-MOB-002',
			personnel_id: 'pcpl-001',
			officer: 'Mon Maguas',
			date_time: '2026-07-24T18:10:00',
			occurred_at: '2026-07-24T17:30:00',
			assigned_area: 'Barangay Cubag',
			barangay: 'Cubag',
			report_type: 'patrol',
			is_incident: false,
			severity: 1,
			validation_status: 'validated',
			case_status: 'not_applicable',
			title: 'Evening visibility patrol',
			description: 'Completed routine visibility patrol around the public market.',
			location: 'Cubag Public Market Zone',
			latitude: 17.4272,
			longitude: 121.7658,
		},
	]

	const tasks = [
		{
			id: 'TSK-001',
			type: 'backup',
			title: 'Backup requested',
			description: 'Additional personnel needed for crowd control.',
			location: 'Municipal Transport Terminal',
			latitude: 17.4256,
			longitude: 121.7692,
			requested_by: 'psms-002',
			requester_name: 'GerryBoy Aggabao',
			required_responders: 3,
			accepted_by: [],
			status: 'open',
			created_at: '2026-07-25T10:30:00',
		},
		{
			id: 'TSK-002',
			type: 'urgent',
			title: 'Traffic assistance required',
			description: 'Assist with traffic control while an obstruction is cleared.',
			location: 'San Juan School Access Road',
			latitude: 17.4192,
			longitude: 121.7546,
			requested_by: 'supervisor',
			requester_name: 'Duty Supervisor',
			required_responders: 2,
			accepted_by: ['psms-002'],
			status: 'open',
			created_at: '2026-07-25T10:45:00',
		},
	]

	const nextId = (prefix) => {
		sequence += 1
		return `${prefix}-${new Date().getFullYear()}-${sequence}`
	}

	const getTaskStatus = (task) => {
		if (task.status === 'completed') return 'completed'
		return task.accepted_by.length >= task.required_responders ? 'full' : 'open'
	}

	const acceptTask = (taskId, personnelId) => {
		const task = tasks.find((item) => item.id === taskId)
		if (!task) return { status: 404, body: { success: false, message: 'Task not found.' } }
		if (!personnelId) return { status: 400, body: { success: false, message: 'Personnel ID is required.' } }
		if (task.type === 'backup' && task.requested_by === personnelId) {
			return { status: 409, body: { success: false, message: 'The requester cannot accept their own backup request.' } }
		}
		if (task.accepted_by.includes(personnelId)) {
			return { status: 200, body: { success: true, task } }
		}
		if (task.accepted_by.length >= task.required_responders || task.status === 'completed') {
			return { status: 409, body: { success: false, message: 'The response team is already full.', task } }
		}

		task.accepted_by.push(personnelId)
		task.status = getTaskStatus(task)
		task.updated_at = new Date().toISOString()
		io.emit('task:updated', task)
		return { status: 200, body: { success: true, task } }
	}

	const createTask = (payload = {}) => {
		const requester = personnel.find((member) => member.id === payload.requested_by)
		const task = {
			id: nextId('TSK'),
			type: payload.type || 'backup',
			title: payload.title || 'Backup requested',
			description: payload.description || 'Additional personnel assistance requested.',
			location: payload.location || requester?.locationName || 'Location unavailable',
			latitude: Number(payload.latitude ?? requester?.latitude ?? 17.4239),
			longitude: Number(payload.longitude ?? requester?.longitude ?? 121.7681),
			requested_by: payload.requested_by || 'supervisor',
			requester_name: payload.requester_name || requester?.name || 'Duty Supervisor',
			required_responders: Math.max(1, Math.min(5, Number(payload.required_responders) || 3)),
			accepted_by: [],
			status: 'open',
			created_at: new Date().toISOString(),
		}

		tasks.unshift(task)
		io.emit('task:created', task)
		return task
	}

	const submitReport = (payload = {}) => {
		const officer = personnel.find((member) => member.id === payload.personnel_id)
		const reportType = String(payload.report_type || 'incident').toLowerCase()
		const isIncident = reportType === 'incident'
		const coordinates = getAreaCoordinates(payload.assigned_area)
		const report = {
			id: nextId('RPT'),
			personnel_id: payload.personnel_id || officer?.id || 'pcpl-001',
			officer: payload.officer || officer?.name || 'Police Personnel',
			date_time: payload.date_time || new Date().toISOString(),
			occurred_at: payload.occurred_at || new Date().toISOString(),
			assigned_area: payload.assigned_area || 'Unassigned area',
			barangay: payload.barangay || 'Unspecified',
			report_type: reportType,
			is_incident: isIncident,
			severity: Math.max(1, Math.min(5, Number(payload.severity) || (isIncident ? 2 : 1))),
			validation_status: 'pending',
			case_status: isIncident ? 'open' : 'not_applicable',
			title: payload.title || 'Submitted report',
			description: payload.description || '',
			location: payload.location || payload.assigned_area || 'Location unavailable',
			latitude: Number(payload.latitude ?? coordinates.latitude),
			longitude: Number(payload.longitude ?? coordinates.longitude),
		}

		reports.unshift(report)
		io.emit('report:submitted', report)
		return report
	}

	const resolveReport = (reportId, payload = {}) => {
		const report = reports.find((item) => item.id === reportId)
		if (!report) return { status: 404, body: { success: false, message: 'Report not found.' } }
		if (!report.is_incident) {
			return { status: 409, body: { success: false, message: 'Only incident reports can be resolved.' } }
		}

		report.case_status = 'resolved'
		report.resolved_at = payload.resolved_at || new Date().toISOString()
		report.resolved_by = payload.resolved_by || report.personnel_id
		report.resolution_notes = String(payload.resolution_notes || '').trim()
		io.emit('report:resolved', report)
		return { status: 200, body: { success: true, report } }
	}

	const replaceDeployments = (payload = []) => {
		deployments = payload.map((assignment) => ({
			...assignment,
			...getAreaCoordinates(assignment.patrolArea),
		}))
		io.emit('deployments:updated', deployments)
		return deployments
	}

	app.get('/api/operations/bootstrap', (req, res) => {
		const personnelId = String(req.query.personnel_id || '')
		res.json({
			tasks,
			reports: personnelId
				? reports.filter((report) => report.personnel_id === personnelId)
				: reports,
			deployments: personnelId
				? deployments.filter((assignment) => assignment.personnelId === personnelId)
				: deployments,
		})
	})

	app.post('/api/tasks', (req, res) => {
		res.status(201).json({ success: true, task: createTask(req.body) })
	})

	app.post('/api/tasks/:taskId/accept', (req, res) => {
		const result = acceptTask(req.params.taskId, req.body?.personnel_id)
		res.status(result.status).json(result.body)
	})

	app.post('/api/reports', (req, res) => {
		res.status(201).json({ success: true, report: submitReport(req.body) })
	})

	app.patch('/api/reports/:reportId/resolve', (req, res) => {
		const result = resolveReport(req.params.reportId, req.body)
		res.status(result.status).json(result.body)
	})

	app.put('/api/deployments', (req, res) => {
		const nextDeployments = Array.isArray(req.body?.assignments) ? req.body.assignments : []
		res.json({ success: true, deployments: replaceDeployments(nextDeployments) })
	})

	const registerSocket = (socket) => {
		socket.emit('tasks:bootstrap', tasks)
		socket.emit('reports:bootstrap', reports)
		socket.emit('deployments:bootstrap', deployments)
	}

	return {
		createTask,
		registerSocket,
	}
}

module.exports = createOperationalStore
