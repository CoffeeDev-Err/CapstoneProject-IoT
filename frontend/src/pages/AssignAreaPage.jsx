import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFeedback } from '../context/useFeedback'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { getManageableDeployments, replaceDeployments } from '../services/operations'
import { filterDeploymentGroupsByPrefix, matchesPrefixSearch } from '../utils/searchMatching'
import { getDeploymentEditCancelledMessage } from '../utils/workflowFeedback'
import { appendDevelopmentMockPersonnel } from '../utils/mockPersonnel'
import * as deploymentForm from '../features/deployments/deploymentForm'
import {
  DeploymentScheduleFields,
  DeploymentTimingSelector,
} from '../features/deployments/DeploymentScheduleFields'
import DeploymentList from '../features/deployments/DeploymentList'
import PersonnelSelector from '../features/deployments/PersonnelSelector'
import { useDeploymentForm } from '../features/deployments/useDeploymentForm'
import DeploymentDialogs from '../features/deployments/DeploymentDialogs'

const {
  DEPLOYMENT_LIST_VIEWS,
  DEPLOYMENT_MODES,
  createDeploymentId,
  getDeploymentMode,
  patrolAreas,
  resolveGroupId,
  toDateTimeLocalValue,
  toEditableShiftStart,
  toIsoDateTime,
} = deploymentForm

