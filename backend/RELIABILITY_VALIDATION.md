# Reliability validation and recovery guide

Use this alongside `AWS_DEPLOYMENT.md`. This is an engineering test plan, not
an ISO certification or a claim of measured production uptime. Confirm the
ISO/IEC 25010 edition and acceptance criteria with the thesis adviser.

## Implemented safeguards

- Mobile initial submissions retain their durable report/evidence on network
  errors, 401/403, timeouts, 425/429, and server failures. Retries reuse the
  original client submission ID. Permanent input rejection still returns an
  error so the officer can correct the original form.
- Background retries preserve unconfirmed rows, stop a batch on temporary
  failure, and report permanent rejection without deleting saved evidence.
  Concurrent attempts for the same row share one upload within the mounted
  sync hook. Backend uniqueness conflicts reconcile the winning submission.
- Mobile startup preserves saved credentials on temporary verification errors
  and shows Retry; protected screens remain locked until the server verifies
  the session. This is not full offline login. Already-open sessions can queue
  reports offline; a cold start requires successful session verification.
- Mobile operational bootstrap handles resources independently, preserves
  existing successful data during retries, exposes errors, and ignores stale
  requests after navigation/session changes.
- Web requests have 15-second read / 45-second write deadlines. Mobile auth and
  notifications have 15-second deadlines; operations use 15-second reads and
  45-second writes. Deadlines cover JSON body reading too. No generic automatic
  retry of writes: a timeout does not prove the server failed to save them.
- `/api/health` measures process liveness. `/api/ready` checks MongoDB with a
  bounded ping, returns 200 or 503, and does not reveal connection credentials.
  Neither endpoint proves GPS, email, map tiles, or evidence storage is healthy.

## Release verification

1. Run from the repository root:

   ```bash
   npm run check --prefix backend
   npm run check --prefix frontend
   npm run check --prefix bantaycabagan-mobileapp
   ```

2. Record the Git revision, APK version/build ID, API environment, device model,
   Android version, navigation mode, and network used. Local code tests do not
   verify an older installed APK or older deployed backend.
3. Deploy the reviewed backend changes using the existing deployment guide.
   Then, in the AWS terminal, run these read-only checks:

   ```bash
   curl --max-time 10 -i http://127.0.0.1/api/health
   curl --max-time 10 -i http://127.0.0.1/api/ready
   pm2 status
   pm2 logs geosentri --lines 50 --nostream
   ```

   Both endpoints should return 200 with MongoDB available. If `/ready` returns
   404, confirm the backend version before diagnosing a database outage.
4. Build/install a new APK yourself. Backend deployment cannot update native
   code inside an already-installed APK. Localhost web changes do not require
   AWS frontend deployment unless you want the hosted web version updated too.

## Actual-device acceptance matrix — NOT YET EXECUTED

Use dedicated test accounts, synthetic reports and a separate test database
and evidence bucket. Never interrupt the production server, delete real
records, or send real emergency requests for a test. Propose repetition counts
with the adviser (for example 20 trials per network scenario); these are not
ISO-mandated counts.

| Area | Scenario | Required observation |
| --- | --- | --- |
| Maturity | Repeat login, tasks, report, filters, logout workflows | No crash; correct state and authorization; record each failure |
| Fault tolerance | Open an authenticated app, disable internet, submit report with photo | Queued state; durable report and photo remain |
| Fault tolerance | Simulate a 408, 429, 401, or 503 during submission | No pending-data deletion; no false success |
| Recoverability | Force-close while upload is pending; reopen, verify session, reconnect | Same submission ID retried; exactly one server record with readable evidence |
| Availability | Switch Wi-Fi to mobile data and back | Connection recovers; verify new task/deployment/personnel updates, not just a connected icon |
| Availability | Cold-start with saved login but no internet; reconnect and Retry | Saved token retained; protected screens stay locked until verification |
| Fault tolerance | Let headers arrive but stall the response body | Request exits at deadline; Retry/error UI replaces indefinite loading |
| Recoverability | In test environment, make DB unavailable after startup | `/health` remains 200; `/ready` becomes 503; returns 200 after recovery |
| Recoverability | Restore database plus evidence to isolated recovery resources | Counts, indexes, sampled records and photo contents match backup manifest |

