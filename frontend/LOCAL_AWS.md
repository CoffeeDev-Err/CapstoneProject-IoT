# Run the local web dashboard with the AWS backend

The installed mobile APK and this dashboard can use the same AWS data even
when the laptop and phone are on different networks. Both need internet.
Changes made in this local dashboard affect live AWS records.

1. Set `DEV_API_PROXY_TARGET=http://13.229.17.177` in
   `frontend/.env.development.local` (this local file is ignored by Git).
2. Keep your web MapTiler key in `frontend/.env` as `VITE_MAPTILER_API_KEY`.
3. From the repository root, run:

   ```bash
   npm run dev --prefix frontend
   ```

4. Open **http://localhost:5600** and sign in with your existing web account.
   Keep this terminal running while using the dashboard.

Only the frontend runs locally. The AWS backend must remain running; the local
backend and mobile development server are not needed. No AWS deployment is
required for these local proxy settings.

Vite proxies `/api`, `/socket.io`, and `/uploads` to the selected backend.
Development API and socket requests stay on the browser's local origin,
including session cookies. The proxy is bound to loopback and rejects browser
requests from other origins. Only its local HTTP session-cookie copy drops
`Secure`; `HttpOnly` and `SameSite` remain intact. Production cookie settings
are unchanged. The current upstream uses HTTP; domain/TLS setup remains needed
for an encrypted connection to AWS.

To use a local backend instead, change `DEV_API_PROXY_TARGET` to
`http://localhost:4000`, start the backend, and restart Vite.

`VITE_API_URL` and `VITE_SOCKET_URL` overrides apply to production builds.
During `npm run dev`, requests always go through the local proxy. The local
proxy is not included in the production bundle or `npm run preview`.

Verify proxy behavior without modifying AWS data:

```bash
cd frontend
node scripts/dev-proxy-check.mjs
```
