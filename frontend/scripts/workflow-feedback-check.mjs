import assert from 'node:assert/strict'
import {
  getAccountEditCancelledMessage,
  getDeploymentEditCancelledMessage,
} from '../src/utils/workflowFeedback.js'

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

console.log('Web workflow feedback checks passed.')
