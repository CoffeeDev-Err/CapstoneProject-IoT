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
- Entry file: `backend/scripts/start-production.js`
- Start command, if requested: `npm start`

Do not set `PORT`. Hostinger provides the application port at runtime.

The root npm workspace installs both `backend` and `frontend` dependencies. The
build command creates `frontend/dist`; the Express server serves that dashboard
in production as well as `/api`, the signed media gateway, and Socket.IO.

## Required environment variables

Add secrets in hPanel's Environment Variables section. Do not commit or upload
the local `.env` file.

```dotenv
NODE_ENV=production
MONGO_URI=<mongodb-atlas-connection-string>
ALLOWED_ORIGINS=https://<production-domain>
TRUST_PROXY=1
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
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=<private-s3-bucket-name>
AWS_ACCESS_KEY_ID=<dedicated-iam-access-key>
AWS_SECRET_ACCESS_KEY=<dedicated-iam-secret-key>
S3_SIGNED_URL_TTL_SECONDS=900
MEDIA_URL_SIGNING_SECRET=<separate-long-random-secret>
```

Add the remaining seed/demo variables from `backend/.env.example` only when they
are intentionally needed. Production supervisor and officer passwords must not
use the example values.

The production start command validates these settings before connecting to the
database. Startup intentionally fails when origins, proxy depth, OTP/GPS secrets,
or Gmail OTP delivery are missing or unsafe. `OTP_SECRET` and
`GPS_INGEST_API_KEY` must be different random values with at least 32 characters.

When all AWS variables are configured, new profile photos and report evidence
use the private S3 bucket. Existing `/uploads/...` records remain readable.
Keep Block Public Access enabled and use only the restricted
`geosentri-backend-s3` IAM credentials. See `docs/S3_MEDIA_STORAGE.md` for the
permission test and key-rotation procedure.

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
