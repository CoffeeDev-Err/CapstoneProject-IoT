const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const queue = read('src/services/offlineReportQueue.ts');
const webQueue = read('src/services/offlineReportQueue.web.ts');
const cipher = read('src/services/offlineQueueCipher.ts');
const reports = read('src/screens/ReportsScreen.tsx');
const context = read('src/context/OperationalContext.tsx');
const app = read('App.tsx');
const profile = read('src/screens/OfficerProfileScreen.tsx');
const mapCache = read('src/services/mapCache.ts');
const webMapCache = read('src/services/mapCache.web.ts');
const backendModel = read('../backend/src/models/index.js');
const backendController = read('../backend/src/controllers/operationalController.js');

assert.match(queue, /new Directory\(Paths\.document, EVIDENCE_DIRECTORY_NAME\)/,
  'Unsynced evidence must live outside evictable cache storage');
assert.match(queue, /status IN \('pending', 'uploading'\)/,
  'Interrupted uploads must remain eligible for retry');
assert.match(queue, /SET status = 'synced'[\s\S]*safelyDeleteFile\(report\.evidenceUri\)/,
  'Evidence may be deleted only after synchronization is durably recorded');
assert.match(queue, /PICKER_ORPHAN_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/,
  'ImagePicker orphan cleanup must retain recent active captures');
assert.match(queue, /MAX_PENDING_EVIDENCE_BYTES = 100 \* 1024 \* 1024/,
  'Pending evidence must use a non-destructive 100 MiB admission limit');
assert.match(reports, /await discardTemporaryEvidence\(evidencePhoto\?\.uri\)/,
  'The temporary ImagePicker copy must be deleted after staging/upload');
assert.match(context, /Keep every unconfirmed report and its evidence for a later retry/,
  'Retry cleanup must preserve unconfirmed reports');
assert.match(app, /configureMapCache\(\)/,
  'The app must configure the bounded native map cache at startup');
assert.match(mapCache, /MAXIMUM_AMBIENT_CACHE_BYTES = 32 \* 1024 \* 1024/,
  'MapLibre ambient cache must be bounded to 32 MiB');
assert.doesNotMatch(app, /resetDatabase/,
  'General cache maintenance must not reset MapLibre offline packs');
assert.match(profile, /clearMapCache\(\)/,
  'User cache cleanup must clear ambient map data without resetting offline packs');
assert.doesNotMatch(webMapCache, /@maplibre\/maplibre-react-native/,
  'Web UI previews must not load MapLibre native cache APIs');
assert.match(profile, /Pending offline reports and evidence will not be deleted/,
  'Cache cleanup must explicitly preserve unsynced reports');
assert.doesNotMatch(webQueue, /expo-sqlite/,
  'Web UI previews must not bundle the native SQLite queue');
assert.doesNotMatch(webQueue, /offlineQueueCipher|expo-crypto/,
  'Web UI previews must not bundle the native offline-queue cipher');
assert.match(queue, /await sealReportPayload\(JSON\.stringify\(stagedInput\)\)/,
  'Staged report payloads must be encrypted before they reach SQLite');
assert.doesNotMatch(queue, /payload_json:\s*JSON\.stringify|JSON\.parse\(row\.payload_json\)/,
  'Report payloads must never be written or read as bare plaintext JSON');
assert.match(queue, /JSON\.parse\(await openReportPayload\(row\.payload_json\)\)/,
  'Queued payloads must be decrypted through the cipher module on read');
assert.match(cipher, /AESKeySize\.AES256/,
  'The offline queue must be sealed with a 256-bit AES key');
assert.match(cipher, /SecureStore\.setItemAsync\(\s*KEY_STORE_NAME/,
  'The offline-queue key must live in the platform keystore, never in SQLite');
assert.match(cipher, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/,
  'The queue key must stay device-bound yet readable for background sync');
assert.match(cipher, /from '@noble\/ciphers\/utils\.js'/,
  'Metro enforces the package exports map, which only publishes ./utils.js');
assert.match(cipher, /if \(!isSealedPayload\(stored\)\) return stored/,
  'Reports queued by an older build must remain readable after the upgrade');
assert.match(queue, /continue;/,
  'An unreadable queued row must be skipped instead of stalling the queue');
assert.match(queue, /continue;/,
  'An unreadable queued row must be skipped instead of stalling the queue');
assert.match(backendModel, /submittedBy: 1, clientSubmissionId: 1/,
  'Offline retries require a server-side idempotency constraint');
assert.match(backendController, /getReportByClientSubmissionId/,
  'The backend must reconcile retries before storing another evidence object');

console.log('Mobile storage lifecycle checks passed.');
