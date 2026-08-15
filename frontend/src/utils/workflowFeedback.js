const normalizeLabel = (value, fallback) => {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || fallback
}

export const getAccountEditCancelledMessage = (accountLabel) => (
  `Editing ${normalizeLabel(accountLabel, 'the selected account')} was cancelled. `
  + 'No account changes were saved, and the form is ready to create a new account.'
)

export const getDeploymentEditCancelledMessage = (deploymentLabel) => (
  `Re-assignment for ${normalizeLabel(deploymentLabel, 'the selected deployment')} was cancelled. `
  + 'No deployment changes were saved, and the form is ready to create a new deployment.'
)
