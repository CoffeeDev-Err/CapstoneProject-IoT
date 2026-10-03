# GPS cadence and deployment acknowledgement

## Deployment flow

1. Supervisor starts an active deployment while the officer is signed in.
2. The existing operational socket/notification refresh loads the assignment without requiring a notification tap.
3. On the officer Map screen, the compact assignment card with the check action appears automatically. The current-deployment pill stays collapsed.
4. The officer taps the check to acknowledge the assignment. The confirmation card disappears and the map focuses the officer's fresh GPS position.
5. The officer can explicitly tap the current-deployment pill for instructions, schedule, and coverage. View on Map focuses the assigned area or exact post/start point.
6. Tapping an unacknowledged deployment notification also presents the check card. Tapping an acknowledged deployment notification opens details.

Assignment arrival does not depend on an older personnel snapshot already showing `isOnDuty: true`; the active deployment and shift dates determine the confirmation card.

Incoming assignments are evaluated using the current time rather than the time the Map screen opened. The screen also reevaluates at shift start/end and when the app resumes. Older in-flight HTTP deployment snapshots cannot replace newer socket state.

The POST/START location pin is now about 44 by 54 logical pixels, smaller than the officer marker. Walking transitions use 500 ms and vehicle transitions use 250 ms on web and mobile. Cumulative movement beyond the five-meter jitter radius still moves the marker and follow camera.

## GPS update path

Tracker fix/upload → Flespi → MQTT-triggered sync or bounded REST reconciliation → current location → personnel socket update → web/mobile marker animation.

- The tracker must actually upload fresh GPS fixes at its configured ten-second interval. GeoSentri cannot create a missing measurement or repair poor tracker connectivity.
- The backend polls every three seconds when MQTT is disconnected (default configuration).
- Connected MQTT still gets a full REST reconciliation every nine seconds at the default three-second scheduler cadence. Configuration is capped at a ten-second polling interval.
- A place-name lookup has a 500 ms budget for live ingestion. On timeout, coordinates are saved immediately with a coordinate label while the resolver continues filling its cache. A later refresh can supply the cached place name.
- Coordinates are broadcast before backup-arrival reconciliation.
- Only personnel with a current active deployment are ingested. Stored readings are not made artificially fresh while off duty or disconnected.
- Both clients retain the latest actual GPS fix if an older snapshot arrives later. A new timestamp with unchanged coordinates is accepted for stationary trackers. Membership and on-duty visibility still follow the authorized incoming snapshot.
- A conflicting scheduled deployment remains a valid reservation. Conflict feedback identifies the overlapping areas, statuses, and shift times in Philippine time; supervisors must adjust the times or explicitly edit/cancel the conflicting deployment.

## Acceptance checks on real devices

1. Create a deployment with the officer's app already open. Confirm the check card appears without tapping either push or in-app notifications.
2. Tap check. Confirm the details remain collapsed and the own-location focus still works. Explicitly expand the pill to inspect deployment details.
3. Walk outdoors with the assigned tracker powered on and cellular data working. Compare Flespi measurement/receipt times with the web and mobile GPS reading times for several uploads.
4. Confirm fresh fixes appear on both maps with interpolation. A ten-second tracker upload interval does not guarantee an exact ten-second device-to-screen interval; network and database processing add latency.
5. Disconnect the tracker. Verify reading age increases rather than resetting to zero from repeated polling.
6. Leave the Map screen open across a shift boundary. Verify future shifts do not show early, and ended shifts stop displaying.
7. Switch Map/Satellite while following an officer. Verify the officer marker remains visible and the compact POST/START pin appears only in the assigned officer's mobile map.

Read-only inspection on October 3, 2026 found both registered trackers disconnected and no active deployments at inspection time. One stored measurement matched its latest Flespi timestamp and was received by GeoSentri approximately 2.6 seconds later. This does not identify the cause of the earlier screenshot's one-minute age. Historical Flespi message access returned HTTP 403 with the configured token, so a moving-tracker end-to-end cadence test is still required.
