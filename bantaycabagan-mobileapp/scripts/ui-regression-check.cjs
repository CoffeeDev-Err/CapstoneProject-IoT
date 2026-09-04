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
const reportsSource = readFileSync(
  resolve(projectRoot, 'src/screens/ReportsScreen.tsx'),
  'utf8',
);
const mainTabsSource = readFileSync(
  resolve(projectRoot, 'src/navigation/MainTabs.tsx'),
  'utf8',
);
const profileSource = readFileSync(
  resolve(projectRoot, 'src/screens/OfficerProfileScreen.tsx'),
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
assert.match(
  reportsSource,
  /<FlatList\s+key=\{`reports-\$\{filter\}`\}/s,
  'Changing report filters must remount the virtualized list so stale cell measurements are discarded',
);
assert.doesNotMatch(
  reportsSource,
  /LinearTransition|layout=\{[^}]*CARD_LAYOUT/,
  'Animated card layout measurements cause large stale gaps after report filter changes',
);
assert.match(
  reportsSource,
  /contentContainerStyle=\{styles\.dateFilterChips\}[\s\S]*Object\.keys\(datePresetLabels\)/,
  'Date presets must remain directly visible as compact, horizontally scrollable chips',
);
assert.doesNotMatch(
  reportsSource,
  /dateFiltersVisible|datePresetMenu/,
  'Fixed report date presets must not open an oversized dropdown or modal',
);
assert.match(
  mainTabsSource,
  /const bottomOffset = Math\.max\([\s\S]*insets\.bottom \+ TAB_BAR_SYSTEM_GAP/,
  'The floating tab bar must stay above Android gesture and three-button navigation areas',
);
assert.match(
  mainTabsSource,
  /TAB_BAR_SYSTEM_GAP = 4[\s\S]*floatingBar:[\s\S]*height:\s*52[\s\S]*tabItem:[\s\S]*height:\s*52/,
  'Bottom navigation must stay compact while retaining a touch target above the Android safe area',
);
assert.doesNotMatch(
  profileSource,
  /<Text style=\{\[styles\.email/,
  'The profile header must show only the officer name and rank below the photo',
);
assert.doesNotMatch(
  profileSource,
  /<DetailRow label="(?:Full name|Rank)"/,
  'Personal details must not duplicate the name and rank already shown in the profile header',
);
assert.match(
  profileSource,
  /Switch between light and dark appearance\./,
  'The theme preference must use clear user-facing copy',
);

console.log('Mobile upload and dark-theme UI regression checks passed.');
