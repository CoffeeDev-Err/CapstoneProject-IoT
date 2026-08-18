# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BantayCabagan (branded **GeoSentri** in the UI and emails) is a police personnel GPS tracking and operational-management system for the Cabagan municipal police (PNP), Isabela, Philippines. It has three deployable parts that all talk to one backend over HTTP + Socket.IO:

- **`backend/`** — Express 5 API, MongoDB (Mongoose), Socket.IO realtime, Flespi GPS ingestion, S3 media, email/OTP.
- **`frontend/`** — React 19 + Vite web dashboard for **supervisors**.
- **`bantaycabagan-mobileapp/`** — Expo / React Native app for **officers**.

The two client apps are role-separated: a `supervisor` account only works on web, an `officer` account only on mobile (enforced server-side via the `application` login field). Both names "BantayCabagan" and "GeoSentri" refer to the same system.

## Repo layout & workspaces

- Root `package.json` declares npm **workspaces = [`backend`, `frontend`]**. The mobile app is **not** a workspace — install and run its scripts from inside `bantaycabagan-mobileapp/`.
- Node engine: **>=22.13 <25**.
- Reference docs live in `docs/` — read these before touching the relevant area: `api-contracts.md`, `database-schema-plan.md`, `INPUT_VALIDATION_AND_SECURITY.md`, `S3_MEDIA_STORAGE.md`, `HOSTINGER_DEPLOYMENT.md`, `mock-officer-testing.md`, `email-verification.md`.

## Commands

Run from the repo root unless noted.

```bash
npm run dev              # backend + frontend concurrently (backend :4000, frontend :5600)
npm run dev:backend      # backend only (nodemon)
npm run dev:frontend     # frontend only (vite, strict port 5600)
npm run build            # build frontend -> frontend/dist
npm start                # production backend (serves frontend/dist + /api + sockets)

npm run check            # FULL verification: backend + frontend + mobile (run before finishing work)
npm run check:backend    # lint + backend check scripts
npm run check:frontend   # lint + frontend check scripts + build
npm run check:mobile     # typecheck + mobile check scripts
npm run debug            # watch-mode: re-runs the check suites on file changes
```

Mobile app (run inside `bantaycabagan-mobileapp/`):

```bash
npm start                # expo start   (also: npm run android | ios | web)
npm run check            # security + typecheck + auth/map/storage/ui checks
```

### Tests — important

There is **no Jest/Vitest/Mocha**. "Tests" are hand-written Node scripts in each package's `scripts/` directory (`.js` for backend/frontend, `.cjs`/`.mjs` for mobile/frontend). Each is wired to an npm script.

- Run one suite via its npm script, e.g. `npm run test:security --prefix backend`, `npm run test:evidence --prefix frontend`, `npm run test:map --prefix bantaycabagan-mobileapp`.
- Or run the file directly, e.g. `node backend/scripts/operational-security-check.js`.
- `npm run check` in each package chains lint/typecheck + all its scripts. These scripts ARE the CI gate — run the relevant `check` after changes.
- `test:s3` (backend) is a **live** AWS check and only works with real S3 credentials configured.

## Backend architecture

**Style:** CommonJS (`require`/`module.exports`), ESLint 10 flat config, tabs, `no-unused-vars` ignores `^_`-prefixed names.

**Dependency-injection / factory pattern is the core convention.** `backend/src/server.js` is the composition root — it is the one place that instantiates everything and wires it together:

1. Some services are plain module exports (`authService`, `personnelService`); others are factories that need `io` or peer services (`createOperationalService({ io })`, `createAccountService({ io, personnelService })`).
2. Controllers are factories over a service: `createXController(service)`.
3. Routes are factories over `{ authService, controller }`: `createXRoutes({ authService, controller })`, mounted under `/api/...`.

Layering is strict: **routes → controllers → services → models**. Clients depend on the HTTP contracts in `docs/api-contracts.md`, so external providers (MongoDB, Flespi, S3, Nominatim) are swappable inside the **service layer** without changing clients. Note `reports`, `tasks`, and `deployments` all live in `operationalRoutes.js` / `operationalService.js` (not one file each).

**Models:** every Mongoose schema is in the single file `backend/src/models/index.js`. A `model()` helper guards against recompilation. Domain uses GeoJSON `Point`/`Polygon` with `2dsphere` indexes; several collections use **TTL indexes** (`location_history` expires 24h, `auth_sessions` & `email_verifications` at `expiresAt`) and **partial unique indexes** (e.g. one active GPS assignment per officer/IMEI, dedupe keys).

