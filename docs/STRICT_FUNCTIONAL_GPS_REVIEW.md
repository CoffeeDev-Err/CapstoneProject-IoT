# Strict functional and GPS review

Review date: 2026-11-16 (Asia/Manila). Base revision: `9fe79f6`, including the existing working-tree changes. The original review below is retained as a historical record. The user subsequently authorized the fixes and removal of unused demo functionality; application source has now been changed locally.

## Implementation status

All ten findings below have corresponding local changes:

1. Geofence, inactivity and GPS-unavailable events use supervisor and affected-officer rooms.
2. Flespi coordinate timestamps must match; heartbeat timestamps cannot refresh the fix.
3. Per-device ingestion queues and conditional database writes prevent live timestamp regression.
4. Idempotent raw history persists before the live update; failed writes can be retried.
5. GPS provenance/quality checks are shared by reports, report corrections, backup requests and arrivals. GPS evidence is retained.
6. Boundary uncertainty includes distance from the polygon edge; web/mobile use the server verdict.
7. A separate movement anchor detects cumulative small steps without relying on noisy speed alone.
8. Direct ingestion requires the original measurement timestamp.
9. Automatic arrival requires two accurate pairs of readings and stores their evidence.
10. Runtime demo markers and fake personnel, their controls, startup demo seeding, account exceptions and obsolete demo-only tests were removed. Real map behavior/performance tests remain.

The 10–13 second tracker cadence is not a defect and was not shortened. Existing production records were not deleted. Historical synthetic records remain distinguishable and are excluded from GPS markers/history/evidence.

See [GPS production behavior](GPS_PRODUCTION_BEHAVIOR.md) for operational requirements and rollout limits. In particular, unknown accuracy no longer proves boundary transitions or automatic arrival. Actual tracker accuracy and device compatibility still require field acceptance; this local implementation is not a deployment or hardware-accuracy sign-off.

Current validation evidence is in `tmp/fix-final-check.log` and `tmp/fix-gps-mongo.log`. The new database integration tests use separate randomly named local databases and cover concurrent writers, retry recovery, duplicate prevention, slow walking, and evidence conflicts. New regressions also cover private alert rooms, boundary uncertainty, real GPS report provenance, and arrival confirmation.

| Final local verification | Result |
| --- | --- |
| Root `npm.cmd run check` | All shared geography, backend, web, and mobile stages passed (PowerShell wrapper caveat below) |
| Backend | 322 tests passed; lint, account validation, deployment lifecycle and security passed |
| Web | 283 tests in 64 files passed; lint and all workflow/map checks passed; production build passed |
| Mobile | 185 tests in 39 suites passed; typecheck, asset security, build config, auth, map, storage and UI checks passed |
| Local MongoDB integration | 18 tests passed in isolated temporary databases |
| Final report-evidence audit refinement | Backend lint and report evidence/edit/submission tests passed (`tmp/fix-report-final.log`) |
| Diff whitespace check | Passed |

The web build still emits its existing large-chunk advisory. No deployment, APK installation, live tracker measurement, or production database cleanup was performed.

The PowerShell command wrapper reported exit 1 after redirecting native stderr, despite every check stage completing successfully. This was reproduced with a Node process that only writes to stderr and exits 0; explicitly returning `$LASTEXITCODE` reports 0 (`tmp/powershell-stderr-probe.log`). The log contains the build advisory and Jest's passing stderr output, without an npm lifecycle failure. This wrapper behavior is separate from the test results above.

## Original assessment (before fixes)

GPS accuracy is not ready for sign-off. The application has substantial validation and test coverage, but nine additional defects were reproduced with isolated fixtures. Four are high priority because they affect location confidentiality, live-position integrity, or durable GPS evidence. The web quality gate also currently fails.

Passing software tests does not measure physical position error. No real tracker, raw production telemetry, reference survey point, installed APK, or deployed integration was exercised. The 100 m admission limit in the code is a rejection threshold, not a measured accuracy guarantee. Missing accuracy is currently accepted.

## Original verification results (before fixes)

