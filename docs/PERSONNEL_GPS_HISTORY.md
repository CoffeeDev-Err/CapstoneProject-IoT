# Personnel duty GPS history

Open **Personnel → View GPS history** beside a real officer, including an off-duty officer. Select a Philippine calendar date and a duty shift. A shift spanning midnight is available on either intersecting date. Historical data belongs to the selected officer and duty; a live map location is not required.

## Views

- **Hourly checkpoints** is the default for Area patrol, Fixed post and Route patrol. Each period is anchored to the duty start (e.g. a 07:30 start produces 07:30–08:30). The last period can be shorter than an hour. An eight-hour shift has eight records. A record with a valid measurement has one numbered dot with the original measurement time, location/coordinates, reported quality, speed, battery and GPS assignment where available. Current-hour checkpoints update as new accepted fixes arrive; completed hours keep their last accepted fix.
- Dots within five meters are grouped; hover/focus/click opens details and each hour can be selected independently. The hourly list provides the same details without requiring the map. Dashed arrows indicate the sequence of adjacent hourly locations, rather than a verified road route. Missing hours remain visible as **No GPS reading** and break the connecting line.
- **Detailed GPS trace** is available for all deployment styles, for the full shift or one hour. All API pages are fetched before drawing. Original accepted samples are kept; display filtering suppresses small stationary variations and breaks gaps over 60 seconds, implausible movement, unreliable points and GPS assignment changes. Raw samples remain separately selectable in the map layers.
- Existing OSRM road estimates are optional for a selected Car Patrol hour, using the configured `REPORT_MAP_MATCHING_URL` driving matcher. No new external routing provider is enabled automatically. The road estimate is explicitly labelled as inferred. Walk and Motorcycle use their recorded GPS traces; the existing car-only matcher is not assumed suitable for either. A matching failure or size limit does not remove the recorded trace.

## Deployment compatibility

Route patrol adds a required **Walk Patrol / Car Patrol / Motorcycle Patrol** choice when creating or changing a deployment to Route patrol. `patrolMode` is persisted and displayed on the web deployment list, mobile deployment details/confirmation and upcoming-shift card. Area patrol and Fixed post do not require a mode. Existing route deployments without a mode remain readable and survive batch saves without an invented mode; the web editor asks for a selection when explicitly editing one. Mode changes affect acknowledgement/notification signatures; unchanged legacy signatures remain valid.

The report drawer retains its incident/activity location map, evidence, validation, corrections and PDF actions. Its GPS-history link and dedicated report GPS-history page were removed. Old history bookmarks redirect to Personnel. Existing report snapshots and the legacy supervisor-only report route API remain compatible; no old evidence is deleted by this feature.

## Persistence and retention

- Only accepted real GPS fixes enter duty history, after the existing validity, time-order and jump/quality checks. Mock fixes do not create duty checkpoints. Duplicate telemetry updates never become new history measurements. Sleeping/offline devices never receive invented coordinates or a refreshed GPS timestamp.
- `location_history` keeps accepted detailed fixes for **30 days from recordedAt**. New fixes include their duty ID/snapshot, reported place name, device assignment and battery as well as existing GPS quality/speed fields.
- `duty_gps_hours` stores a unique `(personnelId, deploymentId, hour)` checkpoint and the captured duty context. Conditional updates and the unique index prevent an older replay from replacing a newer checkpoint. This data survives application restarts.
- If an hourly summary write fails, the raw accepted fix remains durable and the live update continues. Opening history repairs summaries from the retained raw fixes. Pre-upgrade real fixes still present in the database can be grouped by their duty interval. Already-expired data cannot be recovered by increasing retention.
- Database startup changes only the existing `location_history.recordedAt` TTL index with `collMod`, before the existing explicit collection/index initialization. It does not drop or synchronize other indexes. The database account must support `collMod`. Both raw and hourly collections use 2,592,000-second TTL indexes. API reads additionally enforce the 30-day cutoff while waiting for MongoDB's TTL cleanup.
- This increases raw history storage from one day to thirty days. There is no change to tracker upload intervals, five-minute sleep settings, live marker freshness, geofence logic or report submission.
- API: `GET /api/personnel/:personnelId/gps-history`, restricted to authenticated supervisors. Parameters: `date=YYYY-MM-DD` (PHT), optional `deployment_id`, `view=hourly|detailed`, zero-based `hour`, `cursor`, and `road_match=true`. Detailed pages contain at most 1,000 original measurements and a `next_cursor`.

## Verification

Unit/UI coverage includes hourly/partial/overnight periods, missing and expired readings, supervisor authorization, checkpoint grouping and hover/click selection, full detailed pagination, switching history dates, report-map preservation, deployment-mode validation and legacy signature compatibility.

Optional database integration tests require a local MongoDB:

```powershell
cd backend
$env:GPS_HISTORY_TEST_URI = 'mongodb://127.0.0.1:27017'
node --test test/dutyGpsHistory.test.js test/dutyGpsHistory.integration.test.js
```

The tests use a randomly named `codex_gps_history_test_*` database and remove only that database afterward. They never connect to the application's configured database. They exercise real indexes and TTL migration, concurrent checkpoint replay, restart recovery, all deployment styles, pagination, data isolation, invalid/mock filtering, accepted-fix ingestion and route-mode persistence. A live outdoor/indoor tracker test is still needed to assess real device/signal accuracy.

Verified locally on November 5, 2026:

- All 11 real-MongoDB integration cases passed, including 15 concurrent replay rounds. New unit tests also cover a deterministic duplicate-insert retry.
- Backend full suite: 264 passed; one existing module-load failure in `operationalHttpContracts.test.js` because `src/middleware/validateUploadedImage.js` was already missing/moved in the working tree. This change does not move or replace that file. Changed backend sources pass ESLint; deployment lifecycle and operational security checks pass.
- Web: 38 targeted history/report/deployment tests passed; lint, production build, authentication routes and workflow checks pass. The full web suite has 161 passing tests and two existing mock-map failures because the working tree sets mock personnel count to zero while those tests still require generated markers.
- Mobile: 19 map/deployment regression tests passed; type-check and map behavior/performance checks pass.

These are local code and test changes. No production deployment, production database migration or APK rebuild was performed.
