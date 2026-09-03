# GeoSentri AWS Lightsail deployment runbook

Ito ang aktuwal na step-by-step deployment na ginawa para sa GeoSentri noong
September 2026. Naka-deploy ang React/Vite frontend at Express/Socket.IO backend
sa iisang AWS Lightsail instance, habang external services ang MongoDB Atlas,
Flespi, Gmail, at AWS S3.

> Huwag ilagay sa document na ito ang `.env`, MongoDB URI, Flespi token, Gmail
> App Password, AWS secret key, o SSH private-key contents.

## Current deployment details

| Setting | Value |
| --- | --- |
| AWS service | Amazon Lightsail |
| Instance | `geosentri-prod` |
| Region | Singapore, Zone A (`ap-southeast-1a`) |
| Operating system | Ubuntu 24.04 LTS |
| Plan | General purpose, 2 GB RAM, 2 vCPU, 60 GB SSD |
| Networking | Dual-stack IPv4 and IPv6 |
| Static IPv4 | `13.229.17.177` |
| Static IP resource | `geosentri-static-ip` |
| Node.js | `v22.23.2` |
| npm | `10.9.8` |
| PM2 | `7.0.4` |
| Backend port | `4000`, localhost only |
| Public ports | `80` and `443` through Nginx |
| Repository | `https://github.com/CoffeeDev-Err/CapstoneProject-IoT.git` |
| Installed path | `/var/www/geosentri` |

Port `4000` must not be opened in the Lightsail firewall. Only Nginx should
connect to it through `127.0.0.1`.

## 1. Create the Lightsail instance

In the AWS Lightsail console:

1. Click **Create instance**.
2. Set the location to **Singapore, Zone A**.
3. Select **Linux operating system**.
4. Select **Ubuntu 24.04 LTS**.
5. Select **General purpose**.
6. Select **Dual-stack** networking, not IPv6-only.
7. Select the **$12/month** plan with 2 GB RAM, 2 vCPU, and 60 GB SSD.
8. Set the instance name to `geosentri-prod`.
9. Leave **Automatic snapshots** disabled for the defense deployment.
10. Leave **Advanced settings** unchanged.
11. Click **Create instance** and wait for the status to become **Running**.

Billing starts when the instance is created. Stopping a Lightsail instance does
not necessarily stop its instance charges; delete the resource when it is no
longer needed.

## 2. Attach the static IP

1. Open `geosentri-prod`.
2. Open the **Networking** tab.
3. Click **Attach static IP**.
4. Name it `geosentri-static-ip`.
5. Click **Create and attach**.

The original dynamic public IP changed to the current static IP
`13.229.17.177`. The Hostinger A record will point to this static IP after the
client approves the final domain.

## 3. Configure the Lightsail firewall

The instance initially had HTTP port 80 and SSH port 22. Add HTTPS:

1. In **Networking > Firewall rules**, click **Add rule**.
2. Set **Application** to `HTTPS`.
3. Confirm protocol `TCP` and port `443`.
4. Add source preset **Anywhere IPv4**, which produces `0.0.0.0/0`.
5. Add another source preset **Anywhere IPv6**, which produces `::/0`.
6. Click **Add rule**.

Final public application rules:

| Application | Protocol | Port | Source |
| --- | --- | --- | --- |
| HTTP | TCP | 80 | Anywhere IPv4/IPv6 |
| HTTPS | TCP | 443 | Anywhere IPv4/IPv6 |
| SSH | TCP | 22 | Administrative access / Lightsail browser SSH |

Do not add a public rule for port `4000`.

## 4. Connect through browser SSH

Open the instance's **Connect** tab and click **Connect using SSH**. Commands in
the following sections run inside the Ubuntu SSH terminal unless the heading
explicitly says Windows PowerShell.

## 5. Update Ubuntu

Run one command at a time:

```bash
sudo apt update
```

```bash
sudo apt upgrade -y
```

The upgrade reported a pending kernel update, so reboot:

```bash
sudo reboot
```

After approximately 30 seconds, reconnect through browser SSH and verify:

```bash
uname -r
```

Observed result:

```text
7.0.0-1011-aws
```

## 6. Install Git, curl, and Nginx

```bash
sudo apt install -y git curl nginx
```

```bash
systemctl is-active nginx
```

Expected result: `active`.

## 7. Install Node.js 22