Phone force-close, native SQLite durability, filesystem/keystore behavior,
Android background restrictions, real network handoffs and long-duration
uptime still require these tests. JavaScript timers do not guarantee uploads
continue while Android suspends or force-stops the app.

For each trial record: timestamp, scenario, expected/actual result, request or
submission ID (no tokens/passwords), duration, pass/fail, log/screenshot and
reviewer. Keep sensitive evidence out of the repository.

## Metrics for the thesis

- Workflow success rate = successful trials / attempted trials × 100.
- Availability = (observation duration − measured unavailable duration) /
  observation duration × 100. State probe interval and distinguish the client
  monitoring connection failing from confirmed service downtime.
- Recovery time = time usable service/data is verified − interruption time.
  Report individual values and the mean; do not infer them from timeout settings.
- Report integrity = missing reports, duplicate reports, missing/unreadable
  evidence after recovery. Target zero in the agreed test sample.
- Record RPO (recoverable-data age/loss window) and RTO (time to restore usable
  service). Agree targets before testing; do not invent achieved numbers.

Passing unit/static checks is supporting evidence, not a reliability percentage.

## Backup verification and isolated restore

Status: cloud backup configuration and restoration have NOT been verified or
changed by these code updates. The older defense guide left snapshots off.
Review cost, retention, access and target resources before enabling anything.

1. Inventory the Lightsail instance, Atlas cluster/tier/database, and evidence
   storage mode. Identify whether evidence is in S3 or on the instance disk.
   Also inventory configuration, app signing credentials and encryption keys;
   store secrets in an approved protected location, never this repository.
2. Inspect Lightsail **Snapshots**. Record whether automatic snapshots are
   enabled and the latest successful snapshot. After approval, enable a daily
   schedule appropriate to the agreed RPO. Snapshots incur storage charges.
   An instance snapshot covers its disk, not a separate Atlas cluster or S3
   bucket. See [AWS snapshot documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-snapshots-in-amazon-lightsail.html)
   and [automatic snapshot configuration](https://docs.aws.amazon.com/en_en/lightsail/latest/userguide/amazon-lightsail-configuring-automatic-snapshots.html).
3. Inspect Atlas **Backup** for the actual tier, retention and latest successful
   restore point. Backup features depend on cluster type. If managed backup is
   unavailable, agree an encrypted scheduled logical-backup procedure; retain
   it outside the instance and verify it can be restored. A Lightsail snapshot
   does not substitute for a database backup. See [MongoDB backup and restore](https://www.mongodb.com/docs/atlas/backup-restore-cluster/).
4. For S3 evidence, review versioning, permissions and retention. Keep the bucket
   private; do not add lifecycle rules that permanently remove required evidence.
   Versioning assists recovery of overwritten/deleted objects, but retained
   versions also require protection. See [restoring previous S3 versions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RestoringPreviousVersions.html).
5. Create a backup manifest containing backup timestamp, DB name, collection
   counts/indexes, application revision, evidence object keys/version IDs and
   checksums for a synthetic sample. Coordinate DB/evidence recovery points.
6. Restore ONLY into a separately named instance, database and evidence target.
   Do not repoint production DNS/static IPs, overwrite production collections,
   or use destructive restore flags. Keep outgoing email, push and live GPS
   integrations disabled in the recovery environment before starting its app.
7. Verify `/ready`, account access with a dedicated test account, record counts,
   indexes and sample photos. Measure recovery time and data-loss window. Keep
   the results and have the administrator/adviser sign off.
8. Only after review decide on retention/cleanup of test resources and backup
   costs. Do not delete original backups as part of the drill.
