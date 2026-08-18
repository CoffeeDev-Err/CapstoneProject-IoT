// Shared helpers for the web session cookie.
//
// Supervisors (web dashboard) receive their opaque session token as an
// httpOnly + SameSite=Lax cookie so it is never readable by JavaScript, which
// closes the XSS session-theft path a localStorage token left open. Officers
// (mobile app) keep sending the Bearer token from secure device storage, so the
// backend accepts BOTH transports and nothing that worked before breaks.

const AUTH_COOKIE_NAME = 'gs_session'

const isProduction = () => process.env.NODE_ENV === 'production'

// SameSite=Lax stops the browser from attaching this cookie to cross-site
// POST/PATCH/DELETE requests, which is what defends the cookie session against
// CSRF while still allowing normal top-level navigation to the dashboard.
const baseCookieOptions = () => ({
	httpOnly: true,
	secure: isProduction(),
	sameSite: 'lax',
	path: '/',
})

const sessionCookieOptions = (expiresAt) => {
	const options = baseCookieOptions()
	const expiryMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN
	if (Number.isFinite(expiryMs)) options.expires = new Date(expiryMs)
	return options
}

const clearCookieOptions = () => baseCookieOptions()

const parseCookies = (cookieHeader) => {
	const jar = {}
	String(cookieHeader || '')
		.split(';')
		.forEach((part) => {
			const separator = part.indexOf('=')
			if (separator < 0) return
			const name = part.slice(0, separator).trim()
			if (!name) return
			const rawValue = part.slice(separator + 1).trim()
			try {
				jar[name] = decodeURIComponent(rawValue)
			} catch {
				jar[name] = rawValue
			}
		})
	return jar
}

const readSessionCookie = (cookieHeader) => parseCookies(cookieHeader)[AUTH_COOKIE_NAME] || ''

module.exports = {
	AUTH_COOKIE_NAME,
	sessionCookieOptions,
	clearCookieOptions,
	parseCookies,
	readSessionCookie,
}
