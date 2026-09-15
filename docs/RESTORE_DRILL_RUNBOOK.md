# Backup restore drill and recovery objectives

Status on 2026-09-15: **production restore not yet verified**. The read-only
Atlas connection from this workstation failed with `MongoServerSelectionError`
and TLS handshake errors. No source database, bucket, backup schedule or cloud
resource was changed. No achieved production RPO/RTO is claimed.

## Objectives to adopt before production use

Proposed operational targets: RPO **24 hours**, RTO **4 hours**. These are planning
targets for administrator/adviser review, not measured guarantees. A daily backup
schedule must complete successfully and be monitored to support the RPO target;
an unmonitored daily job does not guarantee it. If losing a day's operational
records is unacceptable, select a shorter RPO and a corresponding supported Atlas
backup/PITR tier and evidence protection plan.

Retain at least seven daily recovery sets and four weekly sets in protected storage
separate from the application instance, subject to the project's actual records
retention policy. Keep encryption/recovery keys separately. Never commit dumps,
photos, connection strings, signing keys or secret configuration to GitHub.

RPO is the acceptable data loss window. Record backup age at the simulated failure
as a conservative observed recovery-point age. RTO is elapsed time from declared
failure to a usable restored service; include provisioning, retrieval, database
and media restore, configuration and application checks. Data verification time
alone is not full application RTO.

## What the folder and database are for

A folder holds backup BSON files and evidence photos. The **test MongoDB database**
is separate and receives restored records. The backup folder cannot act as a
database. Use a local-only MongoDB instance on port 27018 and a database named
`geosentri_restore_<timestamp>`; never restore over the live database. Do not start
the normal backend against the restored database: sessions, pending push jobs,
OTP requests and other production state may be present.

Install the official [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools)
and a local MongoDB server with the same major/feature-compatibility version as
the source. See [mongorestore compatibility and namespace options](https://www.mongodb.com/docs/database-tools/mongorestore/).
The verifier does not install these programs or perform a restore itself.

## Procedure

1. On a machine that can reach Atlas, obtain a consistent database backup and a
   matching evidence recovery set. For a logical dump, stop application writes
   during capture or use a supported consistent managed recovery point. A normal
   live `mongodump` without write coordination is not a point-in-time snapshot.
   Record source MongoDB version, Git revision, start/completion timestamps and
   capture method. Use `mongodump --config <protected-yaml> --out <dump-folder>`
   with the source URI in protected configuration, rather than command history.
   Keep the uncompressed BSON directory for the intended database.
2. Copy all evidence covered by the drill into a protected evidence backup folder.
   For S3, inventory object keys/version IDs and retrieve the matching versions;
   include report corrections and profile photos as applicable. Preserve their
   relative keys/paths. Versioning state and recovery-point consistency need
   separate verification; S3 is not included in a MongoDB dump or Lightsail image.
3. From the repository root, create `recovery-private` for local drill artifacts.
   It is Git-ignored; still protect its permissions and encrypt retained backups.
   Example layout: `recovery-private/dump/geosentri`,
   `recovery-private/evidence-backup`, `recovery-private/restored-evidence`.
   Do not use this example database name unless it matches the actual dump.
4. Record the backup start time and generate the fingerprint manifest:

   ```powershell
   node backend/scripts/recovery-verify.js manifest --dump recovery-private/dump/geosentri --evidence recovery-private/evidence-backup --backup-started-at '<actual-ISO-UTC-start-time>' --output recovery-private/manifest.json
   ```

   The tool validates BSON framing and captures every collection's count, document
   digest, indexes, dump checksum and evidence-file checksums. It rejects an empty
   evidence sample and unsupported collection options. For large databases use
   a managed restore-validation approach: this helper reads dump files into memory.
5. Start an isolated local MongoDB server with `--bind_ip 127.0.0.1 --port 27018`
   and a **new empty data directory**. Disable TTL expiration for the byte-fidelity
   test with `--setParameter ttlMonitorEnabled=false`; otherwise old sessions/OTP
   rows may expire before comparison. Keep this instance local and stop it after
   the drill. Do not run the application's background workers against it.
6. Verify the destination database does not exist, choose a fresh timestamped
   name, and record `$restoreStartedAt = (Get-Date).ToUniversalTime().ToString('o')`
   before beginning restore. Example (replace the source namespace as needed):

   ```powershell
   mongorestore --uri mongodb://127.0.0.1:27018 --nsInclude 'geosentri.*' --nsFrom 'geosentri.*' --nsTo 'geosentri_restore_20260915_01.*' --stopOnError recovery-private/dump
   ```

   Require a successful exit and zero failed documents. Do not use `--drop`.
   Copy `evidence-backup` contents to a **new** `restored-evidence` folder without
   overwriting an existing recovery set.
7. Verify the restored database and evidence copy:

   ```powershell
   $env:RECOVERY_TARGET_URI = 'mongodb://127.0.0.1:27018'
   node backend/scripts/recovery-verify.js verify --manifest recovery-private/manifest.json --database geosentri_restore_20260915_01 --evidence recovery-private/restored-evidence --restore-started-at $restoreStartedAt --output recovery-private/result.json
   ```

   The verifier is read-only and refuses remote URIs and database names outside
   the `geosentri_restore_` prefix. It checks exact collection sets, counts,
   type-preserving document digests, indexes and evidence bytes. It emits pass/fail,
   differences, backup age and elapsed restore/verification time. It never reads
   the application's `.env`, logs credentials, or overwrites an existing result.
8. Check reference-to-photo coverage (not just the copied sample), manually open
   restored photos, and test an isolated application using dedicated test accounts
   with outbound integrations disabled. Record the usable-service timestamp.
   Include HTTP readiness, login, reports and evidence retrieval in the full
   application drill. The helper's database ping is not an HTTP readiness test.
9. Save a sanitized result and administrator/adviser review. Preserve backups
   separately; do not delete the original recovery set during cleanup. Record
   deficiencies and repeat after fixes. Rehearse monthly and after storage/schema
   changes; verify the scheduled backup succeeded each day.

## Result record

| Field | Current status / value to record |
| --- | --- |
| Backup ID, method, MongoDB version, app revision | Pending |
| Consistent DB/evidence capture point | Pending |
| Actual database restore | Not executed |
| Counts, document digests, indexes | Not verified against a real restored DB |
| Evidence checksums and report-to-photo coverage | Pending |
| Proposed RPO / RTO | 24 hours / 4 hours, awaiting operational adoption |
| Observed backup age / full service recovery time | Not measured |
| Backup scheduling, offsite retention and key recovery | Not verified |
| Helper regression tests | Synthetic BSON/evidence and target guards; not a production restore |
| Administrator/adviser approval | Pending |

Resolve the Atlas access/TLS problem or perform capture on the existing authorized
server. Do not disable TLS verification to bypass it. Then run the actual restore
and fill in this record before marking review item 12 fully complete.
