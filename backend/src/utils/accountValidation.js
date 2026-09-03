const POLICE_RANKS = [
	'Patrolman',
	'Patrolwoman',
	'Police Corporal',
	'Police Staff Sergeant',
	'Police Master Sergeant',
	'Police Senior Master Sergeant',
	'Police Chief Master Sergeant',
	'Police Executive Master Sergeant',
	'Police Lieutenant',
	'Police Captain',
	'Police Major',
	'Police Lieutenant Colonel',
	'Police Colonel',
	'Police Brigadier General',
	'Police Major General',
	'Police Lieutenant General',
	'Police General',
]

const FIELD_LIMITS = Object.freeze({
	fullName: 100,
	badgeNumber: 30,
	loginId: 50,
	email: 254,
	mobileNumber: 13,
	password: 128,
})

const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
const FULL_NAME_PATTERN = /^[\p{L}\s.'’-]+$/u
const BADGE_NUMBER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i
const LOGIN_ID_PATTERN = /^\d{2}-\d{4}$/
const PH_MOBILE_PATTERN = /^(?:09\d{9}|\+639\d{9})$/

const EMAIL_DOMAIN_CORRECTIONS = new Map([
	['isu.edu.p', 'isu.edu.ph'],
	['gmai.com', 'gmail.com'],
	['gmail.co', 'gmail.com'],
	['gmail.cm', 'gmail.com'],
	['gmail.con', 'gmail.com'],
	['gmail.comm', 'gmail.com'],
	['gmial.com', 'gmail.com'],
	['gamil.com', 'gmail.com'],
	['yaho.com', 'yahoo.com'],
	['yahoo.co', 'yahoo.com'],
	['outlok.com', 'outlook.com'],
])

const normalizeHumanName = (value) => String(value || '').trim().replace(/\s+/g, ' ')
const normalizeBadgeNumber = (value) => String(value || '').trim().toUpperCase()
const normalizeLoginId = (value) => String(value || '').trim().toLowerCase()
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const normalizeMobileNumber = (value) => String(value || '').trim().replace(/[\s()-]/g, '')

const validateFullName = (value) => {
	const fullName = normalizeHumanName(value)
	if (!fullName) return 'Full name is required.'
	if (fullName.length < 2 || fullName.length > FIELD_LIMITS.fullName) {
		return `Full name must contain 2-${FIELD_LIMITS.fullName} characters.`
	}
	if (!FULL_NAME_PATTERN.test(fullName) || !/\p{L}/u.test(fullName)) {
		return 'Full name may contain letters, spaces, periods, apostrophes, and hyphens only.'
	}
	return ''
}

const validateBadgeNumber = (value) => {
	const badgeNumber = normalizeBadgeNumber(value)
	if (!badgeNumber) return 'Badge number is required.'
	if (badgeNumber.length < 3 || badgeNumber.length > FIELD_LIMITS.badgeNumber) {
		return `Badge number must contain 3-${FIELD_LIMITS.badgeNumber} characters.`
	}
	if (!BADGE_NUMBER_PATTERN.test(badgeNumber)) {
		return 'Badge number may contain letters, numbers, and single hyphens only.'
	}
	return ''
}

const validateRank = (value) => (
	POLICE_RANKS.includes(String(value || '').trim())
		? ''
		: 'Select a valid Philippine National Police rank.'
)

const validateLoginId = (value, { existingLoginId = '' } = {}) => {
	const loginId = normalizeLoginId(value)
	if (!loginId) return 'Login ID is required.'
	if (loginId.length > FIELD_LIMITS.loginId) {
		return `Login ID must not exceed ${FIELD_LIMITS.loginId} characters.`
	}

	const unchangedLegacyLogin = existingLoginId
		&& loginId === normalizeLoginId(existingLoginId)
	if (unchangedLegacyLogin) return ''

	return LOGIN_ID_PATTERN.test(loginId)
		? ''
		: 'Login ID must use the NN-NNNN format, such as 12-2004.'
}

const validateOfficialEmail = (value) => {
	const email = normalizeEmail(value)
	if (!email) return 'Official email is required for verification.'
	if (email.length > FIELD_LIMITS.email) {
		return `Official email must not exceed ${FIELD_LIMITS.email} characters.`
	}

	const parts = email.split('@')
	if (parts.length === 2) {
		const [localPart, domain] = parts
		const correctedDomain = EMAIL_DOMAIN_CORRECTIONS.get(domain)
		if (correctedDomain) {
			return `Check the email domain. Did you mean ${localPart}@${correctedDomain}?`
		}
		if (localPart.length > 64) return 'The email username must not exceed 64 characters.'
		const topLevelDomain = domain.split('.').at(-1)
		if (!/^[a-z]{2,63}$/i.test(topLevelDomain || '')) {
			return 'Enter a complete email address with a valid domain, such as name@isu.edu.ph.'
		}
	}

	if (!EMAIL_PATTERN.test(email)) {
		return 'Enter a complete email address, such as name@gmail.com or name@pnp.gov.ph.'
	}
	return ''
}

const validateMobileNumber = (value) => {
	const mobileNumber = normalizeMobileNumber(value)
	if (!mobileNumber) return ''
	return PH_MOBILE_PATTERN.test(mobileNumber)
		? ''
		: 'Use a Philippine mobile number in 09XXXXXXXXX or +639XXXXXXXXX format.'
}

module.exports = {
	FIELD_LIMITS,
	LOGIN_ID_PATTERN,
	POLICE_RANKS,
	normalizeBadgeNumber,
	normalizeEmail,
	normalizeHumanName,
	normalizeLoginId,
	normalizeMobileNumber,
	validateBadgeNumber,
	validateFullName,
	validateLoginId,
	validateMobileNumber,
	validateOfficialEmail,
	validateRank,
}
