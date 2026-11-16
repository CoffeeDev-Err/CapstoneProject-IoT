# Email Verification Setup

The web portal and mobile app share the same MongoDB users, OTP challenges,
and sessions. GPS and Flespi configuration are independent from account
authentication.

## Login Fields

- Web supervisor portal: `Login ID` and `Password`
- Police mobile app: `Login ID` and `Password`
- `Official Email` is assigned in Account Management and is used for OTP
  delivery, account verification, forgot password, and change password.

Web login accepts supervisor accounts only. Mobile login accepts officer
accounts only.

## Local Development

Use this in `backend/.env`:

```env
EMAIL_DELIVERY_MODE=console
OTP_SECRET=replace-with-a-long-random-development-secret
```

The six-digit code appears in the backend terminal and is also returned to the
development UI. No internet is needed after packages have been installed and
MongoDB is locally available.

The initial supervisor account can be configured with:

```env
SUPERVISOR_LOGIN_ID=00-0001
SUPERVISOR_EMAIL=supervisor@example.com
SUPERVISOR_TEMP_PASSWORD=ChangeMe!2026
```

Startup provisioning does not reset an existing password. Use a unique password in deployment.
Create officer accounts and assign their GPS devices through Account Management; demo officer provisioning has been removed.

## Gmail Delivery

1. Create a dedicated Gmail account for BantayCabagan.
2. Enable Google 2-Step Verification.
3. Create a 16-character Google App Password.
4. Configure the backend:

```env
EMAIL_DELIVERY_MODE=gmail
GMAIL_USER=your-account@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
EMAIL_FROM=BantayCabagan <your-account@gmail.com>
```

Use an App Password, never the normal Gmail password. Restart the backend after
changing environment variables.

## Security Rules

The login code verifies automatically once six digits are entered on web and
mobile. The visible **Verify and Continue** button remains available for manual
retry. Incorrect codes are cleared and the input regains focus; connection
failures preserve the entered code.

The login and recovery screens display code expiration from `expiresAt` and a
resend countdown from `resendAvailableAt` or a rate-limit error's `retryAt`.
`serverTime` accounts for device clock differences. There is no additional
fixed resend cooldown: the existing three-requests-per-15-minutes allowance
determines when the countdown appears. These timing fields require the updated
backend; older responses still support verification without a resend countdown.

- OTPs expire after 10 minutes.
- Only a hash of each OTP is stored.
- A challenge permits five attempts.
- A user can request up to three codes in 15 minutes.
- Successful password changes revoke all active sessions.
- Expired OTP documents are removed by a MongoDB TTL index.
- Account-management APIs require a valid supervisor session.

## Mobile API Address

An Android emulator uses `http://10.0.2.2:4000` by default. For Expo Go on a
physical phone, set the computer's LAN IP before starting Expo:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.10:4000"
npm start --prefix bantaycabagan-mobileapp
```

The phone and computer must be on the same network, and Windows Firewall must
allow the backend port.
