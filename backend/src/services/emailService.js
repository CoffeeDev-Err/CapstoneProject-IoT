const nodemailer = require('nodemailer')

const PURPOSE_COPY = {
	verify_email: {
		subject: 'Verify your BantayCabagan email',
		heading: 'Verify your official email',
	},
	login: {
		subject: 'Your BantayCabagan login code',
		heading: 'Complete your secure sign in',
	},
	reset_password: {
		subject: 'Reset your BantayCabagan password',
		heading: 'Reset your password',
	},
	change_password: {
		subject: 'Confirm your BantayCabagan password change',
		heading: 'Confirm your password change',
	},
}

let transporter

const getDeliveryMode = () => {
	const configuredMode = String(process.env.EMAIL_DELIVERY_MODE || '').toLowerCase()
	if (configuredMode) return configuredMode
	if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail'
	return process.env.NODE_ENV === 'production' ? 'disabled' : 'console'
}

const getTransporter = () => {
	if (transporter) return transporter
	transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: process.env.GMAIL_USER,
			pass: String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
		},
	})
	return transporter
}

const buildHtml = ({ code, heading }) => `
	<div style="font-family:Arial,sans-serif;color:#172033;max-width:520px;margin:auto">
		<h2 style="margin-bottom:8px">${heading}</h2>
		<p style="line-height:1.6">Use this one-time verification code:</p>
		<div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 20px;background:#f2f6ff;border:1px solid #d8e3f8;border-radius:8px;text-align:center">
			${code}
		</div>
		<p style="line-height:1.6">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
		<p style="color:#667085;font-size:13px">BantayCabagan secure account service</p>
	</div>
`

const sendVerificationCode = async ({ email, code, purpose }) => {
	const mode = getDeliveryMode()
	const copy = PURPOSE_COPY[purpose] || PURPOSE_COPY.login

	if (mode === 'console') {
		console.log(`[EMAIL-CONSOLE] ${purpose} code for ${email}: ${code}`)
		return { mode, debugCode: code }
	}
	if (mode !== 'gmail') {
		const error = new Error('Email delivery is not configured.')
		error.status = 503
		error.code = 'EMAIL_NOT_CONFIGURED'
		throw error
	}
	if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
		const error = new Error('Gmail credentials are incomplete.')
		error.status = 503
		error.code = 'EMAIL_NOT_CONFIGURED'
		throw error
	}

	await getTransporter().sendMail({
		from: process.env.EMAIL_FROM
			|| `BantayCabagan <${process.env.GMAIL_USER}>`,
		to: email,
		subject: copy.subject,
		text: `${copy.heading}\n\nYour verification code is ${code}. It expires in 10 minutes.`,
		html: buildHtml({ code, heading: copy.heading }),
	})
	return { mode }
}

module.exports = {
	getDeliveryMode,
	sendVerificationCode,
}