Download the NodeSource script:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
```

Run it:

```bash
sudo -E bash nodesource_setup.sh
```

Install Node.js:

```bash
sudo apt install -y nodejs
```

Verify Node.js and npm:

```bash
node -v
```

```bash
npm -v
```

Observed versions were Node.js `v22.23.2` and npm `10.9.8`. The npm major
upgrade notice was intentionally ignored.

## 8. Install PM2

```bash
sudo npm install -g pm2
```

```bash
pm2 -v
```

Observed version: `7.0.4`.

## 9. Clone and build GeoSentri

Create the deployment directory:

```bash
sudo mkdir -p /var/www/geosentri
```

```bash
sudo chown ubuntu:ubuntu /var/www/geosentri
```

Clone the repository:

```bash
git clone https://github.com/CoffeeDev-Err/CapstoneProject-IoT.git /var/www/geosentri
```

Enter the project:

```bash
cd /var/www/geosentri
```

Verify the commit:

```bash
git rev-parse HEAD
```

Deployed commit:

```text
a1060bb50e5d36f2197ac97125f1d773043db720
```

Install the lockfile dependencies:

```bash
npm ci
```

This completed with 0 vulnerabilities. Build the web frontend:

```bash
npm run build
```

The build is generated in `frontend/dist`. The mobile app is not built or
hosted on this server.

## 10. Transfer the production `.env` securely

The local source was:

```text
C:\desktop\BantayCabagan-System\backend\.env
```

The Lightsail browser paste function truncated the multiline `.env`, so the
partial Nano buffer was discarded with `Ctrl+X`, then `N`. SCP was used instead.

### 10.1 Download the SSH key

In **Lightsail > geosentri-prod > Connect**, click **Download default key**.
Never share or commit the `.pem` file.

### 10.2 Find the key in local Windows PowerShell

```powershell
Get-ChildItem "$env:USERPROFILE\Downloads\*.pem" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 Name, FullName
```

Downloaded filename:

```text
LightsailDefaultKey-ap-southeast-1.pem
```

### 10.3 Restrict the Windows key permissions

The first SCP attempt was rejected with `UNPROTECTED PRIVATE KEY FILE`. Remove
inherited permissions and grant only the current Windows user read access:

```powershell
icacls "$env:USERPROFILE\Downloads\LightsailDefaultKey-ap-southeast-1.pem" /inheritance:r
```

```powershell
icacls "$env:USERPROFILE\Downloads\LightsailDefaultKey-ap-southeast-1.pem" /grant:r "$($env:USERNAME):(R)"
```

### 10.4 Copy `.env` to Lightsail

```powershell
scp -i "$env:USERPROFILE\Downloads\LightsailDefaultKey-ap-southeast-1.pem" "C:\desktop\BantayCabagan-System\backend\.env" ubuntu@13.229.17.177:/var/www/geosentri/backend/.env
```

On the first connection, type `yes` only after confirming the expected static
IP. Back in the AWS terminal:

```bash
cd /var/www/geosentri
```

Verify only that the file is non-empty; do not print its contents:

```bash
test -s backend/.env && echo "env file transferred"
```

Protect it:

```bash
chmod 600 backend/.env
```

## 11. Add temporary production-only values

The final domain was not available, so a temporary HTTPS origin using the
static IP was added to pass strict production validation:

```bash
printf '\nALLOWED_ORIGINS=https://13.229.17.177\nTRUST_PROXY=1\n' >> backend/.env
```

Generate the GPS ingest secret without displaying it:

```bash
openssl rand -hex 32 | sed 's/^/GPS_INGEST_API_KEY=/' >> backend/.env
```

Validate without printing secret values:

```bash
NODE_ENV=production DOTENV_CONFIG_PATH=backend/.env node -r dotenv/config -e "require('./backend/src/config/environment').validateProductionEnvironment(); console.log('production env valid')"
```

Expected result: `production env valid`.

The temporary `ALLOWED_ORIGINS=https://13.229.17.177` must be replaced with the
exact final HTTPS domain before final login testing.

## 12. Start GeoSentri using PM2

From `/var/www/geosentri`:

```bash
pm2 start npm --name geosentri -- start
```

Inspect startup:

```bash
pm2 logs geosentri --lines 50 --nostream
```

The first startup could not reach MongoDB Atlas because the Lightsail IP was not
yet allowed. Stop the retry loop:

```bash
pm2 stop geosentri
```

## 13. Allow the Lightsail IP in MongoDB Atlas

1. Select the GeoSentri Atlas project.
2. Open **Database & Network Access**.
3. If hidden, use the route `#/security/network/accessList` after the project
   URL.
