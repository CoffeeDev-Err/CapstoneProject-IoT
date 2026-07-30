const CABAGAN_BARANGAYS = [
	{ code: 'AGGUB', name: 'Aggub', psgcCode: '0203106001' },
	{ code: 'ANAO', name: 'Anao', psgcCode: '0203106002' },
	{ code: 'ANGANCASILIAN', name: 'Angancasilian', psgcCode: '0203106003' },
	{ code: 'BALASIG', name: 'Balasig', psgcCode: '0203106004' },
	{ code: 'CANSAN', name: 'Cansan', psgcCode: '0203106005' },
	{ code: 'CASIBARAG-NORTE', name: 'Casibarag Norte', psgcCode: '0203106006' },
	{ code: 'CASIBARAG-SUR', name: 'Casibarag Sur', psgcCode: '0203106007' },
	{ code: 'CATABAYUNGAN', name: 'Catabayungan', psgcCode: '0203106008' },
	{ code: 'CUBAG', name: 'Cubag', psgcCode: '0203106009' },
	{ code: 'GARITA', name: 'Garita', psgcCode: '0203106010' },
	{ code: 'LUQUILU', name: 'Luquilu', psgcCode: '0203106011' },
	{ code: 'MABANGUG', name: 'Mabangug', psgcCode: '0203106012' },
	{ code: 'MAGASSI', name: 'Magassi', psgcCode: '0203106013' },
	{ code: 'NGARAG', name: 'Ngarag', psgcCode: '0203106015' },
	{ code: 'PILIG-ABAJO', name: 'Pilig Abajo', psgcCode: '0203106016' },
	{ code: 'PILIG-ALTO', name: 'Pilig Alto', psgcCode: '0203106017' },
	{ code: 'CENTRO', name: 'Centro', psgcCode: '0203106018' },
	{ code: 'SAN-BERNARDO', name: 'San Bernardo', psgcCode: '0203106019' },
	{ code: 'SAN-JUAN', name: 'San Juan', psgcCode: '0203106020' },
	{ code: 'SAUI', name: 'Saui', psgcCode: '0203106021' },
	{ code: 'TALLAG', name: 'Tallag', psgcCode: '0203106022' },
	{ code: 'UGAD', name: 'Ugad', psgcCode: '0203106023' },
	{ code: 'UNION', name: 'Union', psgcCode: '0203106024' },
	{ code: 'MASIPI-EAST', name: 'Masipi East', psgcCode: '0203106025' },
	{ code: 'MASIPI-WEST', name: 'Masipi West', psgcCode: '0203106026' },
	{ code: 'SAN-ANTONIO', name: 'San Antonio', psgcCode: '0203106027' },
]

const normalizeBarangayLookup = (value) => String(value || '')
	.trim()
	.toUpperCase()
	.replace(/^BARANGAY\s+/, '')
	.replace(/[^A-Z0-9]+/g, '-')
	.replace(/^-|-$/g, '')

const CABAGAN_BARANGAY_BY_CODE = new Map(
	CABAGAN_BARANGAYS.map((barangay) => [barangay.code, barangay]),
)

const findCabaganBarangay = (value) => (
	CABAGAN_BARANGAY_BY_CODE.get(normalizeBarangayLookup(value)) || null
)

const isCabaganBarangayCode = (value) => Boolean(findCabaganBarangay(value))

module.exports = {
	CABAGAN_BARANGAYS,
	findCabaganBarangay,
	isCabaganBarangayCode,
	normalizeBarangayLookup,
}
