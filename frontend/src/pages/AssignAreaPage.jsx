import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'
import { CABAGAN_BARANGAYS } from '../constants/cabaganBarangays'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { replaceDeployments } from '../services/operations'

const patrolAreas = [
  ...CABAGAN_BARANGAYS.map((barangay) => `Barangay ${barangay}`),
  'Cabagan Public Market Zone',
  'Municipal Hall Perimeter',
  'Barangay Centro Route',
  'Cabagan-Santa Maria Road',
  'Cabagan-Tumauini Road',
  'Maharlika Highway Northbound',
  'Maharlika Highway Southbound',
  'National Highway Checkpoint North',
  'National Highway Checkpoint South',
  'Highway Checkpoint North',
  'Highway Checkpoint South',
  'School Safety Patrol Route',
  'Bridge Approach Patrol Zone',
]

const formatDateTime = (isoValue) => {
  if (!isoValue) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoValue))
}

const getCurrentDateTimeLocalValue = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const createEmptyAssignmentForm = () => ({
  personnelIds: [],
  patrolArea: patrolAreas[0],
  shiftStart: getCurrentDateTimeLocalValue(),
  shiftEnd: '',
  notes: '',
})

const toDateTimeLocalValue = (value) => {
  if (!value) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  const year = parsedDate.getFullYear()
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
  const day = String(parsedDate.getDate()).padStart(2, '0')
  const hours = String(parsedDate.getHours()).padStart(2, '0')
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const toIsoDateTime = (value) => {
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString()
}

const resolveGroupId = (assignment) => assignment.groupId || `${assignment.patrolArea}__${assignment.assignedAt || 'none'}`

function AssignAreaPage() {
  const { personnel = [], deployments = [] } = usePersonnelContext()

  const personnelOptions = useMemo(() => {
    if (Array.isArray(personnel) && personnel.length > 0) {
      return personnel.map((member) => ({
        id: member.id,
        name: member.name,
        rank: member.rank,
      }))
    }

    return []
  }, [personnel])

  const [assignmentForm, setAssignmentForm] = useState(createEmptyAssignmentForm)
  const [personnelSearch, setPersonnelSearch] = useState('')
  const [patrolAreaSearch, setPatrolAreaSearch] = useState('')
  const [isPatrolAreaOpen, setIsPatrolAreaOpen] = useState(false)
  const [assignments, setAssignments] = useState([])
  const [editingAssignmentId, setEditingAssignmentId] = useState(null)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState(null)
  const [deploymentSearch, setDeploymentSearch] = useState('')
  const [openGroupMenuId, setOpenGroupMenuId] = useState(null)
  const [assignMessage, setAssignMessage] = useState('')
  const nextAssignmentIdRef = useRef(1)
  const patrolAreaPickerRef = useRef(null)
  const patrolAreaSearchInputRef = useRef(null)

  useEffect(() => {
    setAssignments(deployments)
  }, [deployments])

  const commitAssignments = (nextAssignments, successMessage) => {
    setAssignments(nextAssignments)
    setAssignMessage('Saving deployment changes...')

    replaceDeployments(nextAssignments)
      .then(() => setAssignMessage(successMessage))
      .catch((error) => setAssignMessage(error.message))
  }

  const activePersonnelIds = assignmentForm.personnelIds.filter((id) =>
    personnelOptions.some((item) => item.id === id)
  )

  const selectedPersonnelMembers = personnelOptions.filter((item) =>
    activePersonnelIds.includes(item.id)
  )

  const filteredPersonnelOptions = useMemo(() => {
    const searchQuery = personnelSearch.trim().toLowerCase()
    if (!searchQuery) {
      return personnelOptions
    }

    return personnelOptions.filter((item) =>
      `${item.name} ${item.rank}`.toLowerCase().includes(searchQuery)
    )
  }, [personnelOptions, personnelSearch])

  const filteredPatrolAreas = useMemo(() => {
    const searchQuery = patrolAreaSearch.trim().toLowerCase()
    if (!searchQuery) {
      return patrolAreas
    }

    return patrolAreas.filter((area) => area.toLowerCase().includes(searchQuery))
  }, [patrolAreaSearch])

  const groupedAssignments = useMemo(() => {
    const groupsMap = new Map()

    assignments.forEach((assignment) => {
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
  }, [assignments])

  const filteredGroupedAssignments = useMemo(() => {
    const query = deploymentSearch.trim().toLowerCase()

    if (!query) {
      return groupedAssignments
    }

    return groupedAssignments.filter((group) => group.patrolArea.toLowerCase().includes(query))
  }, [deploymentSearch, groupedAssignments])

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

  const handleFormChange = (field) => (event) => {
    setAssignmentForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }))
  }

  const handlePersonnelToggle = (personnelId) => {
    setAssignmentForm((prev) => ({
      ...prev,
      personnelIds: prev.personnelIds.includes(personnelId)
        ? prev.personnelIds.filter((id) => id !== personnelId)
        : [...prev.personnelIds, personnelId],
    }))
  }

  const handleToggleAllFilteredPersonnel = () => {
    const filteredIds = filteredPersonnelOptions.map((item) => item.id)
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

  const areAllFilteredSelected = filteredPersonnelOptions.length > 0
    && filteredPersonnelOptions.every((item) => activePersonnelIds.includes(item.id))

  const resetAssignmentForm = () => {
    setAssignmentForm(createEmptyAssignmentForm())
    setPersonnelSearch('')
    setPatrolAreaSearch('')
    setIsPatrolAreaOpen(false)
  }

  const handleAssignPersonnel = (event) => {
    event.preventDefault()

    if (selectedPersonnelMembers.length === 0 || !assignmentForm.patrolArea.trim()) {
      setAssignMessage('Select at least one personnel and a patrol area before saving.')
      return
    }

    const shiftStart = toIsoDateTime(assignmentForm.shiftStart)
    const shiftEnd = toIsoDateTime(assignmentForm.shiftEnd)

    if (!shiftStart || !shiftEnd) {
      setAssignMessage('Enter both the shift start and shift end before saving.')
      return
    }

    if (new Date(shiftEnd) <= new Date(shiftStart)) {
      setAssignMessage('Shift end must be later than shift start.')
      return
    }

    if (editingGroupId) {
      const currentGroupAssignments = assignments.filter((assignment) => resolveGroupId(assignment) === editingGroupId)

      if (currentGroupAssignments.length === 0) {
        setAssignMessage('Selected deployment group is no longer available.')
        setEditingGroupId(null)
        resetAssignmentForm()
        return
      }

      let nextAssignmentNumber = nextAssignmentIdRef.current

      const nextGroupAssignments = selectedPersonnelMembers.map((member) => {
        const existingAssignment = currentGroupAssignments.find((item) => item.personnelId === member.id)

        if (existingAssignment) {
          return {
            ...existingAssignment,
            patrolArea: assignmentForm.patrolArea.trim(),
            shiftStart,
            shiftEnd,
            notes: assignmentForm.notes.trim(),
          }
        }

        const createdAssignment = {
          id: `ASG-${nextAssignmentNumber}`,
          groupId: editingGroupId,
          personnelId: member.id,
          personnelName: member.name,
          rank: member.rank,
          patrolArea: assignmentForm.patrolArea.trim(),
          shiftStart,
          shiftEnd,
          notes: assignmentForm.notes.trim(),
          assignedAt: new Date().toISOString(),
        }

        nextAssignmentNumber += 1
        return createdAssignment
      })

      nextAssignmentIdRef.current = nextAssignmentNumber

      const nonGroupAssignments = assignments.filter((item) => resolveGroupId(item) !== editingGroupId)
      commitAssignments(
        [...nextGroupAssignments, ...nonGroupAssignments],
        `${nextGroupAssignments.length} personnel reassigned to ${assignmentForm.patrolArea.trim()}.`
      )
      setEditingGroupId(null)
      setEditingAssignmentId(null)
      resetAssignmentForm()
      return
    }

    if (editingAssignmentId) {
      if (selectedPersonnelMembers.length !== 1) {
        setAssignMessage('Editing requires exactly one personnel selection.')
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
        }
      })

      commitAssignments(
        nextAssignments,
        `${selectedMember.name} reassigned to ${assignmentForm.patrolArea.trim()}.`
      )
      setEditingAssignmentId(null)
      setEditingGroupId(null)
      resetAssignmentForm()
      return
    }

    const assignedAt = new Date().toISOString()
    const assignmentBatchSeed = nextAssignmentIdRef.current
    const groupId = `GRP-${assignedAt.replace(/[-:.TZ]/g, '')}-${assignmentBatchSeed}`
    const newAssignments = selectedPersonnelMembers.map((member, index) => ({
      id: `ASG-${assignmentBatchSeed + index}`,
      groupId,
      personnelId: member.id,
      personnelName: member.name,
      rank: member.rank,
      patrolArea: assignmentForm.patrolArea.trim(),
      shiftStart,
      shiftEnd,
      notes: assignmentForm.notes.trim(),
      assignedAt,
    }))

    nextAssignmentIdRef.current += newAssignments.length

    const feedback = newAssignments.length === 1
      ? `${newAssignments[0].personnelName} assigned to ${newAssignments[0].patrolArea}.`
      : `${newAssignments.length} personnel assigned to ${newAssignments[0].patrolArea}.`

    commitAssignments([...newAssignments, ...assignments], feedback)
    resetAssignmentForm()
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
    setEditingAssignmentId(assignment.id)
    setEditingGroupId(null)
    setAssignmentForm({
      personnelIds: [assignment.personnelId],
      patrolArea: assignment.patrolArea || patrolAreas[0],
      shiftStart: toDateTimeLocalValue(assignment.shiftStart) || getCurrentDateTimeLocalValue(),
      shiftEnd: toDateTimeLocalValue(assignment.shiftEnd),
      notes: assignment.notes || '',
    })
    setPersonnelSearch('')
    setAssignMessage(`Re-assigning ${assignment.id}. Update details then click "Save Re-assignment".`)
  }

  const handleEditGroup = (groupId) => {
    const groupAssignments = assignments.filter((assignment) => resolveGroupId(assignment) === groupId)

    if (groupAssignments.length === 0) {
      return
    }

    const firstAssignment = groupAssignments[0]

    setEditingGroupId(groupId)
    setEditingAssignmentId(null)
    setAssignmentForm({
      personnelIds: groupAssignments.map((assignment) => assignment.personnelId),
      patrolArea: firstAssignment.patrolArea || patrolAreas[0],
      shiftStart: toDateTimeLocalValue(firstAssignment.shiftStart) || getCurrentDateTimeLocalValue(),
      shiftEnd: toDateTimeLocalValue(firstAssignment.shiftEnd),
      notes: firstAssignment.notes || '',
    })
    setPersonnelSearch('')
    setOpenGroupMenuId(null)
    setAssignMessage(
      `Re-assigning group ${firstAssignment.patrolArea}. Update details then click "Save Group Re-assignment".`
    )
  }

  const handleDeleteAssignment = (assignmentId) => {
    const assignmentToDelete = assignments.find((item) => item.id === assignmentId)

    commitAssignments(
      assignments.filter((item) => item.id !== assignmentId),
      `${assignmentId} deleted from deployment assignments.`
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
    setEditingAssignmentId(null)
    setEditingGroupId(null)
    resetAssignmentForm()
    setAssignMessage('Edit cancelled.')
  }

  return (
    <div className="page-container fade-in p-3 p-md-4">
      <header className="page-header mb-4">
        <div>
          <h2 className="page-title">Assign Area</h2>
          <p className="page-subtitle">Assign patrol areas and manage deployment assignments</p>
        </div>
      </header>

      <div className="widget-card slide-up mb-3">
        <h3 className="widget-title mb-3">Supervisor Deployment Assignment</h3>

        <form className="assignment-form" onSubmit={handleAssignPersonnel}>
          <div className="assignment-grid mb-3">
            <div className="assignment-field assignment-field--personnel">
              <span>Personnel (Checkbox)</span>
              <input
                type="search"
                className="settings-input w-100 assignment-search-input"
                value={personnelSearch}
                onChange={(event) => setPersonnelSearch(event.target.value)}
                placeholder="Search personnel name or rank"
              />

              <div className="assignment-checklist no-scrollbar">
                {filteredPersonnelOptions.length === 0 ? (
                  <p className="assignment-checklist__empty mb-0">No personnel matches your search.</p>
                ) : (
                  filteredPersonnelOptions.map((option) => (
                    <label key={option.id} className="assignment-check-item">
                      <input
                        type="checkbox"
                        checked={activePersonnelIds.includes(option.id)}
                        onChange={() => handlePersonnelToggle(option.id)}
                      />
                      <span>{option.name} - {option.rank}</span>
                    </label>
                  ))
                )}
              </div>

              <div className="assignment-field__hint-row">
                <small className="assignment-field__hint">{activePersonnelIds.length} personnel selected.</small>
                <button
                  type="button"
                  className="assignment-inline-btn"
                  onClick={handleToggleAllFilteredPersonnel}
                  disabled={filteredPersonnelOptions.length === 0}
                >
                  {areAllFilteredSelected ? 'Clear Filtered' : 'Select All Filtered'}
                </button>
              </div>
            </div>

            <label className="assignment-field">
              <span>Patrol Area</span>
              <div className="assignment-area-picker" ref={patrolAreaPickerRef}>
                <button
                  type="button"
                  className="settings-input w-100 assignment-area-trigger"
                  onClick={() => setIsPatrolAreaOpen((prev) => !prev)}
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
            </label>

            <label className="assignment-field">
              <span>Shift Start *</span>
              <input
                type="datetime-local"
                className="settings-input w-100"
                value={assignmentForm.shiftStart}
                onChange={handleFormChange('shiftStart')}
                required
              />
            </label>

            <label className="assignment-field">
              <span>Shift End *</span>
              <input
                type="datetime-local"
                className="settings-input w-100"
                value={assignmentForm.shiftEnd}
                onChange={handleFormChange('shiftEnd')}
                min={assignmentForm.shiftStart}
                required
              />
            </label>

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

          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
            <button type="submit" className="report-generate-btn report-generate-btn--assign">
              {editingAssignmentId
                ? 'Save Re-assignment'
                : editingGroupId
                  ? 'Save Group Re-assignment'
                  : 'Assign Personnel'}
            </button>
            {(editingAssignmentId || editingGroupId) && (
              <button type="button" className="assignment-inline-btn" onClick={handleCancelEdit}>
                Cancel Re-assign
              </button>
            )}
            {assignMessage && <small className="report-feedback">{assignMessage}</small>}
          </div>
        </form>
      </div>

      <div className="widget-card slide-up overflow-auto no-scrollbar">
        <div className="assignment-list-header mb-3">
          <h3 className="widget-title mb-0">Assigned Deployment List</h3>
          <input
            type="search"
            className="settings-input assignment-list-search"
            value={deploymentSearch}
            onChange={(event) => setDeploymentSearch(event.target.value)}
            placeholder="Search barangay, street, or highway"
          />
        </div>

        {assignments.length === 0 ? (
          <p className="text-body-secondary mb-0 small">No deployment assignments yet.</p>
        ) : filteredGroupedAssignments.length === 0 ? (
          <p className="text-body-secondary mb-0 small">
            No deployment group matched "{deploymentSearch}".
          </p>
        ) : (
          <table className="personnel-table table align-middle mb-0">
            <thead>
              <tr className="assignment-group-table">
                <th>Assignment ID</th>
                <th>Personnel</th>
                <th>Patrol Area</th>
                <th>Shift Start</th>
                <th>Shift End</th>
                <th>Assigned At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroupedAssignments.map((group) => (
                <Fragment key={group.groupId}>
                  <tr className="assignment-group-row">
                    <td colSpan={6} className="assignment-group-cell">
                      <div className="assignment-group-content">
                        <strong className="assignment-group-label">{group.patrolArea}</strong>
                        <small className="assignment-group-meta">
                          {group.assignments.length} personnel assigned in this deployment group
                        </small>
                      </div>
                    </td>
                    <td className="assignment-group-actions-cell">
                      <div className="assignment-group-actions assignment-group-menu">
                        <button
                          type="button"
                          className="assignment-group-menu-trigger"
                          onClick={() => handleToggleGroupMenu(group.groupId)}
                          aria-expanded={openGroupMenuId === group.groupId}
                          aria-haspopup="menu"
                        >
                          Group Actions
                        </button>

                        {openGroupMenuId === group.groupId && (
                          <div className="assignment-group-menu-dropdown" role="menu">
                            <button
                              type="button"
                              className="assignment-group-edit-btn"
                              onClick={() => handleEditGroup(group.groupId)}
                            >
                              Re-assign Group
                            </button>
                            <button
                              type="button"
                              className="assignment-group-delete-btn"
                              onClick={() => handleRequestDeleteGroup(group)}
                            >
                              Delete Group
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {group.assignments.map((assignment) => (
                    <tr key={assignment.id} className="personnel-row">
                      <td className="personnel-badge">{assignment.id}</td>
                      <td>
                        <strong className="d-block assignment-personnel-name">{assignment.personnelName}</strong>
                        <small className="assignment-personnel-rank">{assignment.rank}</small>
                      </td>
                      <td>{assignment.patrolArea}</td>
                      <td>{assignment.shiftStart ? formatDateTime(assignment.shiftStart) : '-'}</td>
                      <td>{assignment.shiftEnd ? formatDateTime(assignment.shiftEnd) : '-'}</td>
                      <td>{formatDateTime(assignment.assignedAt)}</td>
                      <td className="assignment-table-actions">
                        <button
                          type="button"
                          className="assignment-edit-btn"
                          onClick={() => handleEditAssignment(assignment)}
                        >
                          Re-assign
                        </button>
                        <button
                          type="button"
                          className="assignment-delete-btn"
                          onClick={() => handleRequestDeleteAssignment(assignment)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={Boolean(pendingDeleteGroup)}
        title="Delete Deployment Group?"
        message={pendingDeleteGroup
          ? `Delete all ${pendingDeleteGroup.assignments.length} assignment(s) under ${pendingDeleteGroup.patrolArea}? This cannot be undone.`
          : ''}
        confirmLabel="Delete Group"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteGroup}
        onCancel={handleCancelDeleteGroup}
      />

      <ConfirmModal
        open={Boolean(pendingDeleteAssignment)}
        title="Delete Deployment Assignment?"
        message={pendingDeleteAssignment
          ? `Delete ${pendingDeleteAssignment.id} for ${pendingDeleteAssignment.personnelName}? This cannot be undone.`
          : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteAssignment}
        onCancel={handleCancelDeleteAssignment}
      />
    </div>
  )
}

export default AssignAreaPage
