# Cabagan operational geography

The two `*.source.json` files are unchanged mapaPH exports supplied by the user
on 2026-11-14. Their SHA-256 hashes are recorded in `cabagan-geography.json`.
The filenames identify the download date, not a certified survey vintage.

Generate the contract from the repository root:

```sh
node scripts/build-cabagan-geography.cjs
node scripts/build-cabagan-geography.cjs --check
```

The municipality is used exactly as downloaded. The raw barangays have small
external discrepancies (maximum approximately 6.052 m). The operational copy
projects their shared exterior vertices onto the municipality and inserts every
intervening municipal vertex. Shared interior edges keep their common endpoints.
The generator refuses drift beyond 7 m or reversed ordering; this is a data
reconciliation limit, not an additional GPS/alert tolerance.

Exterior rings are normalized counterclockwise. All 26 label points are computed
with a pole-of-inaccessibility search and explicitly verified inside their own
polygon. A label point is not a surveyed post or a guaranteed road destination.
The existing navigation references are archived separately, checked inside their
coverage, and retained as directions hints. They do not define any boundary or
marker position. Suggested road routes remain subject to routing availability.

Web and backend import the shared contract. A generated, identical mobile copy
lives inside the Expo project so APK builds do not depend on files outside its
upload directory. The check command verifies both copies and the geofence hash
in the existing domain contract. No runtime boundary download is needed.

New barangay schedule blocks save their authoritative geometry, center and source
version. Editing an existing block preserves its saved geometry/source/center,
including legacy blocks without geometry. No historical database backfill runs.
Unchanged saved point/route coordinates can be retained on an existing officer's
assignment even at a corrected municipal edge. The server checks the previous
database record; new or moved points must pass the new municipality. Spatial
validation completes before writes and cannot be disabled through request fields.
Deployment review, saved schedules and police maps use the saved snapshot; the
admin live monitoring map keeps its existing personnel/municipal-only behavior.

Release web/backend and a new mobile build together so municipal validation and
display use the same version. The older APK contains the previous municipal
boundary and must be replaced for full consistency. Test report locations as well
as deployment points because municipal validation is shared by those features.