4. Click **Add IP Address**.
5. Enter `13.229.17.177/32`.
6. Comment: `GeoSentri AWS Lightsail production server`.
7. Keep the temporary-entry switch disabled.
8. Confirm and wait until the entry becomes **Active**.

Do not add `0.0.0.0/0` to Atlas. Use the exact server IP.

Restart the application:

```bash
pm2 restart geosentri
```

```bash
pm2 logs geosentri --lines 30 --nostream
```

Successful startup contains:

```text
MongoDB connected successfully
MongoDB collections and indexes are ready
Flespi MQTT realtime sync enabled
Flespi REST fallback enabled (3000ms interval)
GeoSentri backend server running on port 4000
Flespi MQTT connected and subscribed to flespi/state/gw/devices/+/telemetry/+
```

Test the backend directly:

```bash
curl http://127.0.0.1:4000/api/health
```

Expected response:

```json
{"status":"ok","service":"GeoSentri backend"}
```

## 14. Configure PM2 auto-start

```bash
pm2 save
```

Generate the systemd command:

```bash
pm2 startup systemd
```

Run the command printed by PM2. For this server it was:

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

Save again:

```bash
pm2 save
```

Verify:

```bash
systemctl is-enabled pm2-ubuntu
```

Expected result: `enabled`.

## 15. Configure Nginx

Create the site file:

```bash
sudo nano /etc/nginx/sites-available/geosentri
```

Paste:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;
    client_max_body_size 25M;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 65s;
        proxy_send_timeout 65s;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save using `Ctrl+O`, Enter, then exit using `Ctrl+X`.

Inspect enabled sites:

```bash
ls -l /etc/nginx/sites-enabled/
```

Remove only the enabled default-site symlink:

```bash
sudo rm /etc/nginx/sites-enabled/default
```

Enable GeoSentri:

```bash
sudo ln -s /etc/nginx/sites-available/geosentri /etc/nginx/sites-enabled/geosentri
```

Test before applying:

```bash
sudo nginx -t
```

Expected output includes `syntax is ok` and `test is successful`.

Apply:

```bash
sudo systemctl reload nginx
```

Test the backend through Nginx port 80:

```bash
curl http://127.0.0.1/api/health
```

Verify automatic startup:

```bash
systemctl is-enabled nginx
```

Expected result: `enabled`.

## 16. Install Certbot while waiting for the domain

```bash
sudo apt install -y certbot python3-certbot-nginx
```

```bash
certbot --version
```

Observed version: `certbot 2.9.0`.

```bash
systemctl is-enabled certbot.timer
```

Expected result: `enabled`. Do not request a certificate until the approved
domain points to the Lightsail static IP.

## 17. Verify Socket.IO through Nginx

```bash
curl "http://127.0.0.1/socket.io/?EIO=4&transport=polling"
```

A successful response starts with `0{`, contains a temporary `sid`, and lists
`websocket` under upgrades.

## 18. PM2 status and cleanup commands used

```bash
pm2 status
```

The observed process was `online`, used approximately 69 MB of memory, and
almost no CPU while idle.

The restart counter came from the resolved Atlas error. Reset only that
historical counter:

```bash
pm2 reset geosentri
```

Clear understood, old PM2 logs:

```bash
pm2 flush
```

This does not delete reports, MongoDB records, source code, uploads, or other
application data.

```bash
pm2 logs geosentri --lines 20 --nostream
```

## 19. Why the static-IP page is blank before SSL

Opening `http://13.229.17.177` reaches Nginx, but production Content Security
Policy uses `upgrade-insecure-requests`. The browser upgrades assets to
`https://13.229.17.177`, while no trusted HTTPS certificate exists yet. This
causes `ERR_CONNECTION_REFUSED` and a blank page.

This is expected and is not a failed frontend build. Do not weaken production
security to make plain HTTP login work. Complete the approved domain and SSL
steps instead.

## 20. Pending steps after the domain is approved

These were not yet executed:

1. Confirm the exact domain and whether it is a root domain or subdomain.
2. In that approved GeoSentri domain's Hostinger DNS, create an A record pointing
   to `13.229.17.177`.
3. Do not change the existing POS website's DNS or Hostinger server IP.
4. Wait until the domain resolves to the Lightsail static IP.
5. Replace `server_name _;` in the Nginx file with the approved domain.
6. Replace temporary `ALLOWED_ORIGINS=https://13.229.17.177` in `backend/.env`
   with the exact HTTPS domain.
