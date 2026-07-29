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

Optional local seed accounts can be configured with:

```env
SUPERVISOR_LOGIN_ID=supervisor
SUPERVISOR_EMAIL=supervisor@example.com
SUPERVISOR_TEMP_PASSWORD=ChangeMe!2026

DEMO_OFFICER_LOGIN_ID=officer.demo
DEMO_OFFICER_EMAIL=officer@example.com
DEMO_OFFICER_TEMP_PASSWORD=OfficerDemo!2026
DEMO_OFFICER_PERSONNEL_ID=pcpl-001
```

Seeds only create missing users. They do not reset an existing password.
Remove the demo values before deployment.

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
