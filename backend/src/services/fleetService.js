const { createValidationError } = require('../utils/operationalValidation')
const VEHICLES = [
	{ id: 'car-1', name: 'Car 1', mode: 'car' },
	{ id: 'car-2', name: 'Car 2', mode: 'car' },
	{ id: 'motorcycle-1', name: 'Motorcycle 1', mode: 'motorcycle' },
]
const weekFor = (date) => {
	const local = new Date(new Date(date).getTime() + 8 * 3600000)
	if (!Number.isFinite(local.getTime())) return ''
	local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7)
	return local.toISOString().slice(0, 10)
}
const normalizeFleetWeek = (body) => {
	const date = String(body.weekStart || '')
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || weekFor(`${date}T00:00:00+08:00`) !== date) {
		throw createValidationError('Choose the Monday starting this vehicle assignment week.', 'weekStart')
	}
	const crews = body.crews
	if (!Array.isArray(crews) || crews.length < 1 || crews.length > 3) throw createValidationError('Assign at least one vehicle.', 'crews')
	const vehicles = new Set(), people = new Set()
	for (const crew of crews) {
		if (!crew || !VEHICLES.some(v => v.id === crew.vehicleId) || vehicles.has(crew.vehicleId)) throw createValidationError('Choose each vehicle only once.', 'crews')
		vehicles.add(crew.vehicleId)
		if (!Array.isArray(crew.personnelIds) || !crew.personnelIds.length || crew.personnelIds.length > 20
			|| !crew.personnelIds.includes(crew.driverId)) throw createValidationError('Select the crew and a driver from that crew.', 'crews')
		for (const id of crew.personnelIds) {
			if (typeof id !== 'string' || !id || people.has(id)) throw createValidationError('A person can belong to only one vehicle in a week.', 'crews')
			people.add(id)
		}
	}
	return { weekStart: date, weekEnd: new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 7 * 86400000),
		crews: crews.map(c => ({ vehicleId: c.vehicleId, driverId: c.driverId, personnelIds: c.personnelIds })) }
}

const createFleetService = ({ FleetWeek, Personnel }) => ({
	list: async () => ({ vehicles: VEHICLES, weeks: await FleetWeek.find().sort({ weekStart: -1 }).limit(80).lean() }),
	create: async (body, actor) => {
		const week = normalizeFleetWeek(body)
		if (week.weekEnd <= new Date()) throw createValidationError('Choose the current or a future week.', 'weekStart')
		const ids = week.crews.flatMap(c => c.personnelIds)
		const profiles = await Personnel.find({ personnelId: { $in: ids }, status: 'active' }).select('personnelId').lean()
		if (profiles.length !== ids.length) throw createValidationError('Select active personnel only.', 'crews')
		try { return await FleetWeek.create({ ...week, createdBy: String(actor?.id || '') }) }
		catch (error) {
			if (error.code === 11000) {
				// Existing crews are immutable. Additional vehicles can be assigned
				// atomically without reusing personnel from a saved crew.
				const updated = await FleetWeek.findOneAndUpdate({ weekStart: week.weekStart,
					'crews.vehicleId': { $nin: week.crews.map(c => c.vehicleId) },
					'crews.personnelIds': { $nin: ids },
				}, { $push: { crews: { $each: week.crews } } }, { new: true })
				if (updated) return updated
				error.status = 409; error.message = 'A vehicle or personnel is already assigned this week. Saved crews cannot be replaced.'
			}
			throw error
		}
	},
})

const validateVehicleDeployments = async (assignments, FleetWeek) => {
	const vehicleAssignments = assignments.filter(a => a.vehicleId)
	if (!vehicleAssignments.length) return
	const weeks = await FleetWeek.find({ weekStart: { $in: [...new Set(vehicleAssignments.map(a => weekFor(a.shiftStart)))] } }).lean()
	for (const assignment of vehicleAssignments) {
		const week = weeks.find(w => w.weekStart === weekFor(assignment.shiftStart))
		const crew = week?.crews.find(c => c.vehicleId === assignment.vehicleId)
		if (!crew || !crew.personnelIds.includes(assignment.personnelId) || new Date(assignment.shiftEnd) > new Date(week.weekEnd)
			|| !VEHICLES.some(v => v.id === assignment.vehicleId && v.mode === assignment.patrolMode)) {
			throw createValidationError('Vehicle, personnel and full duty must match the locked weekly assignment.', 'vehicleId')
		}
		const group = vehicleAssignments.filter(a => a.groupId === assignment.groupId)
		if (group.length !== crew.personnelIds.length || !crew.personnelIds.every(id => group.some(a => a.personnelId === id))) {
			throw createValidationError('Deploy the complete assigned vehicle crew together.', 'vehicleId')
		}
		if (group.some(a => a.vehicleId !== assignment.vehicleId || +new Date(a.shiftStart) !== +new Date(assignment.shiftStart)
			|| +new Date(a.shiftEnd) !== +new Date(assignment.shiftEnd) || JSON.stringify(a.scheduleBlocks) !== JSON.stringify(assignment.scheduleBlocks))) {
			throw createValidationError('Vehicle crew must share the same duty and patrol schedule.', 'vehicleId')
		}
		if (vehicleAssignments.some(a => a.vehicleId === assignment.vehicleId && a.groupId !== assignment.groupId
			&& new Date(a.shiftStart) < new Date(assignment.shiftEnd) && new Date(a.shiftEnd) > new Date(assignment.shiftStart))) {
			throw createValidationError('This vehicle has an overlapping deployment.', 'vehicleId')
		}
		assignment.vehicleCrew = { driverId: crew.driverId, personnelIds: [...crew.personnelIds], weekStart: week.weekStart }
	}
}
module.exports = { VEHICLES, weekFor, normalizeFleetWeek, createFleetService, validateVehicleDeployments }
