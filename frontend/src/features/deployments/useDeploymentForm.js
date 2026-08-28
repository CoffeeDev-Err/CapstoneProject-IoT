import { useEffect, useState } from 'react'
import {
  DEPLOYMENT_MODES,
  addHoursToLocalValue,
  addMinutesToLocalValue,
  createEmptyAssignmentForm,
  getCurrentDateTimeLocalValue,
  getDeploymentMode,
  patrolAreas,
  toDateTimeLocalValue,
  toEditableShiftStart,
} from './deploymentForm'

const createInitialForm = ({
  requestedAssignment,
  requestedGroupAssignments,
  requestedGroupFirstAssignment,
}) => {
  const source = requestedAssignment || requestedGroupFirstAssignment
  if (!source) return createEmptyAssignmentForm()
  return {
    mode: getDeploymentMode(source),
    personnelIds: requestedAssignment
      ? [requestedAssignment.personnelId]
      : requestedGroupAssignments.map((item) => item.personnelId),
    patrolArea: source.patrolArea || patrolAreas[0],
    shiftStart: toEditableShiftStart(source.shiftStart),
    shiftEnd: toDateTimeLocalValue(source.shiftEnd),
    notes: source.notes || '',
  }
}

export function useDeploymentForm({
  editingAssignmentId,
  isDeploymentsLoading,
  isInitialDataLoading,
  personnelOptions,
  requestedAssignment,
  requestedGroupAssignments,
  requestedGroupFirstAssignment,
}) {
  const [assignmentForm, setAssignmentForm] = useState(() => createInitialForm({
    requestedAssignment,
    requestedGroupAssignments,
    requestedGroupFirstAssignment,
  }))
  const [minimumShiftDateTime, setMinimumShiftDateTime] = useState(getCurrentDateTimeLocalValue)

  useEffect(() => {
    const updateMinimum = () => {
      const nextMinimum = getCurrentDateTimeLocalValue()
      setMinimumShiftDateTime(nextMinimum)
      setAssignmentForm((currentForm) => (
        currentForm.mode === DEPLOYMENT_MODES.START_NOW
          && currentForm.shiftStart < nextMinimum
          ? { ...currentForm, shiftStart: nextMinimum }
          : currentForm
      ))
    }
    const intervalId = window.setInterval(updateMinimum, 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const minimumSelectableShiftStart = assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER
    ? addMinutesToLocalValue(minimumShiftDateTime, 1)
    : minimumShiftDateTime
  const activePersonnelIds = assignmentForm.personnelIds.filter((id) => (
    personnelOptions.some((item) => item.id === id && !item.isMockPersonnel)
  ))
  const selectedPersonnelMembers = personnelOptions.filter((item) => (
    activePersonnelIds.includes(item.id)
  ))
  const formShiftStart = new Date(assignmentForm.shiftStart)
  const formShiftEnd = new Date(assignmentForm.shiftEnd)
  const hasValidShiftStart = !Number.isNaN(formShiftStart.getTime())
    && formShiftStart >= new Date(minimumSelectableShiftStart)
  const hasValidShiftEnd = !Number.isNaN(formShiftEnd.getTime()) && formShiftEnd > formShiftStart
  const isWithinMaximumDuration = hasValidShiftStart && hasValidShiftEnd
    && formShiftEnd.getTime() - formShiftStart.getTime() <= 24 * 60 * 60 * 1000
  const hasSelectedPersonnel = selectedPersonnelMembers.length > 0
  const hasPatrolArea = Boolean(assignmentForm.patrolArea.trim())
  const hasValidPersonnelSelection = hasSelectedPersonnel
    && (!editingAssignmentId || selectedPersonnelMembers.length === 1)
  const isScheduledDeployment = assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER
  const deploymentFormState = {
    canSubmit: !isDeploymentsLoading
      && hasValidPersonnelSelection
      && hasPatrolArea
      && hasValidShiftStart
      && hasValidShiftEnd
      && isWithinMaximumDuration
      && !isInitialDataLoading,
    maximumShiftEnd: assignmentForm.shiftStart
      ? addHoursToLocalValue(assignmentForm.shiftStart, 24)
      : '',
    minimumShiftEnd: assignmentForm.shiftStart > minimumSelectableShiftStart
      ? assignmentForm.shiftStart
      : minimumSelectableShiftStart,
  }
  const shiftStartHint = !assignmentForm.shiftStart
    ? isScheduledDeployment ? 'Choose a future start date and time.' : 'Choose a shift start date and time.'
    : !hasValidShiftStart
      ? isScheduledDeployment
        ? 'The scheduled start must be in the future.'
        : 'Shift start cannot be earlier than the current time.'
      : isScheduledDeployment
        ? 'The deployment will begin at the selected future date and time.'
        : 'The current date and time are selected. Choose another time if needed.'
  const shiftEndHint = !assignmentForm.shiftEnd
    ? 'Choose a shift end date and time.'
    : !hasValidShiftEnd
      ? 'Shift end must be later than shift start.'
      : !isWithinMaximumDuration
        ? 'The shift duration cannot exceed 24 hours.'
        : 'Shift end may be up to 24 hours after shift start.'
  const personnelSelectionHint = isInitialDataLoading
    ? 'Available personnel are still loading.'
    : personnelOptions.length === 0
      ? 'No personnel members are currently available for deployment.'
      : !hasSelectedPersonnel
        ? 'Select at least one personnel member.'
        : editingAssignmentId && selectedPersonnelMembers.length !== 1
          ? 'Select exactly one personnel member when editing an individual deployment.'
          : `${selectedPersonnelMembers.length} personnel member${selectedPersonnelMembers.length === 1 ? '' : 's'} selected.`
  const deploymentBlockingReasons = [
    isDeploymentsLoading ? 'Wait for deployment data to finish loading.' : '',
    isInitialDataLoading ? 'Wait for available personnel to finish loading.' : '',
    !isInitialDataLoading && !hasSelectedPersonnel ? 'Select at least one real personnel member.' : '',
    editingAssignmentId && hasSelectedPersonnel && selectedPersonnelMembers.length !== 1
      ? 'Select exactly one personnel member when editing an individual deployment.' : '',
    !hasPatrolArea ? 'Select a patrol area.' : '',
    !assignmentForm.shiftStart ? 'Choose a shift start date and time.'
      : !hasValidShiftStart
        ? isScheduledDeployment ? 'Choose a future start date and time.' : 'Choose a start time that is not in the past.'
        : '',
    !assignmentForm.shiftEnd ? 'Choose a shift end date and time.'
      : !hasValidShiftEnd ? 'Choose an end time later than the shift start.'
        : !isWithinMaximumDuration ? 'Limit the shift duration to 24 hours.' : '',
  ].filter(Boolean)

  const handleFormChange = (field) => (event) => {
    setAssignmentForm((current) => ({ ...current, [field]: event.target.value }))
  }
  const handleModeChange = (mode) => {
    setAssignmentForm((current) => ({
      ...current,
      mode,
      shiftStart: mode === DEPLOYMENT_MODES.START_NOW ? getCurrentDateTimeLocalValue() : '',
    }))
  }
  const handlePersonnelToggle = (personnelId) => {
    if (personnelOptions.some((item) => item.id === personnelId && item.isMockPersonnel)) return
    setAssignmentForm((current) => ({
      ...current,
      personnelIds: current.personnelIds.includes(personnelId)
        ? current.personnelIds.filter((id) => id !== personnelId)
        : [...current.personnelIds, personnelId],
    }))
  }

  return {
    assignmentForm,
    setAssignmentForm,
    resetAssignmentFormState: () => setAssignmentForm(createEmptyAssignmentForm()),
    minimumSelectableShiftStart,
    activePersonnelIds,
    selectedPersonnelMembers,
    isShiftStartHintError: !hasValidShiftStart,
    isShiftEndHintError: !hasValidShiftEnd || !isWithinMaximumDuration,
    isPersonnelSelectionHintError: !isInitialDataLoading && !hasValidPersonnelSelection,
    isScheduledDeployment,
    deploymentFormState,
    shiftStartHint,
    shiftEndHint,
    personnelSelectionHint,
    deploymentBlockingReasons,
    handleFormChange,
    handleModeChange,
    handlePersonnelToggle,
  }
}