| Area | Result | Evidence |
| --- | --- | --- |
| Shared geography | Passed generated-contract check | `tmp/strict-review-check.log` |
| Backend | Lint, 311 tests, account validation, deployment lifecycle, operational security passed | `tmp/strict-review-check.log` |
| Web | Lint passed; 282 tests passed and 2 failed in one test file | `tmp/strict-review-check.log` |
| Other web checks | Account validation, authentication routes, workflow feedback, analytics check, evidence viewer, theme, typography passed; map check failed | `tmp/strict-review-frontend-extra.log` |
| Web production build | Passed; large-chunk advisory emitted | `tmp/strict-review-frontend-extra.log` |
| Mobile | Asset security, build configuration, typecheck, 193 tests across 41 suites, auth, map, storage, UI checks passed | `tmp/strict-review-mobile.log` |
| Additional review probes | Nine defects reproduced; script exits successfully only when all nine current behaviors are observed | `tmp/strict-review-probes.cjs`, `tmp/strict-review-probes.log` |

The combined `npm.cmd run check` stopped at the web test failures. The mobile check and remaining web checks were then run independently. Some repository checks inspect source patterns rather than driving the running application; these results do not replace device or browser acceptance testing.

The original review ran the following isolated reproductions against the old implementation:

```powershell
node tmp/strict-review-probes.cjs
```

They stub network and database operations and use synthetic data. They do not read credentials, contact Flespi, or alter application records. The original probes assert the old defective behavior and are not the current regression suite. Use the repository's backend tests, including `gpsIntegrity.integration.test.js`, to verify the fixes.

## Original findings, ordered by severity

### 1. P1 — Geofence events disclose exact coordinates outside authorized rooms

Location: `backend/src/services/personnel/lifecycleService.js:555`; related broadcasts at lines 150 and 370. Compare the scoped personnel publisher in `backend/src/services/personnel/queryService.js` and the authenticated rooms in `backend/src/runtime/socketGateway.js`.

The geofence evaluator correctly sends notifications to the affected officer and supervisor, but then calls `io.emit('geofence:transition', transition)`. The transition contains the officer ID and exact latitude/longitude. Global Socket.IO emission reaches every connected authenticated socket, including an off-duty officer whose personnel feed intentionally excludes other officers. A client does not need the application's UI listener to subscribe to this event. GPS-unavailable and inactivity events also use global broadcasts and disclose operational metadata.

Reproduction: the probe drives a confirmed crossing and captures the unscoped `io.emit` call and its coordinates. The scoped personnel collection does not protect this separate event.

Required change: publish these events only to the supervisor and affected officer rooms, or apply the same explicit audience rules as the authorized personnel feed. Add an audience regression test with a supervisor, the affected officer, and an unrelated off-duty officer.

### 2. P1 — Coordinates from different times can become one apparently current fix

Location: `backend/src/services/flespiService.js:141` and lines 157–158.

The adapter selects the maximum latitude/longitude timestamp, then combines both coordinate values without requiring them to belong to the same fix. The probe supplies a latitude from one hour ago and a longitude from now. The returned pair is stamped with the new time and can pass the downstream freshness check. Its location may never have been measured by the tracker.

