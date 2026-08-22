Please implement the fixes for the issues diagnosed below.

C:\desktop\BantayCabagan-System\bantaycabagan-mobileapp\android\app\build\outputs\apk\release\app-release.apk

Important:

- Preserve all existing security hardening.
- Do not roll back the Aug 19 security changes.
- Do not change working realtime flows such as:
  - Start Now deployment
  - profile/profile-picture updates
  - live GPS
  - push notifications
  - normal online report submission
- Keep the changes minimal and targeted.
- Add regression tests for every fix.
- Before editing, inspect the current implementation and Git history as needed.

Issues to fix:

1. Scheduled / Upcoming Shift realtime refresh
   A future scheduled deployment does not immediately appear in Upcoming Shift.
2. Deployment deletion realtime refresh
   When a deployment is deleted/cancelled on the web, Shift / Current Deployment / related profile state on the officer mobile app stays stale for a long time before eventually correcting itself.

The diagnosis found that affected officers can miss `deployments:updated` when they are not present in the active-only deployment payload.

Implement the safe fix so affected officers are notified even when their scoped active deployment collection becomes empty or when they receive a scheduled shift.

Also make reconnect/bootstrap refresh `upcomingDeployment`, so the client self-heals correctly after reconnect.

3. Offline report auto-sync
   Online reports work normally and appear realtime on both web and mobile.

The broken path is specifically:
offline submission -> saved in offline queue -> internet restored -> report does not automatically sync.

The diagnosis found that encrypted queue payload decryption errors can be silently skipped, causing queued reports to become invisible to the retry loop.

Fix this without weakening encryption-at-rest:

- never silently discard/skip an unreadable queued report
- preserve the queued row and evidence
- surface/store the failure state
- make retry/recovery behavior safe
- ensure the encryption key is never accidentally replaced in a way that orphans existing encrypted queue rows
- preserve idempotency so retries cannot create duplicate reports/uploads

Please also review whether `finalizeReportRouteSnapshots()` sharing the deployment lifecycle interval/lock can unnecessarily delay deployment reconciliation. Only change this if the code confirms it is a real contributor.

Regression tests required:

- future scheduled shift reaches the affected officer immediately
- deleting/cancelling a deployment sends an update even when the resulting deployment collection is empty
- bootstrap/reconnect refreshes Upcoming Shift
- encrypted offline report survives restart/reconnect and syncs successfully
- decrypt/read failure is surfaced instead of silently skipped
- no duplicate report or S3 upload during retries

After implementation, run the relevant backend and mobile test suites and summarize:

1. exact root cause fixed
2. files changed
3. tests added
4. tests passed
5. manual APK tests I should perform
