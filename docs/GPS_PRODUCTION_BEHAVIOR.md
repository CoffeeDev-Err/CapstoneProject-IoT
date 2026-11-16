# GPS behavior after the strict review

Implemented locally on 2026-11-16. This document describes the software changes; deployment and tracker field acceptance are separate.

## Measurement flow

The normal tracker upload cadence (for example, a new position every 10–13 seconds) is unchanged. The map moves when a new accepted fix arrives. The backend also refreshes personnel status every 2.5 seconds so stale readings and duty changes reach clients; that refresh does not generate coordinates or history.

HTTP ingestion requires the original `recorded_at` measurement time as a date string with a timezone, normally ISO 8601. `received_at` remains separate. Missing timestamps, simulated input, invalid positions, and explicit non-GNSS positions are rejected. Readings before device assignment or before the active duty are excluded.

Flespi latitude and longitude must have the same positive `ts`. Only quality/speed fields with that timestamp belong to the fix; a new heartbeat cannot refresh old coordinates. Same-fix battery/name refreshes preserve the measurement timestamp and do not create new history points. Flespi documents `ts` as the parameter update timestamp and `position.source` as provenance for non-GNSS positions: [device telemetry](https://flespi.com/kb/device-telemetry), [message fields](https://flespi.com/kb/messages-basic-information-units).

Accepted raw history is persisted before the live location advances. A deterministic sample ID makes retries idempotent. A conditional database update prevents an older concurrent writer from overwriting a newer live fix. The existing unique `current_locations.personnelId` index must be present; normal startup creates indexes. Hourly checkpoints remain repairable from durable raw history.

## What GPS quality permits

| Use | Requirement |
| --- | --- |
| Live marker | Valid assigned on-duty GPS fix; existing quality/outlier admission checks apply. Missing accuracy may be displayed as “Not reported”. |
| GPS report location | Real, fresh GPS provenance, valid coordinates, no explicit invalid/poor quality; submitted incident point must remain within the existing 100 m proximity rule. Measurement timestamp, assignment, and reported quality are stored with the claim. Unknown accuracy remains unknown. |
| Municipal boundary cue/alert | Known accuracy no worse than 100 m (or a stricter configured threshold), and distance from the polygon edge greater than the reported accuracy plus 5 m. Transitions need distinct confirming readings no more than 30 seconds apart. |
| Automatic backup arrival | Both trackers must have known accuracy at most half the arrival radius (25 m for the default 50 m radius), with distance plus both error estimates inside the radius. Two pairs of new readings 5–30 seconds apart are required, each at most 30 seconds old and after response acceptance. Both pairs are stored with the arrival. |
| Inactivity | Movement accumulates against a separate anchor instead of restarting the distance comparison on every small step. The displacement must exceed the configured threshold and combined available error estimates. Speed noise alone does not reset inactivity. |

Boundary states are `inside`, `outside`, `pending`, `uncertain`, or `unavailable`. Web/mobile use the server verdict. An uncertain or stale reading does not announce a confirmed exit or recovery. Geofence, GPS-unavailable and inactivity socket events go only to supervisors and the affected officer.

**Device compatibility:** if a tracker does not report meaningful accuracy, its marker can still appear, but automatic boundary confirmation and automatic arrival cannot establish the required certainty. Backup completion still requires a confirmed arrival. There is no manual-arrival override in this change. Verify this requirement on the actual tracker before rollout; do not substitute an invented accuracy value. Report manual-location selection remains available.

Reported accuracy is an estimate, not proof of the physical position. These rules reduce unsupported claims; they cannot correct hardware, satellite reception, multipath, carrier delays, or an inaccurate boundary dataset. Arrival candidates are in memory and restart safely after a backend restart.

## Demo removal

Removed web/mobile marker generators, preview hooks/toggles, synthetic personnel search rows, demo-specific assignment controls and account-device exceptions, fake photo fallbacks, and unreferenced prototype mobile screens/services. Startup no longer creates demo officers, simulated positions or sample deployments. The initial supervisor and official barangay initialization remain.

No production database cleanup was executed. Existing accounts/history are retained; historical `mock`/`isSimulated` metadata and rejection/filtering remain to prevent old synthetic records being treated as real GPS evidence. Existing demo accounts should be deactivated through Account Management after identifying them. Unit/performance test fixtures remain in tests; they are not runtime demo markers.

## Verification and rollout

Run the standard checks from the repository root:

```powershell
npm.cmd run check
```

Optional database verification uses only a randomly named local test database, with guarded cleanup:

```powershell
$env:GPS_HISTORY_TEST_URI = 'mongodb://127.0.0.1:27017'
node --test backend/test/gpsIntegrity.integration.test.js backend/test/dutyGpsHistory.integration.test.js
```

Field acceptance should compare the real device against a known reference point, include slow walking and stationary periods, test both sides of the municipal boundary with a safe margin, observe a backup arrival using two assigned devices, and test offline/reconnect behavior. Confirm Flespi fields, their timestamps, and actual accuracy availability. Local automated tests do not replace these measurements or verify a deployed server/installed APK.