function AssignAreaPage({ view = 'form' }) {
  const { personnel = [], isInitialDataLoading } = usePersonnelContext()
  const { showFeedback } = useFeedback()
  const location = useLocation()
  const navigate = useNavigate()
  const listOnly = view === 'list'
  const requestedAssignment = !listOnly ? location.state?.editAssignment : null
  const requestedGroupAssignments = !listOnly && Array.isArray(location.state?.editGroupAssignments)
    ? location.state.editGroupAssignments
    : []
  const requestedGroupFirstAssignment = requestedGroupAssignments[0]

  const personnelOptions = useMemo(() => {
    if (Array.isArray(personnel)) {
      return appendDevelopmentMockPersonnel(personnel).map((member) => ({
        id: member.id,
        name: member.name,
        rank: member.rank,
        isMockPersonnel: Boolean(member.isMockPersonnel),
      }))
    }

    return []
  }, [personnel])

  const [personnelSearch, setPersonnelSearch] = useState('')
  const [patrolAreaSearch, setPatrolAreaSearch] = useState('')
  const deferredPersonnelSearch = useDeferredValue(personnelSearch)
  const deferredPatrolAreaSearch = useDeferredValue(patrolAreaSearch)
  const [isPatrolAreaOpen, setIsPatrolAreaOpen] = useState(false)
  const [assignments, setAssignments] = useState([])
  const [editingAssignmentId, setEditingAssignmentId] = useState(requestedAssignment?.id || null)
  const [editingGroupId, setEditingGroupId] = useState(
    requestedGroupFirstAssignment ? resolveGroupId(requestedGroupFirstAssignment) : null,
  )
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState(null)
  const [deploymentActionNoticeOpen, setDeploymentActionNoticeOpen] = useState(false)
  const [deploymentSearch, setDeploymentSearch] = useState('')
  const deferredDeploymentSearch = useDeferredValue(deploymentSearch)
  const [activeDeploymentView, setActiveDeploymentView] = useState(DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)
  const [openGroupMenuId, setOpenGroupMenuId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeploymentsLoading, setIsDeploymentsLoading] = useState(true)
  const {
    assignmentForm,
    setAssignmentForm,
    resetAssignmentFormState,
    minimumSelectableShiftStart,
    activePersonnelIds,
    selectedPersonnelMembers,
    isShiftStartHintError,
    isShiftEndHintError,
    isPersonnelSelectionHintError,
    isScheduledDeployment,
    deploymentFormState,
    shiftStartHint,
    shiftEndHint,
    personnelSelectionHint,
    deploymentBlockingReasons,
    handleFormChange,
    handleModeChange,
    handlePersonnelToggle,
  } = useDeploymentForm({
    editingAssignmentId,
    isDeploymentsLoading,
    isInitialDataLoading,
    personnelOptions,
    requestedAssignment,
    requestedGroupAssignments,
    requestedGroupFirstAssignment,
  })
  const patrolAreaPickerRef = useRef(null)
  const patrolAreaSearchInputRef = useRef(null)

  useEffect(() => {
    let isCurrent = true

    getManageableDeployments()
      .then((deploymentPayload) => {
        if (isCurrent) setAssignments(deploymentPayload)
      })
      .catch((error) => {
        if (isCurrent) showFeedback(error.message, { type: 'error', title: 'Deployments unavailable' })
      })
      .finally(() => {
        if (isCurrent) setIsDeploymentsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [showFeedback])

  useEffect(() => {
    if (listOnly || !location.state) return
    if (requestedAssignment) {
      showFeedback(`Reassigning ${requestedAssignment.id}. Update the details, then save.`, { type: 'info' })
    } else if (requestedGroupFirstAssignment) {
      showFeedback(`Reassigning the group in ${requestedGroupFirstAssignment.patrolArea}. Update the details, then save.`, { type: 'info' })
    }
    navigate('/assign-area', { replace: true, state: null })
  }, [
    listOnly,
    location.state,
    navigate,
    requestedAssignment,
    requestedGroupFirstAssignment,
    showFeedback,
  ])

  const commitAssignments = async (nextAssignments, successMessage) => {
    setIsSaving(true)
    showFeedback('Saving deployment changes...', { type: 'info', duration: 2500 })

    try {
      const savedAssignments = await replaceDeployments(nextAssignments)
      setAssignments(savedAssignments)
      showFeedback(successMessage, { type: 'success' })
      return true
    } catch (error) {
      showFeedback(error.message, { type: 'error', title: 'Deployment not saved' })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const deploymentActionLabel = editingAssignmentId
    ? 'Save Reassignment'
    : editingGroupId
      ? 'Save Group Reassignment'
      : isScheduledDeployment
        ? 'Schedule Deployment'
        : 'Start Deployment'
  const filteredPersonnelOptions = useMemo(() => {
    const searchQuery = deferredPersonnelSearch.trim().toLowerCase()
    if (!searchQuery) {
      return personnelOptions
    }

    return personnelOptions.filter((item) => matchesPrefixSearch(searchQuery, [item.name, item.rank]))
  }, [deferredPersonnelSearch, personnelOptions])

  const filteredPatrolAreas = useMemo(() => {
    const searchQuery = deferredPatrolAreaSearch.trim().toLowerCase()
    if (!searchQuery) {
      return patrolAreas
    }

    return patrolAreas.filter((area) => matchesPrefixSearch(searchQuery, [area]))
  }, [deferredPatrolAreaSearch])

  const deploymentViewCounts = useMemo(() => assignments.reduce((counts, assignment) => {
    if (assignment.status === 'scheduled') {
      counts.scheduled += 1
    } else if (assignment.status === 'active') {
      counts.active += 1
    }

    return counts
  }, { active: 0, scheduled: 0 }), [assignments])

  const visibleAssignments = useMemo(() => assignments.filter((assignment) => (
    activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
      ? assignment.status === 'scheduled'
      : assignment.status === 'active'
  )), [activeDeploymentView, assignments])

  const groupedAssignments = useMemo(() => {
    const groupsMap = new Map()

    visibleAssignments.forEach((assignment) => {
      const groupId = resolveGroupId(assignment)

      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          groupId,
          patrolArea: assignment.patrolArea,
          assignments: [],
        })
      }

      groupsMap.get(groupId).assignments.push(assignment)
    })

    return Array.from(groupsMap.values())
  }, [visibleAssignments])

  const filteredGroupedAssignments = useMemo(() => {
    return filterDeploymentGroupsByPrefix(groupedAssignments, deferredDeploymentSearch)
  }, [deferredDeploymentSearch, groupedAssignments])

  useEffect(() => {
    if (!isPatrolAreaOpen) {
      return undefined
    }

    const handlePointerDownOutside = (event) => {
      if (patrolAreaPickerRef.current && !patrolAreaPickerRef.current.contains(event.target)) {
        setIsPatrolAreaOpen(false)
        setPatrolAreaSearch('')
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside)
    }
  }, [isPatrolAreaOpen])

  useEffect(() => {
    if (isPatrolAreaOpen && patrolAreaSearchInputRef.current) {
      patrolAreaSearchInputRef.current.focus()
    }
  }, [isPatrolAreaOpen])

  useEffect(() => {
    if (!openGroupMenuId) {
      return undefined
    }

    const handlePointerDownOutsideGroupMenu = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.assignment-group-menu')) {
        setOpenGroupMenuId(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutsideGroupMenu)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutsideGroupMenu)
    }
  }, [openGroupMenuId])

  const handleToggleAllFilteredPersonnel = () => {
    const filteredIds = filteredPersonnelOptions
      .filter((item) => !item.isMockPersonnel)
      .map((item) => item.id)
    if (filteredIds.length === 0) {
      return
    }

    setAssignmentForm((prev) => {
      const allFilteredSelected = filteredIds.every((id) => prev.personnelIds.includes(id))

      if (allFilteredSelected) {
        return {
          ...prev,
          personnelIds: prev.personnelIds.filter((id) => !filteredIds.includes(id)),
        }
      }

      return {
        ...prev,
        personnelIds: Array.from(new Set([...prev.personnelIds, ...filteredIds])),
      }
    })
  }

  const selectableFilteredPersonnel = filteredPersonnelOptions.filter((item) => !item.isMockPersonnel)
  const areAllFilteredSelected = selectableFilteredPersonnel.length > 0
    && selectableFilteredPersonnel.every((item) => activePersonnelIds.includes(item.id))

  const handleDeploymentActionClick = (event) => {
    if (deploymentFormState.canSubmit) return
    event.preventDefault()
    setDeploymentActionNoticeOpen(true)
  }

  const resetAssignmentForm = () => {
    resetAssignmentFormState()
    setPersonnelSearch('')
    setPatrolAreaSearch('')
    setIsPatrolAreaOpen(false)
  }

  const handleAssignPersonnel = async (event) => {
    event.preventDefault()

    if (selectedPersonnelMembers.length === 0 || !assignmentForm.patrolArea.trim()) {
      showFeedback('Select at least one personnel and a patrol area before saving.', { type: 'error' })
      return
    }

    const shiftStart = toIsoDateTime(assignmentForm.shiftStart)
    const shiftEnd = toIsoDateTime(assignmentForm.shiftEnd)

    if (!shiftStart || !shiftEnd) {
      showFeedback('Enter both the shift start and shift end before saving.', { type: 'error' })
      return
    }

    if (new Date(shiftEnd) <= new Date(shiftStart)) {
      showFeedback('Shift end must be later than shift start.', { type: 'error' })
      return
    }

    if (new Date(shiftStart) < new Date(minimumSelectableShiftStart)) {
      showFeedback('Shift start cannot use a past date or time.', { type: 'error' })
      return
    }

    if (new Date(shiftEnd).getTime() - new Date(shiftStart).getTime() > 24 * 60 * 60 * 1000) {
      showFeedback('A deployment shift must not exceed 24 hours.', { type: 'error' })
      return
    }

    const deploymentStatus = assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER
      ? 'scheduled'
      : 'active'

    if (deploymentStatus === 'scheduled' && new Date(shiftStart) <= new Date()) {
      showFeedback('A scheduled deployment must start in the future.', { type: 'error' })
      return
    }

    if (editingGroupId) {
      const currentGroupAssignments = assignments.filter((assignment) => resolveGroupId(assignment) === editingGroupId)

      if (currentGroupAssignments.length === 0) {
        showFeedback('Selected deployment group is no longer available.', { type: 'error' })
        setEditingGroupId(null)
        resetAssignmentForm()
        return
      }

      const nextGroupAssignments = selectedPersonnelMembers.map((member) => {
        const existingAssignment = currentGroupAssignments.find((item) => item.personnelId === member.id)

        if (existingAssignment) {
          return {
            ...existingAssignment,
            patrolArea: assignmentForm.patrolArea.trim(),
            shiftStart,
            shiftEnd,
            notes: assignmentForm.notes.trim(),
            status: deploymentStatus,
          }
        }

        const createdAssignment = {
          id: createDeploymentId('ASG'),
          groupId: editingGroupId,
          personnelId: member.id,
          personnelName: member.name,
          rank: member.rank,
          patrolArea: assignmentForm.patrolArea.trim(),
          shiftStart,
          shiftEnd,
          notes: assignmentForm.notes.trim(),
          assignedAt: new Date().toISOString(),
          status: deploymentStatus,
        }
        return createdAssignment
      })

      const nonGroupAssignments = assignments.filter((item) => resolveGroupId(item) !== editingGroupId)
      const saved = await commitAssignments(
        [...nextGroupAssignments, ...nonGroupAssignments],
        `${nextGroupAssignments.length} personnel reassigned to ${assignmentForm.patrolArea.trim()}.`
      )
      if (!saved) return
      setActiveDeploymentView(deploymentStatus === 'scheduled'
        ? DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
        : DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)
      setEditingGroupId(null)
      setEditingAssignmentId(null)
      resetAssignmentForm()
      navigate('/deployments')
      return
    }

    if (editingAssignmentId) {
      if (selectedPersonnelMembers.length !== 1) {
        showFeedback('Editing requires exactly one personnel selection.', { type: 'error' })
        return
      }

      const selectedMember = selectedPersonnelMembers[0]

      const nextAssignments = assignments.map((item) => {
        if (item.id !== editingAssignmentId) {
          return item
        }

        return {
          ...item,
          personnelId: selectedMember.id,
          personnelName: selectedMember.name,
          rank: selectedMember.rank,
          patrolArea: assignmentForm.patrolArea.trim(),
          shiftStart,
          shiftEnd,
          notes: assignmentForm.notes.trim(),
          status: deploymentStatus,
        }
      })

      const saved = await commitAssignments(
        nextAssignments,
        `${selectedMember.name} reassigned to ${assignmentForm.patrolArea.trim()}.`
      )
      if (!saved) return
      setActiveDeploymentView(deploymentStatus === 'scheduled'
        ? DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
        : DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)
      setEditingAssignmentId(null)
      setEditingGroupId(null)
      resetAssignmentForm()
      navigate('/deployments')
      return
    }

    const assignedAt = new Date().toISOString()
    const groupId = createDeploymentId('GRP')
    const newAssignments = selectedPersonnelMembers.map((member) => ({
      id: createDeploymentId('ASG'),
      groupId,
      personnelId: member.id,
      personnelName: member.name,
      rank: member.rank,
      patrolArea: assignmentForm.patrolArea.trim(),
      shiftStart,
      shiftEnd,
      notes: assignmentForm.notes.trim(),
      assignedAt,
      status: deploymentStatus,
    }))

    const feedback = newAssignments.length === 1
      ? `${newAssignments[0].personnelName} assigned to ${newAssignments[0].patrolArea}.`
      : `${newAssignments.length} personnel assigned to ${newAssignments[0].patrolArea}.`

    const saved = await commitAssignments([...newAssignments, ...assignments], feedback)
    if (!saved) return
    setActiveDeploymentView(deploymentStatus === 'scheduled'
      ? DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
      : DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)
    resetAssignmentForm()
    navigate('/deployments')
  }

  const handleSelectPatrolArea = (area) => {
    setAssignmentForm((prev) => ({
      ...prev,
      patrolArea: area,
    }))
    setPatrolAreaSearch('')
    setIsPatrolAreaOpen(false)
  }

  const handleEditAssignment = (assignment) => {
    if (listOnly) {
      navigate('/assign-area', { state: { editAssignment: assignment } })
      return
    }
    setEditingAssignmentId(assignment.id)
    setEditingGroupId(null)
    setAssignmentForm({
      mode: getDeploymentMode(assignment),
      personnelIds: [assignment.personnelId],
      patrolArea: assignment.patrolArea || patrolAreas[0],
      shiftStart: toEditableShiftStart(assignment.shiftStart),
      shiftEnd: toDateTimeLocalValue(assignment.shiftEnd),
      notes: assignment.notes || '',
    })
    setPersonnelSearch('')
    showFeedback(`Reassigning ${assignment.id}. Update the details, then save.`, { type: 'info' })
  }

  const handleEditGroup = (groupId) => {
    const groupAssignments = assignments.filter((assignment) => resolveGroupId(assignment) === groupId)

    if (groupAssignments.length === 0) {
      return
    }

    if (listOnly) {
      navigate('/assign-area', { state: { editGroupAssignments: groupAssignments } })
      return
    }

    const firstAssignment = groupAssignments[0]

    setEditingGroupId(groupId)
    setEditingAssignmentId(null)
    setAssignmentForm({
      mode: getDeploymentMode(firstAssignment),
      personnelIds: groupAssignments.map((assignment) => assignment.personnelId),
      patrolArea: firstAssignment.patrolArea || patrolAreas[0],
      shiftStart: toEditableShiftStart(firstAssignment.shiftStart),
      shiftEnd: toDateTimeLocalValue(firstAssignment.shiftEnd),
      notes: firstAssignment.notes || '',
    })
    setPersonnelSearch('')
    setOpenGroupMenuId(null)
    showFeedback(`Reassigning the group in ${firstAssignment.patrolArea}. Update the details, then save.`, { type: 'info' })
  }

  const handleDeleteAssignment = (assignmentId) => {
    const assignmentToDelete = assignments.find((item) => item.id === assignmentId)

    commitAssignments(
      assignments.filter((item) => item.id !== assignmentId),
      `${assignmentToDelete?.personnelName || 'Personnel'} removed from deployment assignments.`
    )

    if (editingAssignmentId === assignmentId) {
      setEditingAssignmentId(null)
      resetAssignmentForm()
    }

    if (assignmentToDelete && editingGroupId && resolveGroupId(assignmentToDelete) === editingGroupId) {
      setEditingGroupId(null)
      resetAssignmentForm()
    }

  }

  const handleRequestDeleteGroup = (group) => {
    setOpenGroupMenuId(null)
    setPendingDeleteGroup(group)
  }

  const handleToggleGroupMenu = (groupId) => {
    setOpenGroupMenuId((prev) => (prev === groupId ? null : groupId))
  }

  const handleDeleteGroup = (groupId) => {
    const groupAssignments = assignments.filter((assignment) => resolveGroupId(assignment) === groupId)

    if (groupAssignments.length === 0) {
      return
    }

    commitAssignments(
      assignments.filter((assignment) => resolveGroupId(assignment) !== groupId),
      `${groupAssignments.length} assignment(s) removed from ${groupAssignments[0].patrolArea}.`
    )

    if (editingGroupId === groupId) {
      setEditingGroupId(null)
      resetAssignmentForm()
    }

    if (editingAssignmentId && groupAssignments.some((assignment) => assignment.id === editingAssignmentId)) {
      setEditingAssignmentId(null)
      resetAssignmentForm()
    }

  }

  const handleRequestDeleteAssignment = (assignment) => {
    setPendingDeleteAssignment(assignment)
  }

  const handleConfirmDeleteAssignment = () => {
    if (!pendingDeleteAssignment) {
      return
    }

    handleDeleteAssignment(pendingDeleteAssignment.id)
    setPendingDeleteAssignment(null)
  }

  const handleCancelDeleteAssignment = () => {
    setPendingDeleteAssignment(null)
  }

  const handleConfirmDeleteGroup = () => {
    if (!pendingDeleteGroup) {
      return
    }

    handleDeleteGroup(pendingDeleteGroup.groupId)
    setPendingDeleteGroup(null)
  }

  const handleCancelDeleteGroup = () => {
    setPendingDeleteGroup(null)
  }

  const handleCancelEdit = () => {
    const editingAssignment = assignments.find((assignment) => assignment.id === editingAssignmentId)
    const editingGroupAssignment = assignments.find(
      (assignment) => resolveGroupId(assignment) === editingGroupId
    )
    const deploymentLabel = editingGroupId
      ? `the group in ${editingGroupAssignment?.patrolArea || 'the selected patrol area'}`
      : editingAssignment?.personnelName || editingAssignmentId

    setEditingAssignmentId(null)
    setEditingGroupId(null)
    resetAssignmentForm()
    showFeedback(getDeploymentEditCancelledMessage(deploymentLabel), { type: 'info' })
  }

  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header assignment-page-header mb-4">
        <div>
          <h2 className="page-title">{listOnly ? 'Assigned Deployments' : 'Deployment Management'}</h2>
          <p className="page-subtitle">
            {listOnly
              ? 'Search and manage active or scheduled personnel assignments'
              : 'Assign personnel to patrol areas and shifts'}
          </p>
        </div>
        <button
          type="button"
          className="assignment-page-link"
          onClick={() => navigate(listOnly ? '/assign-area' : '/deployments')}
        >
          {listOnly ? 'Create Deployment' : 'View Assigned Deployments'}
        </button>
      </header>

      {!listOnly && (
      <div className="widget-card deployment-form-card slide-up mb-3">
        <h3 className="widget-title mb-3">Assign Personnel</h3>

        <form className="assignment-form" onSubmit={handleAssignPersonnel}>
          <DeploymentTimingSelector
            disabled={isSaving}
            mode={assignmentForm.mode}
            onChange={handleModeChange}
          />

          <div className="assignment-grid mb-3">
            <div className="assignment-field assignment-field--area">
              <span>Patrol Area</span>
              <div className="assignment-area-picker" ref={patrolAreaPickerRef}>
                <button
                  type="button"
                  className="settings-input w-100 assignment-area-trigger"
                  onClick={() => setIsPatrolAreaOpen((prev) => !prev)}
                  aria-label="Select patrol area"
                  aria-expanded={isPatrolAreaOpen}
                  aria-haspopup="listbox"
                >
                  <span className="assignment-area-trigger__value">{assignmentForm.patrolArea}</span>
                  <span className="assignment-area-trigger__icon">v</span>
                </button>

                {isPatrolAreaOpen && (
                  <div className="assignment-area-dropdown">
                    <input
                      ref={patrolAreaSearchInputRef}
                      type="search"
                      className="settings-input w-100 assignment-search-input"
                      value={patrolAreaSearch}
                      onChange={(event) => setPatrolAreaSearch(event.target.value)}
                      placeholder="Search barangay, street, or highway"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setIsPatrolAreaOpen(false)
                          setPatrolAreaSearch('')
                        }
                      }}
                    />

                    <div className="assignment-area-options no-scrollbar" role="listbox">
                      {filteredPatrolAreas.length === 0 ? (
                        <small className="assignment-field__hint">No matching patrol area.</small>
                      ) : (
                        filteredPatrolAreas.map((area) => (
                          <button
                            key={area}
                            type="button"
                            className={`assignment-area-option${assignmentForm.patrolArea === area ? ' is-active' : ''}`}
                            onClick={() => handleSelectPatrolArea(area)}
                          >
                            {area}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DeploymentScheduleFields
              maximumShiftEnd={deploymentFormState.maximumShiftEnd}
              minimumShiftEnd={deploymentFormState.minimumShiftEnd}
              minimumShiftStart={minimumSelectableShiftStart}
              mode={assignmentForm.mode}
              onChange={(field, value) => setAssignmentForm((previous) => ({ ...previous, [field]: value }))}
              shiftEnd={assignmentForm.shiftEnd}
              shiftEndHint={shiftEndHint}
              shiftEndInvalid={isShiftEndHintError}
              shiftStart={assignmentForm.shiftStart}
              shiftStartHint={shiftStartHint}
              shiftStartInvalid={isShiftStartHintError}
            />
            <PersonnelSelector
              activePersonnelIds={activePersonnelIds}
              areAllFilteredSelected={areAllFilteredSelected}
              filteredPersonnelOptions={filteredPersonnelOptions}
              isInitialDataLoading={isInitialDataLoading}
              isSelectionInvalid={isPersonnelSelectionHintError}
              onSearchChange={setPersonnelSearch}
              onToggle={handlePersonnelToggle}
              onToggleAll={handleToggleAllFilteredPersonnel}
              search={personnelSearch}
              selectableCount={selectableFilteredPersonnel.length}
              selectionHint={personnelSelectionHint}
            />
            <label className="assignment-field assignment-field--notes">
              <span>Notes</span>
              <textarea
                className="settings-input w-100"
                value={assignmentForm.notes}
                onChange={handleFormChange('notes')}
                placeholder="Deployment instructions, route reminders, or priority checkpoints"
                rows={2}
              />
            </label>
          </div>

          <div className="assignment-form-actions">
            <button
              type="submit"
              className="report-generate-btn report-generate-btn--assign"
              disabled={isSaving}
              onClick={handleDeploymentActionClick}
              aria-haspopup={deploymentFormState.canSubmit ? undefined : 'dialog'}
            >
              {isSaving ? 'Saving...' : deploymentActionLabel}
            </button>
            {(editingAssignmentId || editingGroupId) && (
              <button type="button" className="assignment-inline-btn" onClick={handleCancelEdit}>
                Cancel Reassignment
              </button>
            )}
          </div>
        </form>
      </div>
      )}

      {listOnly && (
        <DeploymentList
          activeDeploymentView={activeDeploymentView}
          assignments={assignments}
          deploymentSearch={deploymentSearch}
          deploymentViewCounts={deploymentViewCounts}
          filteredGroupedAssignments={filteredGroupedAssignments}
          isDeploymentsLoading={isDeploymentsLoading}
          onDeleteAssignment={handleRequestDeleteAssignment}
          onDeleteGroup={handleRequestDeleteGroup}
          onEditAssignment={handleEditAssignment}
          onEditGroup={handleEditGroup}
          onSearchChange={setDeploymentSearch}
          onToggleGroupMenu={handleToggleGroupMenu}
          onViewChange={(nextView) => {
            setActiveDeploymentView(nextView)
            setOpenGroupMenuId(null)
          }}
          openGroupMenuId={openGroupMenuId}
          visibleAssignments={visibleAssignments}
        />
      )}

      <DeploymentDialogs
        actionLabel={deploymentActionLabel}
        actionNoticeOpen={deploymentActionNoticeOpen}
        deploymentBlockingReasons={deploymentBlockingReasons}
        onCancelDeleteAssignment={handleCancelDeleteAssignment}
        onCancelDeleteGroup={handleCancelDeleteGroup}
        onCloseActionNotice={() => setDeploymentActionNoticeOpen(false)}
        onConfirmDeleteAssignment={handleConfirmDeleteAssignment}
        onConfirmDeleteGroup={handleConfirmDeleteGroup}
        pendingDeleteAssignment={pendingDeleteAssignment}
        pendingDeleteGroup={pendingDeleteGroup}
      />
    </div>
  )
}

export default AssignAreaPage
