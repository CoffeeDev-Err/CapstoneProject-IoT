const { Barangay } = require('../models')
const { readCoordinates } = require('../utils/geo')

const serializeBarangay = (barangay) => ({
	code: barangay.code,
	name: barangay.name,
	municipality: barangay.municipality,
	...readCoordinates(barangay.center),
	active: barangay.active,
})

const listBarangays = async ({ include_inactive: includeInactive } = {}) => {
	const query = includeInactive === 'true' ? {} : { active: true }
	const barangays = await Barangay.find(query).sort({ name: 1 }).lean()
	return barangays.map(serializeBarangay)
}

const getBarangay = async (code) => {
	const barangay = await Barangay.findOne({
		code: String(code).trim().toUpperCase(),
	}).lean()
	return barangay ? serializeBarangay(barangay) : null
}

module.exports = {
	getBarangay,
	listBarangays,
}