**Auth:** opaque session tokens (`randomBytes` base64url, stored only as sha256 hash in `auth_sessions`), sent as `Authorization: Bearer <token>`. Login requires an emailed 6-digit OTP (also used for reset / change-password). `middleware/authorization.js` exposes `supervisorOnly`, `officerOnly`, `requireRole(...)`. The **same `authService.authenticate`** guards Socket.IO handshakes.

**Realtime & background loops** (all in `server.js`): Socket.IO clients join rooms `personnel:<id>` and `role:<role>`; data is scoped per-actor on both REST and socket events (officers see a reduced dataset — never widen this without checking `INPUT_VALIDATION_AND_SECURITY.md`). Timers drive: mock-GPS broadcast (2.5s), Flespi sync (MQTT realtime + REST fallback), and an operational lifecycle check (~15s: deployment shift reconciliation, inactivity + geofence evaluation). History is sampled every 30s.

**GPS ingestion:** `POST /api/locations/ingest` requires header `x-api-key: <GPS_INGEST_API_KEY>`, accepts `personnel_id` or an active `imei`, and rejects stale positions. Flespi is the source of truth for the device catalog; MongoDB stores only assignment history.

**Media:** new profile photos and report evidence go to a **private** S3 bucket (falls back to local `backend/uploads` when AWS vars are absent). Access is via a backend-signed link (15 min) → media route → short-lived S3 presigned URL (1 min). Uploads are validated by magic-byte signature, capped at 5 MB. See `docs/S3_MEDIA_STORAGE.md`.

**Production hardening:** `backend/scripts/start-production.js` → `config/environment.js` validates env (HTTPS origins, trusted-proxy depth, distinct 32+ char `OTP_SECRET`/`GPS_INGEST_API_KEY`, Gmail OTP delivery) and **fails closed before connecting to the DB**. In production the backend also serves `frontend/dist` with SPA fallback.

## Frontend architecture (web / supervisor)

React 19 + Vite 7, ESM, dev server on **strict port 5600** (must match backend `ALLOWED_ORIGINS`). Maps use **MapLibre GL + supercluster**; charts use Chart.js; UI uses Bootstrap + lucide-react.

- Routing is centralized in `src/routes/AppRoutes.jsx`: `ProtectedRoute` → `AppLayout` (the shell with sidebar/topbar and an `<Outlet/>`), pages are `lazy()`-loaded.
- State via React Context: `AuthContext`, `PersonnelContext` (context objects and `useX` hooks are split into separate files, e.g. `useAuth.js`).
- API access goes through `src/services/`: `apiClient.js` (`apiRequest` + typed `ApiError`), `runtime.js` (resolves `API_URL`/`SOCKET_URL` from `VITE_*` env, defaulting to `localhost:4000` in dev), `socket.js`.

## Mobile architecture (officers)

Expo SDK 57, React Native 0.86, **TypeScript**. Navigation is **React Navigation** (native-stack + bottom-tabs), not expo-router. Maps use `@maplibre/maplibre-react-native`.

- **Platform-specific file splits** are used deliberately — `*.native.tsx` vs `*.tsx`/`*.web.ts` (e.g. `OfficerMapCanvas`, `mapCache`, `authTokenStorage`, `offlineReportQueue`). `react-native-web` powers a web preview; keep both variants in sync when editing.
- Provider tree (`App.tsx`): `GestureHandlerRootView → SafeAreaProvider → ThemeProvider → AuthProvider → (NotificationProvider → OperationalProvider)`; navigation is token-gated.
- Tokens live in `expo-secure-store`; reports queue offline in `expo-sqlite`; push via `expo-notifications`. API URL from `EXPO_PUBLIC_API_URL`, defaulting to `10.0.2.2:4000` on Android emulator / `localhost:4000` elsewhere.
- Verification uses `scripts/typecheck.cjs` + the `.cjs` check scripts (no test runner).

## Cross-cutting conventions & gotchas

- **Validation is dual-layer.** Client-side validation is UX only; the **server is the security boundary** and re-validates everything. When adding a field, add server validation too. See `docs/INPUT_VALIDATION_AND_SECURITY.md`.
- **Shared domain constants are duplicated per platform** — `cabaganBarangays` and `cabaganGeofence` exist separately in `backend/src/constants`, `frontend/src/constants`, and `bantaycabagan-mobileapp/src/constants`. Changing one usually means changing all three.
- This handles **police PII and live location data** — treat auth scoping, media signing, and the officer-vs-supervisor data boundary as security-critical.
- `.env` files are git-ignored; `backend/.env.example` documents every backend variable (Flespi, Gmail OTP, AWS S3, seed accounts, mock officer). A no-hardware **mock officer** account can be enabled with `ENABLE_MOCK_OFFICER=true` for backup-request testing (`docs/mock-officer-testing.md`).
- `bash.exe.stackdump` at the repo root is a stray crash artifact, not part of the project.
