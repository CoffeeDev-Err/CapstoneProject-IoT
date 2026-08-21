import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getAccountEditCancelledMessage,
  getDeploymentEditCancelledMessage,
} from '../src/utils/workflowFeedback.js'
import { matchesPrefixSearch } from '../src/utils/searchMatching.js'

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

const assignmentSource = read('src/pages/AssignAreaPage.jsx')
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
assert.match(assignmentSource, /disabled=\{isSaving \|\| !deploymentFormState\.canSubmit\}/,
  'Deployment submission must stay disabled until required fields are complete')
assert.match(assignmentSource, /matchesPrefixSearch\(query[\s\S]*assignment\.personnelName/,
  'Assigned deployment search must include personnel names as well as areas')
assert.match(routeSource, /path="\/deployments"/,
  'Assigned deployments must have a separate route')
assert.match(navigationSource, /to: '\/deployments'[\s\S]*label: 'Assigned Deployments'/,
  'The separate deployment list must be reachable from navigation')
assert.match(feedbackSource, /global-feedback[\s\S]*role=\{feedback\.type === 'error' \? 'alert' : 'status'\}/,
  'Non-field action feedback must render in the shared top banner')
assert.match(feedbackStyles, /top:\s*calc\(var\(--top-bar-h, 68px\) \+ 10px\)/,
  'The shared feedback banner must render below the application top bar')

console.log('Web workflow feedback checks passed.')
