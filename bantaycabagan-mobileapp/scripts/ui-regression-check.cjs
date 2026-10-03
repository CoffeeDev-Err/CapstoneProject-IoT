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
const nativeMapSource = readFileSync(
  resolve(projectRoot, 'src/components/OfficerMapCanvas.native.tsx'),
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
const loginSource = readFileSync(
  resolve(projectRoot, 'src/LoginScreen.tsx'),
  'utf8',
);
const reportControllerSource = readFileSync(
  resolve(projectRoot, 'src/features/reports/useReportFormController.ts'),
  'utf8',
);
const reportLocationSource = readFileSync(
  resolve(projectRoot, 'src/features/reports/ReportLocationFields.tsx'),
  'utf8',
);
const reportEvidenceSource = readFileSync(
  resolve(projectRoot, 'src/features/reports/ReportEvidenceField.tsx'),
  'utf8',
);
const reportDateTimeSource = readFileSync(
  resolve(projectRoot, 'src/features/reports/ReportDateTimeField.tsx'),
  'utf8',
);
const reportCardSource = readFileSync(
  resolve(projectRoot, 'src/features/reports/ReportCard.tsx'),
  'utf8',
);
const taskCardSource = readFileSync(
  resolve(projectRoot, 'src/features/tasks/TaskCard.tsx'),
  'utf8',
);
const upcomingShiftCardSource = readFileSync(
  resolve(projectRoot, 'src/features/tasks/UpcomingShiftCard.tsx'),
  'utf8',
);
const slidingTabsSource = readFileSync(
  resolve(projectRoot, 'src/components/SlidingUnderlineTabs.tsx'),
  'utf8',
);
const tasksSource = readFileSync(
  resolve(projectRoot, 'src/screens/TasksScreen.tsx'),
  'utf8',
);
const notificationsSource = readFileSync(
  resolve(projectRoot, 'src/screens/NotificationsScreen.tsx'),
  'utf8',
);
const reportPaginationSource = readFileSync(
  resolve(projectRoot, 'src/features/reports/useReportPagination.ts'),
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
  nativeMapSource,
  /androidView="texture"/,
  'The Android map must use a composited TextureView so tab slides do not expose a SurfaceView blink',
);
assert.match(
  nativeMapSource,
  /isCurrent\s*&&\s*styles\.markerCurrentRingVisible,[\s\S]*?isCurrent\s*&&\s*\{\s*borderColor\s*\}/,
  'The current officer marker secondary ring must inherit its duty, operation, boundary, or backup tone',
);
assert.match(
  officerMapSource,
  /styles\.assignmentCard,\s*\{ backgroundColor: colors\.surface, borderColor: colors\.border \}/s,
);
assert.match(swipeSheetSource, /\{ backgroundColor: colors\.surface \}/);
assert.match(
  reportsSource,
  /accessibilityLabel="Create new report"[\s\S]*<Icon name="add"[\s\S]*>New Report<\/Text>/,
  'The Reports header must label its primary action as New Report instead of showing an unlabeled plus icon',
);
assert.match(
  reportCardSource,
  /chevronProgress\.value \* 180[\s\S]*<SmoothCollapsible expanded=\{expanded\}>/,
  'Report cards must animate measured height and chevron rotation instead of abruptly mounting details',
);
assert.match(
  reportCardSource,
  /card: \{[\s\S]*?borderWidth: 0[\s\S]*?shadowOpacity: 0\.11[\s\S]*?elevation: 4 \},\s*cardDark:/,
  'Report cards must float on tonal surfaces without a neutral outer outline',
);
assert.match(
  taskCardSource,
  /card: \{[\s\S]*?borderWidth: 0[\s\S]*?shadowOpacity: 0\.11[\s\S]*?elevation: 4 \},\s*cardBackup:/,
  'Task cards must float on tonal surfaces without a neutral outer outline',
);
assert.match(
  upcomingShiftCardSource,
  /card: \{[\s\S]*borderWidth: 0,[\s\S]*borderLeftWidth: 3,[\s\S]*elevation: 4/,
  'Upcoming shifts must retain their category accent while removing the neutral card outline',
);
assert.match(
  reportsSource,
  /datePresetChip: \{[\s\S]*?borderColor: 'transparent'[\s\S]*?elevation: 2,[\s\S]*?datePresetChipActive: \{ borderColor: mobileTheme\.blue/,
  'Inactive date filters must float without a neutral outline while the selected filter keeps its blue state',
);
assert.match(
  tasksSource,
  /filterButton: \{[\s\S]*?borderColor: 'transparent'[\s\S]*?backgroundColor: mobileTheme\.surfaceMuted[\s\S]*?filterButtonActive: \{ borderColor: mobileTheme\.blue/,
  'Inactive task filters must float without neutral outlines while the selected filter keeps its blue state',
);
assert.match(
  slidingTabsSource,
  /INDICATOR_DURATION_MS = 190[\s\S]*SlidingTabLabel[\s\S]*interpolateColor\(distance[\s\S]*translateX: indicatorX\.value[\s\S]*selectTab[\s\S]*withTiming\(index \* tabWidth/,
  'All, Incident, and Routine must keep the active label synchronized with the sliding underline',
);
assert.match(
  reportsSource,
  /reportDataSignature[\s\S]*useLayoutEffect\(\(\) => \{[\s\S]*reportListOffset\.value = reportListDirectionRef\.current \* 12[\s\S]*reportListAnimatedStyle[\s\S]*keyExtractor=\{\(item\) => item\.id\}[\s\S]*removeClippedSubviews=\{false\}/,
  'Report filter changes must slide the retained list as one lightweight layer',
);
assert.doesNotMatch(
  reportCardSource,
  /contentReveal|transitionProgress|transitionIndex|opacity: 0\.24/,
  'Report cards must not fade or stagger independently because that creates a shattered transition',
);
assert.doesNotMatch(
  reportsSource,
  /key=\{`reports-\$\{filter\}`\}/,
  'Report filter changes must not remount the full list because that causes a visible blink',
);
assert.match(
  reportsSource,
  /runReportListTransition[\s\S]*selectFilter[\s\S]*runReportListTransition\([\s\S]*selectDatePreset[\s\S]*runReportListTransition\(/,
  'Category and date filters must share the same lightweight slide transition',
);
assert.match(
  reportPaginationSource,
  /REPORT_VIEW_CACHE_TTL_MS = 60_000[\s\S]*reportViewCache[\s\S]*exactCacheIsFresh[\s\S]*!options\.force/,
  'Report views must reuse fresh category and date caches before background revalidation',
);
assert.match(
  reportCardSource,
  /viewButton: \{[\s\S]*?borderColor: '#b7d2ff'[\s\S]*?backgroundColor: '#e8f1ff'[\s\S]*?viewText: \{ color: mobileTheme\.blue/,
  'The expanded report View action must remain visible against the light theme',
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
  /You have an unfinished report[\s\S]*Continue[\s\S]*Later/,
  'App startup must offer a visible Continue action for an unfinished report draft',
);
assert.match(
  mainTabsSource,
  /navigation\.navigate\('Reports',[\s\S]*draftRequestId: Date\.now\(\)/,
  'Continuing a draft must navigate directly to the Reports form',
);
assert.match(
  reportsSource,
  /route\.params\?\.draftRequestId[\s\S]*openSubmitForm\(\)/,
  'The Reports screen must open and restore the requested draft automatically',
);
assert.match(
  reportsSource,
  /styles\.formActions[\s\S]*confirmCancelReportForm\(close\)[\s\S]*>Cancel<[\s\S]*handleSubmit\(close\)/,
  'New and correction forms must keep a visible Cancel action beside Submit',
);
assert.match(
  reportsSource,
  /styles\.dialogFooter, styles\.detailActions[\s\S]*>Close<[\s\S]*(?:Submit correction|Edit report)/,
  'Report details must keep Close and the available report action in one footer row',
);
assert.match(
  reportsSource,
  /styles\.detailActionButton,[\s\S]*borderColor: colors\.danger, backgroundColor: colors\.surface[\s\S]*color: colors\.danger[\s\S]*>Close</,
  'Report details Close must use a danger-colored outline and label in both themes',
);
assert.match(
  reportControllerSource,
  /Discard this report\?[\s\S]*Keep Editing[\s\S]*Discard Report[\s\S]*clearReportDraft/,
  'Explicit cancellation of a new report must require confirmation and remove its saved draft',
);
assert.match(
  reportControllerSource,
  /Selected point is outside Cabagan[\s\S]*Place the pin on the actual incident location within Cabagan/,
  'The report map picker must reject incident points outside Cabagan immediately',
);
assert.match(
  reportLocationSource,
  /Officer's current GPS[\s\S]*Incident point pinned on map[\s\S]*Manually entered incident place/,
  'The report form must explain how the incident location was selected',
);
assert.match(
  reportsSource,
  /backupContextCard: \{[\s\S]*borderColor: 'transparent'[\s\S]*elevation: 4[\s\S]*typeOption: \{[\s\S]*borderColor: 'transparent'[\s\S]*input: \{[\s\S]*borderColor: 'transparent'[\s\S]*severityButton: \{[\s\S]*borderColor: 'transparent'/,
  'Submit Report cards, fields, and inactive selectors must use floating tonal surfaces without neutral outlines',
);
assert.match(
  reportLocationSource,
  /select: \{[\s\S]*borderColor: 'transparent'[\s\S]*input: \{[\s\S]*borderColor: 'transparent'[\s\S]*mapButton: \{[\s\S]*borderColor: 'transparent'[\s\S]*floatingSurfaceDark:/,
  'Submit Report location controls must retain the floating treatment in both themes',
);
assert.match(
  reportEvidenceSource,
  /preview: \{[\s\S]*borderColor: 'transparent'[\s\S]*captureButton: \{[\s\S]*borderColor: 'transparent'[\s\S]*floatingSurfaceDark:/,
  'Submit Report evidence controls must use floating tonal surfaces',
);
assert.match(
  reportDateTimeSource,
  /borderColor: 'transparent'[\s\S]*shadowOpacity: 0\.1[\s\S]*inputDark:/,
  'Submit Report date and time must use the same floating field treatment',
);
assert.match(
  loginSource,
  /formPanel: \{[\s\S]*borderColor: '#22314a'[\s\S]*borderRadius: 8[\s\S]*input: \{[\s\S]*height: 54[\s\S]*borderColor: '#2a3a56'[\s\S]*submit: \{[\s\S]*minHeight: 52[\s\S]*borderRadius: 8/,
  'The login screen must retain the original bordered panel, fields, and rectangular primary action',
);
assert.doesNotMatch(
  loginSource,
  /AnimatedTouchableOpacity|LOGIN_PRESS_IN_SPRING|LOGIN_PRESS_OUT_SPRING/,
  'The restored login screen must not reintroduce the floating spring-button treatment',
);
assert.doesNotMatch(loginSource, /PrivacyNotice|Privacy Notice/,
  'The sign-in screen must not render a privacy notice control');
assert.doesNotMatch(profileSource, /PrivacyNotice|Privacy Notice|privacy-tip/,
  'The Account screen must not render a privacy notice control');
assert.match(
  mainTabsSource,
  /const bottomOffset = Math\.max\([\s\S]*insets\.bottom \+ TAB_BAR_SYSTEM_GAP/,
  'The floating tab bar must stay above Android gesture and three-button navigation areas',
);
assert.match(
  mainTabsSource,
  /TAB_BAR_SYSTEM_GAP = 8[\s\S]*floatingBar:\s*\{[\s\S]*height:\s*52[\s\S]*borderWidth: 0[\s\S]*borderColor: 'transparent'[\s\S]*shadowOpacity: 0\.24[\s\S]*shadowRadius: 16[\s\S]*elevation: 16/,
  'Bottom navigation must stay compact, borderless, elevated, and above the Android safe area',
);
assert.match(
  mainTabsSource,
  /floatingBarDark:\s*\{[\s\S]*?borderColor: 'transparent'[\s\S]*?backgroundColor: '#0b1528'/,
  'Dark-mode bottom navigation must remain borderless on its tonal floating surface',
);
assert.match(
  mainTabsSource,
  /PAGE_TRANSITION_DURATION_MS = 170[\s\S]*animation: route\.name === 'Tasks' \? 'none' : 'shift'[\s\S]*duration: PAGE_TRANSITION_DURATION_MS[\s\S]*freezeOnBlur: false/,
  'Full screens must use a short retained-scene transition while Tasks remains a modal',
);
assert.match(
  mainTabsSource,
  /PAGE_TRANSITION_DISTANCE_PX = 10[\s\S]*forLightweightPageSlide[\s\S]*translateX:[\s\S]*-PAGE_TRANSITION_DISTANCE_PX[\s\S]*PAGE_TRANSITION_DISTANCE_PX[\s\S]*sceneStyleInterpolator: route\.name === 'Tasks'/,
  'Page changes must retain both scenes and use only ten pixels of horizontal travel',
);
assert.doesNotMatch(
  mainTabsSource,
  /sceneStyle:\s*\{\s*opacity:/,
  'Full-screen opacity transitions expose the navigator background as a visible blink',
);
assert.match(
  swipeSheetSource,
  /CLOSE_DURATION = 260[\s\S]*damping: 24[\s\S]*stiffness: 220[\s\S]*mass: 0\.8[\s\S]*overshootClamping: false[\s\S]*alwaysBounceVertical=\{alwaysBounceVertical \?\? true\}[\s\S]*bounces=\{bounces \?\? true\}[\s\S]*decelerationRate=\{decelerationRate \?\? 'fast'\}[\s\S]*overScrollMode=\{overScrollMode \?\? 'always'\}/,
  'Shared scrolling sheets must keep native elastic overscroll with lightweight deceleration',
);
assert.match(
  tasksSource,
  /<SheetFlatList<TaskListRow>/,
  'My Tasks must use the shared elastic scrolling list',
);
assert.match(
  notificationsSource,
  /<SheetFlatList/,
  'Notifications must use the shared elastic scrolling list',
);
assert.match(
  reportsSource,
  /<SheetScrollView[\s\S]*contentContainerStyle=\{styles\.form\}/,
  'Submit Report fields must use the shared elastic scrolling container',
);
assert.match(
  swipeSheetSource,
  /translateY\.value = withSpring\(initiallyExpanded \? 0 : lowerSnap\.value, SNAP_SPRING\)/,
  'Shared sheets must enter with a subtle spring instead of a rigid timing animation',
);
assert.match(
  swipeSheetSource,
  /dismissible \? \([\s\S]*accessibilityLabel="Close panel"[\s\S]*styles\.closeButton[\s\S]*name="close"[\s\S]*handleTouchArea: \{[\s\S]*height: 44[\s\S]*closeButton: \{[\s\S]*top: 12[\s\S]*right: 12[\s\S]*borderWidth: 1,[\s\S]*borderRadius: 16/,
  'Dismissible slide-up sheets must center a circular bordered close button on the upper-right curve',
);
assert.match(
  mainTabsSource,
  /Animated\.timing\(activeIndicatorX[\s\S]*translateX: activeIndicatorX/,
  'The active bottom-navigation indicator must glide between tabs',
);
assert.match(
  mainTabsSource,
  /borderBottomLeftRadius: 20[\s\S]*borderBottomRightRadius: 20[\s\S]*borderBottomWidth: 1/,
  'The page header must keep a visible rounded lower edge in light and dark themes',
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
