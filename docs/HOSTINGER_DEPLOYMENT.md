# Hostinger Business deployment

The production dashboard and Express API are deployed together as one Hostinger
Node.js Web App. The mobile application calls the same public HTTPS domain.

## Hostinger Web App settings

In hPanel, open **Websites -> Add Website -> Deploy Web App**, then connect this
repository.

- Project/root directory: repository root
- Node.js version: 22.x
- Framework: Express.js, or `Other` if Express is not auto-detected
- Build command: `npm run build`
- Entry file: `backend/src/server.js`
- Start command, if requested: `npm start`

Do not set `PORT`. Hostinger provides the application port at runtime.

The root npm workspace installs both `backend` and `frontend` dependencies. The
build command creates `frontend/dist`; the Express server serves that dashboard
in production as well as `/api`, `/uploads`, and Socket.IO.

## Required environment variables

Add secrets in hPanel's Environment Variables section. Do not commit or upload
the local `.env` file.

```dotenv
NODE_ENV=production
MONGO_URI=<mongodb-atlas-connection-string>
ALLOWED_ORIGINS=https://<production-domain>
OTP_SECRET=<long-random-secret>
GPS_INGEST_API_KEY=<different-long-random-secret>
FLESPI_TOKEN=<restricted-flespi-token>
FLESPI_MQTT_ENABLED=true
DEPLOYMENT_STATUS_INTERVAL_MS=15000
SHIFT_REMINDER_MINUTES=30
EMAIL_DELIVERY_MODE=gmail
GMAIL_USER=<notification-email>
GMAIL_APP_PASSWORD=<google-app-password>
EMAIL_FROM=<sender-name-and-address>
```

Add the remaining seed/demo variables from `backend/.env.example` only when they
are intentionally needed. Production supervisor and officer passwords must not
use the example values.

For the first defense deployment, uploads use `backend/uploads`. Before regular
police use, configure `UPLOAD_DIR` to a backed-up persistent location outside the
deployment output or move evidence storage to an object-storage service. Verify
file persistence after a Hostinger redeployment before relying on it.

## Mobile production build

After the Hostinger domain is live and `/api/health` returns JSON, configure the
EAS production environment with:

```dotenv
EXPO_PUBLIC_API_URL=https://<production-domain>
```

Do not enable `ALLOW_CLEARTEXT_TRAFFIC` in production. Build the Android app with:

```sh
cd bantaycabagan-mobileapp
eas build --platform android --profile production
```

## Verification checklist

1. Open `https://<production-domain>/api/health` and confirm `status: ok`.
2. Log in to the web dashboard and the installed Android build.
3. Create and view a report with photo evidence.
4. Assign a task and confirm the mobile app receives it.
5. Lock the phone and verify immediate and scheduled push notifications.
6. Test live personnel updates. Hostinger Web/Cloud hosting blocks incoming
   WebSocket connections, so Socket.IO clients use HTTP polling first and only
   upgrade when supported.
7. Redeploy once and verify that uploaded evidence still opens.