Flespi documents independently published telemetry parameters and a unified position object: [telemetry publication](https://flespi.com/blog/how-to-access-messages-in-flespi-http-mqtt-and-more), [position parameters](https://flespi.com/kb/messages-basic-information-units). The issue is the application's handling of those fields, not evidence that a particular deployed tracker has already sent a mixed pair.

Required change: consume a coherent position sample or require a valid, matching measurement timestamp for both coordinates. Do not promote an older coordinate with `Math.max`. Cover partial updates and missing timestamps.

### 3. P1 — Concurrent ingestion can overwrite a newer position with an older one

Location: `backend/src/services/personnel/locationIngestionService.js:139`, line 161, and line 257.

The service reads the current record, validates ordering in JavaScript, then writes with only `{ personnelId }` as the database predicate. Two requests can read the same baseline, both pass validation, and finish in reverse order. The controlled probe admits the +10 s and +20 s fixes but leaves +10 s as the live record.

The Flespi runtime serializes its own sync batches, but HTTP ingestion uses the same service outside that queue. Single-process execution does not serialize asynchronous requests. Client timestamp merging may mask some regressions while the database, arrivals, and other consumers still see the older position.

Required change: enforce ordering atomically in persistence, scoped to the active device assignment, and handle a losing update without replacing the current record. Test overlapping HTTP requests and HTTP/Flespi ingestion.

### 4. P1 — A history-write failure permanently loses an admitted GPS sample

Location: `backend/src/services/personnel/locationIngestionService.js:257` and line 294; duplicate rejection at line 161.

CurrentLocation is updated before LocationHistory is inserted. If the history write fails, ingestion throws after the live timestamp has advanced. Retrying the same fix returns `stale_location` before trying to repair the missing history. The probe confirms a durable current record with zero historical samples after the retry.

This also prevents the hourly history service from receiving that raw sample. Its summary-repair behavior cannot reconstruct a raw fix that was never saved.

Required change: make raw-fix persistence idempotent and recoverable, with an appropriate unique sample key. Use transactional persistence or a durable ingestion sequence that can repair partial completion. Include failure injection between writes and verify retry recovery and broadcast behavior.

### 5. P2 — Simulated coordinates can pass “server-verified GPS” report validation

Location: `backend/src/services/operations/reportService.js:432`; similar edit validation at line 262.

Report submission checks coordinate shape, age, and proximity, but does not require `source === 'gps'` or reject `isSimulated`. The probe supplies a fresh `source: 'mock', isSimulated: true` CurrentLocation and successfully saves a report classified as `location_source: 'gps'`, including `submittedFrom`. Correction validation has the same missing provenance checks.

This requires a simulated current record to exist; the review does not establish that production contains one. The repository does include simulated-location support, so provenance cannot safely be inferred from timestamp freshness.

Required change: share a verified-fix eligibility function across report submission, report edits, backup requests, and arrival decisions. Preserve source, measurement time, assignment, and quality evidence with the report's GPS claim.

### 6. P2 — Municipal exit alerts ignore uncertainty at the boundary

Location: `backend/src/services/personnel/lifecycleService.js:405`, line 424, and line 466.

Accuracy is used only as a global cutoff. Once below 100 m by default, the coordinate is classified strictly inside/outside without considering its distance to the boundary. Two distinct samples count as confirmation even if both uncertainty regions overlap the boundary.

The probe places two reported positions approximately 0.11 m outside an actual municipal edge, each with reported accuracy of 80 m. The system marks the officer outside and sends a critical exit alert. That classification is established by the code; the person's physical side of the boundary cannot be established from these observations.

Required change: account for distance from the edge and reported uncertainty, with an explicit uncertain state and agreed enter/exit hysteresis. Align web/mobile boundary cues with the backend decision. The web currently also classifies raw current coordinates in `frontend/src/features/realtime/usePersonnelSocketSubscriptions.js:29`.

### 7. P2 — Slow continuous movement can trigger an inactivity alert

Location: `backend/src/services/personnel/locationIngestionService.js:225` and line 245; inactivity evaluation in `backend/src/services/personnel/lifecycleService.js:281`.

Movement is measured against the immediately preceding coordinate, which is overwritten after every accepted fix. With the default 20 m threshold, successive smaller steps do not accumulate. The speed shortcut only applies at 2 km/h or above.

The probe accepts approximately 5 m every 10 s at reported speed 1.8 km/h. After 350 s and 175 m traveled, `lastMovedAt` still equals the initial time. This satisfies the default five-minute inactivity condition despite continuous movement.

Required change: track a separate movement anchor or accumulated meaningful displacement, with uncertainty-aware noise handling. Test slow movement, stationary drift, and a genuine stop.

### 8. P2 — HTTP ingestion invents measurement time when it is missing

Location: `backend/src/services/personnel/locationIngestionService.js:86`; HTTP entry point in `backend/src/controllers/personnelController.js:55`.

If `recorded_at` is absent, the service uses server time. Replaying an unchanged coordinate packet without a timestamp creates a newly accepted sample and refreshes the live reading clock. The probe observes two accepted samples ten seconds apart from identical timestamp-free input.

An ingestion key is required, so this is a trusted-integration integrity defect, not an unauthenticated API bypass. It can occur if an adapter buffers or retries coordinates without preserving their original measurement time.

Required change: require an actual measurement timestamp for GPS ingestion and keep server reception time separate. If legacy reception-timed input must be supported, explicitly label its uncertain age and exclude it from claims requiring verified freshness.

### 9. P2 — “Verified arrival” can be based on uncertainty larger than its radius

Location: `backend/src/services/operations/taskService.js:270` through line 299.

Automatic arrival requires fresh requester/responder coordinates and a point-to-point distance within 50 m by default. It does not examine either accuracy value or require independent confirmation. The probe supplies one pair of coincident coordinates, each reporting 100 m accuracy, and the responder is marked arrived.

The observations establish proximity of the reported points, not reliable physical presence within 50 m. An arrival record subsequently gates backup completion, so this distinction affects the operational workflow.

Required change: define acceptable uncertainty for both positions, account for it in the proximity decision, and require suitable confirmation or an explicitly audited manual arrival. Preserve the fix timestamps and quality behind an arrival decision.

### 10. P2 — The current web quality gate fails after disabling demo markers

Locations: `frontend/src/utils/mockMapPersonnel.js:1`, `frontend/src/utils/mockMapPersonnel.test.js:25`, and `frontend/scripts/map-behavior-check.mjs`.

The working tree sets `MOCK_MAP_PERSONNEL_COUNT = 0`. Two tests still require nonempty clustered/moving fixtures. One fails its cluster assertion; the other dereferences an undefined first marker. The standalone map script also requires the literal `MOCK_MAP_PERSONNEL_COUNT = 96`. Consequently `npm.cmd run check` stops before its later checks.

Required change: make the synthetic test dataset independent from the runtime preview toggle/count and update the source-pattern assertion accordingly. Keep the chosen runtime demo behavior. This is a test/configuration mismatch; it is not evidence that live GPS markers fail to render.

## Functionality coverage and remaining limits

Existing checks exercise authentication and session revocation, officer/supervisor authorization, account/device assignment, shift/deployment lifecycle, tasks and backup response, report validation and corrections, protected evidence access, notifications, offline report handling, map behavior, shared geography, and analytics presentation. These provide useful regression coverage, but are largely unit, mocked HTTP, or source-contract checks.

The map animation code deliberately lands on newly timestamped coordinates and does not extrapolate a future measured position. Shared geography generation passed. Keeping a last-known location visible is intentional and is separate from claiming it is fresh.

GPS ingestion comes from assigned external trackers through Flespi or the protected HTTP endpoint. There is no basis here to attribute GPS error to phone location permissions or claim that the phone itself is measuring these positions.

Additional deployment-dependent questions remain: the actual tracker's positioning source and firmware, whether reported accuracy is available and meaningful for that model, upload cadence, timestamp quality, Flespi message/plugin configuration, live broker fallback behavior, push delivery, map/routing provider availability, and database/storage performance. The current adapter does not preserve `position.source`; Flespi documents non-GNSS sources such as Wi-Fi/LBS, so confirm the actual message format before treating every mapped point as satellite GPS. See [Flespi position parameters](https://flespi.com/kb/messages-basic-information-units).

## Required physical GPS acceptance work — not executed

Use the reviewed backend and a newly identified APK build, dedicated test accounts/devices, and a test database. Record tracker model, firmware, SIM/network, upload settings, geography version, software revision, and test conditions.

1. **Stationary accuracy:** collect raw timestamped positions at independently established reference points in open sky and near obstructions. A map click or an unvalidated phone coordinate is not a surveyed reference. Report median, 95th percentile, and maximum horizontal error, sample count, missing-fix rate, and reported quality.
2. **Walking and vehicle motion:** follow known routes, including slow walking, turns, stops, and restart after signal loss. Capture measurement time, reception time, persistence time, and map display time. Quantify location error and delivery delay separately. A precise old fix can still be operationally late.
3. **Boundary behavior:** repeat stationary and moving tests on both sides of municipal/assigned boundaries, including distances smaller than the uncertainty radius. Count false exits, missed exits, and detection delay. Confirm that supervisor and officer displays agree with the recorded decision.
4. **Backup arrival:** test clearly inside/outside the response radius, uncertain readings, a moving requester, stale fixes, and overlapping timestamps. Compare saved arrival evidence against reference observations.
5. **Outage and recovery:** interrupt GPS reception, tracker data, MQTT, and backend/database availability separately. Confirm that age keeps increasing, rejected fixes do not become current, history survives retries, and recovery does not reorder samples or issue inappropriate alerts.
6. **Operational workflows:** on real devices, exercise login/logout, shift transitions, report/evidence capture, offline queue/retry, notification delivery, backup acceptance/completion, and access restrictions. Record expected and observed outcomes and evidence for each.

Choose acceptance limits before collecting results, based on the operational decisions being made. Do not substitute satellite count, decimal coordinate precision, smooth marker motion, a 100 m software cutoff, or a passing test suite for measured field accuracy.

Recommended implementation order: close the global location disclosure; enforce coherent, atomically ordered, recoverable GPS ingestion; strengthen report/arrival provenance and boundary uncertainty; correct movement accumulation and the web test gate; then execute and document field acceptance tests.
