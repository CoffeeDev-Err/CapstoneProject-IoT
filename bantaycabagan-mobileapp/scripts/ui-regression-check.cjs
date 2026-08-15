const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const operationsApiSource = readFileSync(
  resolve(projectRoot, 'src/services/operationsApi.ts'),
  'utf8',
);
const officerMapSource = readFileSync(
  resolve(projectRoot, 'src/screens/OfficerMapScreen.tsx'),
  'utf8',
);
const swipeSheetSource = readFileSync(
  resolve(projectRoot, 'src/components/SwipeDismissSheet.tsx'),
  'utf8',
);

assert.match(operationsApiSource, /import \{ File \} from 'expo-file-system'/);
assert.match(operationsApiSource, /new File\(input\.evidence_photo\.uri\)/);
assert.match(
  operationsApiSource,
  /formData\.append\('evidence_photo', evidenceFile, input\.evidence_photo\.name\)/,
);
assert.doesNotMatch(
  operationsApiSource,
  /formData\.append\('evidence_photo',\s*\{\s*uri:/s,
  'Expo fetch rejects React Native URI-shaped FormData file parts',
);

assert.match(
  officerMapSource,
  /styles\.deploymentPill,\s*\{ backgroundColor: colors\.surface, borderColor: colors\.border \}/s,
);
assert.match(
  officerMapSource,
  /styles\.assignmentCard,\s*\{ backgroundColor: colors\.surface, borderColor: colors\.border \}/s,
);
assert.match(swipeSheetSource, /\{ backgroundColor: colors\.surface \}/);

console.log('Mobile upload and dark-theme UI regression checks passed.');
