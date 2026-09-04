# BantayCabagan (GeoSentri)

BantayCabagan is an IoT-enabled public safety and police operations platform for Cabagan. It connects a web operations dashboard, a mobile app for field personnel, and a real-time backend for GPS monitoring, deployments, tasks, and incident reporting.

## Features

- Real-time personnel and device location monitoring
- Interactive MapLibre maps with barangay and geofence data
- Personnel accounts, device assignments, and status management
- Deployment scheduling and task workflows
- Incident, patrol, checkpoint, and operational reports
- Evidence uploads and controlled media access
- Emergency alerts, notifications, and audit logs
- Barangay-level operational analytics and deployment priorities
- WebSocket updates through Socket.IO
- GPS telemetry ingestion through Flespi MQTT or the HTTP API

## Applications

| Application | Purpose | Main technologies |
| --- | --- | --- |
| `frontend` | Supervisor and operations dashboard | React, Vite, Bootstrap, MapLibre GL |
| `bantaycabagan-mobileapp` | Field personnel mobile application | Expo, React Native, TypeScript, MapLibre |
| `backend` | REST API, realtime events, telemetry, and persistence | Node.js, Express, MongoDB, Socket.IO, MQTT, AWS SDK |

## Project structure

```text
CapstoneProject-IoT/
├── backend/                    # API, realtime services, and integrations
├── frontend/                   # Web operations dashboard
├── bantaycabagan-mobileapp/    # Expo mobile application
├── contracts/                  # Shared domain contracts and fixtures
└── docs/                       # API, security, storage, and deployment notes
```

## Requirements

- Node.js `>=22.13 <25`
- npm
- MongoDB
- MapTiler API key for map tiles
- Flespi credentials for live GPS devices
- Expo development environment for the mobile app
- An AWS account with EC2, S3, and IAM access for the recommended production deployment

Local development can use filesystem media storage. In production, the recommended architecture runs the web dashboard and API on a single AWS EC2 instance and stores private media in Amazon S3.

## AWS infrastructure

- **Amazon EC2** hosts the built dashboard and the always-on Node.js API.
- **Amazon S3** stores private officer profile photos and report evidence.
- **AWS IAM** restricts the backend to the required S3 bucket and media prefixes.
- **Elastic IP** provides a stable address for DNS and the MongoDB Atlas allowlist.
- **Nginx, TLS, and PM2** proxy HTTPS/WebSocket traffic and keep the application running on EC2.

The backend must run as a single process because it owns the realtime socket rooms, GPS broadcasts, Flespi synchronization, and operational timers. See [AWS deployment](docs/AWS_DEPLOYMENT.md) and [S3 media storage](docs/S3_MEDIA_STORAGE.md) for the complete production setup.

## Local development

1. Clone the repository and install the web/backend workspace dependencies.

   ```bash
   git clone https://github.com/CoffeeDev-Err/CapstoneProject-IoT.git
   cd CapstoneProject-IoT
   npm install
   ```

2. Install the mobile application dependencies.

   ```bash
   npm install --prefix bantaycabagan-mobileapp
   ```

3. Create local environment files from these templates and replace the placeholder values:

   - `backend/.env.example` → `backend/.env`
   - `frontend/.env.example` → `frontend/.env`
   - `bantaycabagan-mobileapp/.env.example` → `bantaycabagan-mobileapp/.env`

4. Start the backend and web dashboard together.

   ```bash
   npm run dev
   ```

5. Start the Expo app in another terminal.

   ```bash
   npm run start --prefix bantaycabagan-mobileapp
   ```

The development API runs on `http://localhost:4000` by default.

## Quality checks

```bash
npm run check
```

This runs the configured lint, test, validation, security, and build checks across the backend, web dashboard, and mobile app.

## Documentation

- [API contracts](docs/api-contracts.md)
- [Database schema plan](docs/database-schema-plan.md)
- [Input validation and security](docs/INPUT_VALIDATION_AND_SECURITY.md)
- [S3 media storage](docs/S3_MEDIA_STORAGE.md)
- [AWS deployment](docs/AWS_DEPLOYMENT.md)
- [Hostinger deployment](docs/HOSTINGER_DEPLOYMENT.md)

## Security

Do not commit `.env` files, API keys, passwords, service-account files, or production credentials. Use restricted credentials for external services and rotate any credential that may have been exposed.

