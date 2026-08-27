import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getAccountEditCancelledMessage,
  getDeploymentEditCancelledMessage,
} from '../src/utils/workflowFeedback.js'
import {
  filterDeploymentGroupsByPrefix,
  matchesPrefixSearch,
} from '../src/utils/searchMatching.js'

const projectRoot = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

const accountMessage = getAccountEditCancelledMessage('Leo B. Gannad')
assert.match(accountMessage, /Editing Leo B\. Gannad was cancelled\./)
assert.match(accountMessage, /No account changes were saved/)
assert.match(accountMessage, /ready to create a new account/)

const deploymentMessage = getDeploymentEditCancelledMessage('the group in Barangay Ugad')
assert.match(deploymentMessage, /Re-assignment for the group in Barangay Ugad was cancelled\./)
assert.match(deploymentMessage, /No deployment changes were saved/)
assert.match(deploymentMessage, /ready to create a new deployment/)

assert.match(getAccountEditCancelledMessage(''), /selected account/)
assert.match(getDeploymentEditCancelledMessage(), /selected deployment/)

assert.equal(matchesPrefixSearch('L', ['Leo B. Gannad', 'Police Corporal']), true)
assert.equal(matchesPrefixSearch('San P', ['Barangay San Pablo']), true)
assert.equal(matchesPrefixSearch('eo', ['Leo B. Gannad']), false)
assert.equal(matchesPrefixSearch('RPT 2026', ['RPT-2026-0001']), true)

const filteredDeploymentGroups = filterDeploymentGroupsByPrefix([
  {
    groupId: 'GROUP-1',
    patrolArea: 'Barangay Anao',
    assignments: [
      { id: 'ASG-ANAO', personnelName: 'Mon Maguas', patrolArea: 'Barangay Anao' },
      { id: 'ASG-AGGUB', personnelName: 'Leo B Gannad', patrolArea: 'Barangay Aggub' },
    ],
  },
], 'Anao')
assert.deepEqual(
  filteredDeploymentGroups.flatMap((group) => group.assignments.map((assignment) => assignment.id)),
  ['ASG-ANAO'],
  'An area search must not include assignments from another barangay in the same group',
)

const assignmentSource = read('src/pages/AssignAreaPage.jsx')
const settingsSource = read('src/pages/SettingsPage.jsx')
const personnelSource = read('src/pages/PersonnelPage.jsx')
const reportsSource = read('src/pages/ReportsPage.jsx')
const reportsStyles = read('src/styles/reports.css')
const mockPersonnelSource = read('src/utils/mockPersonnel.js')
const routeSource = read('src/routes/AppRoutes.jsx')
const navigationSource = read('src/components/NavSidebar.jsx')
const feedbackSource = read('src/context/FeedbackContext.jsx')
const feedbackStyles = read('src/styles/feedback.css')

assert.match(assignmentSource, /min=\{minimumSelectableShiftStart\}/,
  'Past shift dates must be unavailable for both deployment modes')
assert.match(assignmentSource, /max=\{deploymentFormState\.maximumShiftEnd\}/,
  'The shift-end picker must enforce the 24-hour maximum')
assert.match(assignmentSource, /onClick=\{openDateTimePicker\}/,
  'Clicking anywhere in each date-time field must open its picker')
assert.match(assignmentSource, /personnelIds:\s*requestedAssignment[\s\S]*\[requestedAssignment\.personnelId\]/,
  'The deployment form initializer must preselect the current assignment personnel')
assert.match(assignmentSource, /requestedGroupAssignments\.map\(\((?:assignment|item)\) => (?:assignment|item)\.personnelId\)/,
  'Opening group Re-assign must preselect every personnel member in the current group')
assert.match(routeSource, /AssignAreaPage key="deployment-form"/,
  'The form route must remount separately from the deployment list so Re-assign state is initialized')
assert.match(assignmentSource, /disabled=\{isSaving\}[\s\S]*onClick=\{handleDeploymentActionClick\}/,
  'Deployment submission must remain actionable and explain incomplete requirements in a modal')
assert.match(assignmentSource, /<ActionNoticeModal[\s\S]*items=\{deploymentBlockingReasons\}/,
  'Incomplete deployment requirements must be listed in an accessible modal')
assert.match(settingsSource, /Editing \$\{accountLabel\}[\s\S]*setFormMessageKind\('info'\)/,
  'Opening account editing must use neutral information feedback rather than success feedback')
assert.match(settingsSource, /disabled=\{accountRequestPending\}[\s\S]*<ActionNoticeModal/,
  'Account submission must remain actionable and explain invalid fields in a modal')
assert.match(mockPersonnelSource, /import\.meta\.env\.DEV[\s\S]*Array\.from\(\{ length: 100 \}/,
  'The development search dataset must contain exactly 100 mock personnel records')
assert.match(assignmentSource, /appendDevelopmentMockPersonnel\(personnel\)/,
  'Personnel Selection must include the development search dataset')
assert.match(personnelSource, /appendDevelopmentMockPersonnel\(personnel\)/,
  'The Personnel roster must include the development search dataset')
assert.match(personnelSource, /className="report-list personnel-table-wrap record-scroll-container"/,
  'The Personnel roster must use the shared fixed-height scrolling container')
assert.doesNotMatch(personnelSource, /report-pagination|PERSONNEL_PER_PAGE|paginatedRoster/,
  'The Personnel roster must show filtered rows by scrolling instead of numbered pagination')
assert.match(reportsSource, /className="report-list record-scroll-container"/,
  'Reports must use the shared fixed-height scrolling container')
assert.doesNotMatch(reportsSource, /report-pagination|report-page-btn|visiblePageNumbers/,
  'Reports must use scrolling instead of numbered pagination')
assert.match(reportsStyles, /\.record-scroll-container\s*\{[\s\S]*height:\s*clamp\([\s\S]*overflow:\s*auto/,
  'Scrollable record containers must retain a responsive fixed height')
assert.match(reportsStyles, /\.report-list\.record-scroll-container > \.report-list__header[\s\S]*position:\s*sticky/,
  'The Reports header must remain visible while its records scroll')
assert.match(personnelSource, /report-list-panel__header[\s\S]*report-list-controls personnel-list-controls/,
  'The Personnel roster must follow the Reports page panel and filter layout')
assert.doesNotMatch(assignmentSource, /<label className="assignment-field assignment-field--(?:area|start|end)"/,
  'Deployment field descriptions must not activate patrol-area or date-time controls')
assert.doesNotMatch(assignmentSource, /assignment-submit-guidance/,
  'Unavailable deployment guidance must appear in the modal instead of persistent text below the action')
assert.match(assignmentSource, /filterDeploymentGroupsByPrefix\(groupedAssignments, deferredDeploymentSearch\)/,
  'Assigned deployment search must filter individual assignments instead of returning an entire matching group')
assert.match(routeSource, /path="\/deployments"/,
  'Assigned deployments must have a separate route')
assert.match(navigationSource, /to: '\/deployments'[\s\S]*label: 'Assigned Deployments'/,
  'The separate deployment list must be reachable from navigation')
assert.match(feedbackSource, /global-feedback[\s\S]*role=\{feedback\.type === 'error' \? 'alert' : 'status'\}/,
  'Non-field action feedback must render in the shared top banner')
assert.match(feedbackStyles, /top:\s*calc\(var\(--top-bar-h, 68px\) \+ 10px\)/,
  'The shared feedback banner must render below the application top bar')

console.log('Web workflow feedback checks passed.')
