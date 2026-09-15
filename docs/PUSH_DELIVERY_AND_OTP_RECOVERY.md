# Push delivery and OTP recovery (review items 9 and 10)

## Push delivery behavior

Officer notifications save `pushQueuePending: true` in the same MongoDB document
as the in-app notification. A backend worker scans this outbox every five seconds
and creates one `push_deliveries` row per active device. A unique index on
`notificationId` and `expoPushToken` makes enqueue recovery idempotent. Pending
work and Expo ticket IDs survive process restarts. Existing notifications are
not backfilled or replayed when this version starts.

The worker claims each job atomically with a 60-second lease. Expired leases can
be recovered by another process; stale workers cannot overwrite a newer claim.
Each Expo request has a ten-second timeout. Sends use one message per request,
within Expo's 100-message limit. The worker processes at most 20 receipt checks
and 20 sends per cycle, with no overlapping cycles in one server process.

Temporary network failures, HTTP 429/5xx, and explicit rate-limit errors retry
with exponential backoff (30, 60, 120, 240 seconds), up to five total send attempts.
Permanent errors such as invalid credentials or an oversized message are recorded
without repeated sending. The active device and officer ownership are checked
again before every send, including retries.

Only a successful ticket with an ID moves a job to `awaiting_receipt`. The first
receipt check is scheduled after 15 minutes. Missing receipts and temporary lookup
failures recheck the same ticket with increasing delays, up to 12 checks. They do
not cause a blind resend. An explicit transient failure in a receipt can schedule
a new send, subject to the same five-attempt limit. `DeviceNotRegistered` in either
a ticket or a receipt stops this delivery and invalidates the token, unless that
registration was refreshed after the send began.

New sends expire 24 hours after notification creation, and the remaining lifetime
is also passed as Expo's `ttl`. Receipt checks stop at this deadline as well. Old
outbox entries and entries with no active device are cleared without sending;
their in-app notifications remain available. Terminal delivery records are retained
for 30 days and then removed by a MongoDB TTL index.

| Status | Meaning |
| --- | --- |
| `pending` | Queued for a send or a retry |
| `awaiting_receipt` | Expo issued a ticket; provider result still pending |
| `provider_accepted` | Receipt says FCM/APNs accepted the notification |
| `failed` | A permanent error occurred or the send budget/window ended |
| `unknown` | A final provider result could not be established |
| `cancelled` | Device is no longer active for the intended officer |

`provider_accepted` is **not proof that the phone displayed the notification or
that the officer read it**. Network timeouts and a process crash between an Expo
send and saving its ticket can still cause duplicate pushes on retry. The stable
notification ID identifies the original in-app record; push transport does not
provide exactly-once delivery. Persistent in-app notifications remain the fallback.
These semantics follow the [Expo push documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

## Deployment and inspection

This is a backend change; it does not require a new APK or frontend build. Deploy
and restart the backend through the normal release process. Its existing startup
initializes the new collection and indexes before starting the worker. No manual
data migration or additional runtime package is required. If enhanced push security
is enabled in Expo/EAS, set `EXPO_ACCESS_TOKEN` in the backend environment.

Use read-only queries in the application's MongoDB database to inspect outcomes:

```javascript
db.push_deliveries.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 } } }
])
db.notifications.countDocuments({ pushQueuePending: true })
db.push_deliveries.find(
  { status: { $in: ['failed', 'unknown'] } },
  { notificationId: 1, status: 1, attempts: 1, receiptChecks: 1, lastError: 1, completedAt: 1 }
).sort({ completedAt: -1 }).limit(20)
```

Worker logs include notification ID and error code for terminal failures, without
printing push tokens, message bodies, or the Expo access token. Investigate growing
pending counts, repeated `InvalidCredentials`/HTTP 401 errors, and unknown outcomes.
Fix credentials in the backend/Expo project when indicated; terminal jobs are not
automatically replayed after a configuration change.

## Password recovery behavior

Recovery still validates challenge purpose, expiry, consumption, attempt limit,
and OTP hash before looking up the account or comparing passwords. With a correct
OTP and the current password as the proposed new password, the API returns
`PASSWORD_REUSED` without consuming the code, increasing incorrect-code attempts,
changing credentials, or revoking sessions. Submit a different strong password
with the same OTP while it remains valid; no resend is needed.

After validation and password hashing, the code is consumed with an atomic
conditional update that rechecks expiry and availability. Only one simultaneous
submission can claim that code. A successful reset updates the password, revokes
existing sessions, and records the existing audit event. Incorrect codes still
count toward the attempt limit. The claim and subsequent account/session writes
are separate MongoDB operations: a DB failure after the claim can still require
a fresh code; this change specifically fixes consumption on `PASSWORD_REUSED`.

## Verification

`cd backend` then `npm run check` runs lint, backend tests, account validation,
deployment checks, and operational security checks. Regression tests cover receipt
success/failure, retry backoff and exhaustion, missing receipts, restart/lease
recovery, partial enqueue failure, concurrent workers, revoked/reassigned tokens,
OTP reuse followed by a successful reset, replay, concurrent resets, and invalid
codes. Automated queue tests use an isolated in-memory store and mocked Expo
responses; they do not contact the production database or send real pushes.

Before release acceptance, verify a real officer phone receives a notification,
then check its delivery row after the receipt delay. Also try password recovery
with the current password, then a different password using the same OTP. Confirm
the reset succeeds and an existing device session is rejected on its next request.
Live device/Expo verification is separate from the automated regression suite.

Review items 12 (restore testing/RPO/RTO) and 13 (dependency advisories) are outside
this change.
