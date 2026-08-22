
# AWS deployment (single EC2, same-origin)

This guide deploys the production dashboard **and** the Express API together as
one always-on Node.js process on a single EC2 instance, fronted by Nginx for TLS
and WebSocket proxying. The mobile app calls the same public HTTPS domain.

This is the recommended shape for BantayCabagan/GeoSentri because:

- `backend/src/server.js` already serves `frontend/dist` (the built dashboard),
  `/api`, the signed media gateway, and Socket.IO from one process. Keeping
  everything on **one origin** is what makes the hardened `gs_session` auth
  cookie (httpOnly + `SameSite=Lax` + `Secure`) work without extra CSRF/cross-site
  configuration.
- The server runs **background timers** (mock-GPS broadcast, Flespi sync, the
  ~15s operational lifecycle loop, 30s history sampling). These must run on
  **exactly one instance** — never autoscale this app (see [Why one instance](#why-one-instance)).

> AWS also hosts the private S3 media bucket, so compute, storage, and IAM live
> in one account and one region.

---

## Architecture at a glance

```
  Browser / Mobile app
          │  HTTPS (443) + WSS
          ▼
   z.com domain  ──DNS A record──►  EC2 Elastic IP
                                        │
                                   ┌────▼──────────────────────────┐
                                   │ EC2 (Ubuntu, t3.small)         │
                                   │                                │
                                   │  Nginx :443  (TLS, WS upgrade) │
                                   │      │ proxy_pass              │
                                   │      ▼ 127.0.0.1:4000          │
                                   │  Node (PM2)                    │
                                   │   • serves frontend/dist       │
                                   │   • /api + media gateway       │
                                   │   • Socket.IO                  │
                                   └───────┬────────────┬───────────┘
                                           │            │
                                  MongoDB Atlas     AWS S3 (private
                                  (M0/M2 SRV URI)   media bucket + IAM)
```

Port `4000` is **never** exposed publicly — only Nginx (on the same box) talks to
it over localhost.

---

## Prerequisites

Gather these before you start. Nothing here is invented by the app — you create
or obtain each one:

| Item                                   | Where it comes from                                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| AWS account with EC2 + S3 access       | aws.amazon.com (Free Tier / credits cover a small instance)         |
| Domain name                            | Purchased from z.com (or any registrar)                             |
| MongoDB connection string              | MongoDB Atlas cluster (free M0 tier works)                          |
| Private S3 bucket + restricted IAM key | See`docs/S3_MEDIA_STORAGE.md`                                     |
| Gmail address + 16-char App Password   | Google account with 2FA → App Passwords                            |
| Flespi token                           | Flespi dashboard (restricted token)                                 |
| Three 32+ char random secrets          | You generate them (see[Generate the secrets](#generate-the-secrets)) |

**Node version:** the repo requires Node **>=22.13 <25**. Install Node 22.x on
the server.

---

## Part A — Provision infrastructure

### A1. MongoDB Atlas

1. Create a free **M0** cluster (choose the AWS region closest to your EC2, e.g.
   `ap-southeast-1` Singapore, to keep latency low).
2. **Database Access** → add a database user with a strong password.
3. **Network Access** → add the **EC2 Elastic IP** (from step A3) to the
   allowlist. Prefer a specific IP over `0.0.0.0/0`.
4. **Connect** → *Drivers* → copy the `mongodb+srv://…` connection string. This
   becomes `MONGO_URI` (URL-encode any special characters in the password).

> `environment.js` refuses to start unless `MONGO_URI` matches
> `mongodb://` or `mongodb+srv://`, and the whole app **fails closed before
> connecting to the DB** if any production setting is unsafe.

### A2. S3 bucket + IAM key

Follow `docs/S3_MEDIA_STORAGE.md` exactly. In short:

- Create a **private** bucket (Block Public Access **on**) in your region.
- Create a dedicated, **restricted** IAM user (e.g. `geosentri-backend-s3`) with
  access to only that bucket.
- Note the region, bucket name, access key, and secret. These become
  `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

> If the four AWS values are absent, the backend falls back to local
> `backend/uploads`. For production, configure S3.

### A3. EC2 instance

1. Launch an instance:
   - **AMI:** Ubuntu Server 24.04 LTS (or 22.04 LTS)
   - **Type:** `t3.small` recommended (`t3.micro` works for light load / Free Tier)
   - **Key pair:** create/download one for SSH
   - **Storage:** 20 GB gp3 is plenty
2. Allocate an **Elastic IP** and associate it with the instance (so the public
   IP survives reboots — DNS and the Atlas allowlist depend on it).

### A4. Security group (the instance firewall)

Inbound rules — keep this tight:

| Port        | Source                 | Purpose                               |
| ----------- | ---------------------- | ------------------------------------- |
| 22 (SSH)    | **Your IP only** | Admin access                          |
| 80 (HTTP)   | Anywhere               | Certbot challenge + redirect to HTTPS |
| 443 (HTTPS) | Anywhere               | The app                               |

**Do not** open port 4000. The Node process stays private behind Nginx.

---

## Part B — Domain & DNS (z.com)

1. Buy the domain in z.com.
2. In z.com's DNS management, create an **A record** pointing your domain to the
   **EC2 Elastic IP**:
   - `@` (or `geosentri.yourdomain.com`) → `<elastic-ip>`
   - Optionally add `www` → `<elastic-ip>` too.
3. Wait for DNS to propagate (minutes to a couple hours). Verify:
   ```sh
   nslookup yourdomain.com
   ```

   It should resolve to your Elastic IP before you run Certbot.

Your final origin (e.g. `https://yourdomain.com`) becomes `ALLOWED_ORIGINS`.

---

## Part C — Server setup on EC2

SSH in (`ssh -i your-key.pem ubuntu@<elastic-ip>`), then:

### C1. Install Node 22.x, git, Nginx

```sh
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node -v   # confirm v22.x
```

### C2. Clone and build

```sh
cd /home/ubuntu
git clone <your-repo-url> BantayCabagan-System
cd BantayCabagan-System

# Install ALL workspace deps (backend + frontend). Do NOT export
# NODE_ENV=production in this shell, or the frontend build tools (vite) are
# skipped and the build fails.
npm ci

# Build the dashboard into frontend/dist
npm run build
```

> The mobile app is **not** an npm workspace, so it is not installed here — the
> server only needs backend + frontend.

### C3. Create the environment file

The app loads `.env` from the backend working directory. Copy the template and
edit it:

```sh
cp backend/.env.example backend/.env
nano backend/.env
```

Set at least the [required production variables](#part-g--environment-variable-reference).
Generate the three secrets first (next section). Save the file with permissions
locked down:

```sh
chmod 600 backend/.env
```

> `backend/.env` is git-ignored. Never commit it.

#### Generate the secrets

Run this **three times** to get three different values for `OTP_SECRET`,
`GPS_INGEST_API_KEY`, and `MEDIA_URL_SIGNING_SECRET` (they must all differ):

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### C4. First-run smoke test (foreground)

Before wiring up a process manager, confirm the app boots and passes its own
production validation:

```sh
npm start
```

- If the config is unsafe, it prints `Unsafe production configuration:` with the
  exact missing/invalid items and exits — fix `.env` and retry.
- On success it logs `GeoSentri backend server running on port 4000`.

In a second SSH session, confirm the API answers locally:

```sh
curl http://127.0.0.1:4000/api/health   # expect JSON with status: ok
```

Stop the foreground process (`Ctrl+C`) once verified.

---

## Part D — Nginx reverse proxy (with WebSocket upgrade)

Create the site config:

```sh
sudo nano /etc/nginx/sites-available/geosentri
```

Paste (replace `yourdomain.com`):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Report evidence uploads are capped at 5 MB by the app; give a little headroom.
    client_max_body_size 8M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Required for Socket.IO WebSocket upgrade — without these, realtime
        # silently downgrades to HTTP long-polling.
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Preserve client info so TRUST_PROXY / rate limiting / Secure-cookie
        # detection work correctly.
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
    }
}
```

Enable it and reload:

```sh
sudo ln -s /etc/nginx/sites-available/geosentri /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

With the app running (Part C4 or F), `http://yourdomain.com` should now load the
dashboard.

---

## Part E — HTTPS with Certbot (Let's Encrypt)

```sh
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot obtains the certificate, rewrites the Nginx config to serve HTTPS on 443,
and adds an HTTP→HTTPS redirect. Renewal is automatic via a systemd timer; test
it with:

```sh
sudo certbot renew --dry-run
```

Because the `gs_session` cookie is issued with the **`Secure`** flag in
production, TLS is mandatory — login will not work over plain HTTP.

---

## Part F — Keep it always-on (PM2)

Install PM2 and start the app as a managed, auto-restarting service.

```sh
sudo npm install -g pm2
```

Create `/home/ubuntu/geosentri.config.js` (server-local, not committed):

```js
module.exports = {
  apps: [{
    name: 'geosentri',
    script: 'scripts/start-production.js',
    cwd: '/home/ubuntu/BantayCabagan-System/backend',
    instances: 1,          // MUST stay 1 — see "Why one instance"
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    env: { NODE_ENV: 'production' },
  }],
}
```

Start it, enable boot persistence, and save:

```sh
pm2 start /home/ubuntu/geosentri.config.js
pm2 startup systemd            # prints a `sudo …` command — run that command
pm2 save
```

Useful commands: `pm2 logs geosentri`, `pm2 restart geosentri`,
`pm2 status`.

> Prefer plain systemd? See the [systemd alternative](#appendix-systemd-alternative).

<a name="why-one-instance"></a>

### Why one instance

`server.js` drives GPS broadcasts, Flespi sync, the operational lifecycle loop,
and history sampling on interval timers, and Socket.IO clients join per-actor
rooms held in that process's memory. Running two or more instances would
double-fire those loops (duplicate broadcasts and lifecycle mutations) and split
socket rooms across processes. Keep `instances: 1` and do not put this app behind
an autoscaling group. One `t3.small` comfortably serves a single station.

---

## Part G — Environment variable reference

The production start command (`backend/scripts/start-production.js` → `config/environment.js`)
**validates the environment and fails closed** before touching the database.

### Required in production (validated)

```dotenv
NODE_ENV=production
MONGO_URI=<mongodb-atlas-connection-string>
ALLOWED_ORIGINS=https://yourdomain.com
TRUST_PROXY=1
OTP_SECRET=<random-32+ char secret #1>
GPS_INGEST_API_KEY=<random-32+ char secret #2>
MEDIA_URL_SIGNING_SECRET=<random-32+ char secret #3>
EMAIL_DELIVERY_MODE=gmail
GMAIL_USER=<notification-gmail-address>
GMAIL_APP_PASSWORD=<16-char google app password>
```

Validation rules enforced at startup:

- `MONGO_URI` must be a `mongodb://` or `mongodb+srv://` string.
- `ALLOWED_ORIGINS` — one or more **exact HTTPS origins**, comma-separated, **no
  wildcards, no trailing path**. This drives CORS *and* the CSP realtime/image
  pinning. Use the exact origin the browser shows (e.g. `https://yourdomain.com`).
- `TRUST_PROXY` — the exact number of trusted proxies, `1`–`10`. Behind a single
  Nginx, use **`1`**.
- `OTP_SECRET`, `GPS_INGEST_API_KEY`, `MEDIA_URL_SIGNING_SECRET` — each ≥32
  characters, non-placeholder, and **all three must be different**.
- `EMAIL_DELIVERY_MODE` must be `gmail`, and `GMAIL_USER` + `GMAIL_APP_PASSWORD`
  must be set, or OTP email is disabled (login/reset break).

### Functional / integration variables

Copy from `backend/.env.example` and set as needed:

```dotenv
PORT=4000                        # optional; Nginx proxies to this port
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=<private-bucket-name>
AWS_ACCESS_KEY_ID=<restricted-iam-key>
AWS_SECRET_ACCESS_KEY=<restricted-iam-secret>
S3_SIGNED_URL_TTL_SECONDS=900
FLESPI_TOKEN=<restricted-flespi-token>
FLESPI_MQTT_ENABLED=true
DEPLOYMENT_STATUS_INTERVAL_MS=15000
SHIFT_REMINDER_MINUTES=30
EMAIL_FROM=GeoSentri <your-gmail-address>
```

Seed/demo accounts (`SUPERVISOR_*`, `DEMO_OFFICER_*`) and the optional
`ENABLE_MOCK_OFFICER` block are documented in `backend/.env.example` and
`docs/mock-officer-testing.md`. **Production supervisor/officer passwords must not
use the example values.**

---

## Part H — Mobile production build

Once `https://yourdomain.com/api/health` returns JSON, point the mobile app at
the live domain. In the EAS production environment:

```dotenv
EXPO_PUBLIC_API_URL=https://yourdomain.com
```

Do **not** enable `ALLOW_CLEARTEXT_TRAFFIC` in production. Build the Android app:

```sh
cd bantaycabagan-mobileapp
eas build --platform android --profile production
```

The mobile app keeps using `expo-secure-store` + `Authorization: Bearer` — the
web cookie migration does not affect it (the backend accepts both cookie and
Bearer).

---

## Part I — Verification checklist

1. `https://yourdomain.com/api/health` returns `status: ok`.
2. Browser padlock shows a valid Let's Encrypt certificate.
3. Log in to the dashboard as a **supervisor**. In DevTools → Application →
   Cookies, confirm `gs_session` is present with **HttpOnly ✓** and
   **SameSite=Lax**, and that **no session token** sits in Local Storage.
4. The TopBar status pill shows **Live** and GPS markers move — this confirms the
   **WebSocket upgrade** works through Nginx (not just polling). Check
   DevTools → Network → WS for a `101 Switching Protocols`.
5. Hard-reload the page — the session persists (cookie-based).
6. Create and view a report with photo evidence (exercises S3 upload + signed
   media gateway).
7. Log in on the installed Android build; assign a task and confirm the phone
   receives it; lock the phone and verify push notifications.
8. Change-password flow completes and forces re-login; logout clears the cookie.
9. `pm2 restart geosentri` (or reboot the instance) and confirm the app comes
   back up and evidence still opens.

---

## Part J — Updates and redeploys

```sh
cd /home/ubuntu/BantayCabagan-System
git pull
npm ci
npm run build
pm2 restart geosentri
```

Run the full check suite locally (`npm run check`) before pushing changes you
intend to deploy.

---

## Security notes (ties to the hardened config)

- **Same-origin** keeps the auth cookie simple and safe. If you ever split the
  SPA and API onto different hosts, only use **subdomains of the same registrable
  domain** (e.g. `app.` + `api.` of one domain) so `SameSite=Lax` cookies still
  flow; never split across two unrelated domains without moving to `SameSite=None`.
- **Port 4000 stays private** — only Nginx reaches it. Never add it to the
  security group.
- **`TRUST_PROXY=1`** matches exactly one Nginx hop. A wrong value either breaks
  rate limiting (all clients collapse to one IP) or lets clients spoof
  `X-Forwarded-For`.
- **Restricted IAM + Block Public Access** on the S3 bucket — the media is police
  PII served only through short-lived signed links. Rotate keys per
  `docs/S3_MEDIA_STORAGE.md`.
- **Atlas Network Access** allowlists only the EC2 Elastic IP.
- **Three distinct 32+ char secrets** — key separation means one leak does not
  compromise the others. Startup enforces this.
- Keep `backend/.env` at `chmod 600` and out of git.

---

## Appendix: systemd alternative

If you prefer no global PM2 dependency, run the app as a systemd service.

Create `/etc/systemd/system/geosentri.service`:

```ini
[Unit]
Description=GeoSentri (BantayCabagan) backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/BantayCabagan-System/backend
ExecStart=/usr/bin/node scripts/start-production.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
# .env in WorkingDirectory is loaded by the app; or use:
# EnvironmentFile=/home/ubuntu/BantayCabagan-System/backend/.env

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now geosentri
sudo systemctl status geosentri
journalctl -u geosentri -f   # logs
```

Run a **single** service instance only (same reason as
[Why one instance](#why-one-instance)).

---

## Appendix: troubleshooting

| Symptom                                                | Likely cause / fix                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup exits with`Unsafe production configuration:` | Read the listed items — a required var is missing, an origin isn't HTTPS,`TRUST_PROXY` isn't 1–10, or two secrets match / are <32 chars. |
| `502 Bad Gateway` from Nginx                         | Node isn't running (`pm2 status` / `journalctl`) or isn't on port 4000.                                                                  |
| Status pill stays**Offline** but data loads      | WebSocket upgrade blocked — confirm the`Upgrade`/`Connection` headers in the Nginx `location` block and reload Nginx.                 |
| Login fails / cookie not set                           | Not served over HTTPS, or`ALLOWED_ORIGINS` doesn't exactly match the browser origin.                                                       |
| OTP email never arrives                                | `EMAIL_DELIVERY_MODE` isn't `gmail`, or `GMAIL_APP_PASSWORD` is wrong (use a 16-char App Password, not the account password).          |
| Certbot fails to issue                                 | DNS A record not yet pointing to the Elastic IP, or port 80 blocked in the security group.                                                   |
| Evidence images 403 / won't open                       | AWS vars wrong, IAM key lacks bucket access, or`MEDIA_URL_SIGNING_SECRET` changed after links were issued (they're short-lived; reload).   |
| `npm run build` fails on the server                  | `NODE_ENV=production` was exported in the shell, so vite (a devDependency) wasn't installed. Unset it and re-run `npm ci`.               |

---

See also: `docs/HOSTINGER_DEPLOYMENT.md` (managed-host alternative),
`docs/S3_MEDIA_STORAGE.md` (bucket + IAM setup), and
`docs/INPUT_VALIDATION_AND_SECURITY.md` (the security boundary this deployment
protects).