7. Validate the environment, reload Nginx, and restart PM2.
8. Request the Let's Encrypt certificate using Certbot.
9. Test browser login, OTP, Socket.IO, Flespi, reports, S3 evidence, and mobile.

Example commands only after replacing the placeholder domain:

```bash
sudo nano /etc/nginx/sites-available/geosentri
```

```bash
nano /var/www/geosentri/backend/.env
```

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

```bash
pm2 restart geosentri
```

```bash
sudo certbot --nginx -d geosentri.example.com
```

```bash
sudo certbot renew --dry-run
```

Do not run the Certbot example literally. Replace `geosentri.example.com` with
the final approved domain.

## 21. Mobile application after the domain is live

The APK is not hosted on Lightsail. It connects to the cloud backend. After
HTTPS works, set:

```dotenv
EXPO_PUBLIC_API_URL=https://geosentri.example.com
```

Replace the example domain, then bump the mobile version/versionCode when
appropriate. The project owner builds and signs the APK locally; this deployment
process must not automatically build an APK.

## 22. Updating the deployment later

Only deploy changes that were intentionally committed and pushed:

```bash
cd /var/www/geosentri
```

```bash
git pull --ff-only
```

```bash
npm ci
```

```bash
npm run build
```

```bash
pm2 restart geosentri
```

```bash
pm2 save
```

Verify:

```bash
curl http://127.0.0.1:4000/api/health
```

```bash
sudo nginx -t
```

```bash
pm2 logs geosentri --lines 30 --nostream
```

### 22.1 Deploy the numeric Login ID and mobile pagination update

Commit and push the intended local changes first. On the Lightsail instance:

```bash
cd /var/www/geosentri
git status --short
git pull --ff-only
```

Update only these Login ID values in the existing production environment file.
Do not replace the password, email, MongoDB URI, or other secrets:

```bash
nano /var/www/geosentri/backend/.env
```

```dotenv
SUPERVISOR_LOGIN_ID=00-0001
```

Do not change `DEMO_OFFICER_LOGIN_ID` during this deployment. The next startup
finds the existing supervisor through its official email and changes only its
Login ID. It refuses to take an ID that already belongs to another account.

Install, validate, build, and restart:

```bash
cd /var/www/geosentri
npm ci
npm run check:backend
npm run check:frontend
npm run build
pm2 restart geosentri --update-env
pm2 save
```

Verify that the migration and services completed successfully:

```bash
pm2 status
pm2 logs geosentri --lines 50 --nostream
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1/api/health
```

The expected migration log includes the supervisor Login ID changing to
`00-0001`. Sign in through the web portal with that Login ID, the existing
supervisor password, and the OTP sent to the official supervisor email.

If an earlier deployment created both a legacy `supervisor` record and a new
`00-0001` record, reconcile them before signing in. Review the dry-run plan,
then apply it:

```bash
cd /var/www/geosentri/backend
npm run migrate:supervisor-login
npm run migrate:supervisor-login -- --apply
```

The guarded migration only removes an unused, never-logged-in placeholder,
then assigns `00-0001` to the established active supervisor. It preserves the
established password and account identity and aborts if the records are
ambiguous or the placeholder has ever been used.

After the backend is healthy, build the mobile preview APK from the local
computer. EAS uploads the local mobile project, so GitHub is not required for
the APK build itself:

```powershell
cd C:\desktop\BantayCabagan-System\bantaycabagan-mobileapp
npx eas build --platform android --profile preview
```

The preview profile targets `http://13.229.17.177`, so the installed APK can use
any Wi-Fi or mobile-data connection. Rebuild again with the final HTTPS domain
and disable cleartext traffic after the domain certificate is active.

## 23. Local development remains available

AWS deployment does not remove or overwrite the local project:

```powershell
npm run dev
```

The local and AWS backends use the same MongoDB Atlas and Flespi services. If
both backends run simultaneously, both can receive realtime Flespi telemetry
and operate on the same data. Keep only the backend being tested active when
duplicate processing would affect the test.

## 24. Useful commands

```bash
pm2 status
pm2 logs geosentri --lines 50 --nostream
pm2 restart geosentri
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1/api/health
sudo nginx -t
systemctl is-active nginx
systemctl is-enabled nginx
systemctl is-enabled pm2-ubuntu
systemctl is-enabled certbot.timer
```

It is safe to close the browser SSH terminal. PM2 and Nginx continue running
independently of the SSH session.
