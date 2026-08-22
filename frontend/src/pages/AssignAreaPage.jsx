import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmModal from '../components/ConfirmModal'
import { SkeletonBlock, TableSkeletonRows } from '../components/LoadingSkeleton'
import { CABAGAN_BARANGAYS } from '../constants/cabaganBarangays'
import { useFeedback } from '../context/useFeedback'
import { usePersonnelContext } from '../context/usePersonnelContext'
import { getManageableDeployments, replaceDeployments } from '../services/operations'
import { matchesPrefixSearch } from '../utils/searchMatching'
import { getDeploymentEditCancelledMessage } from '../utils/workflowFeedback'

const DEPLOYMENT_MODES = {
  START_NOW: 'start_now',
  SCHEDULE_LATER: 'schedule_later',
}

const DEPLOYMENT_LIST_VIEWS = {
  ACTIVE_NOW: 'active_now',
  SCHEDULED_LATER: 'scheduled_later',
}

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
  mode: DEPLOYMENT_MODES.START_NOW,
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

const formatDateTimePreview = (localValue) => {
  if (!localValue) {
    return 'No date and time selected'
  }

  const parsedDate = new Date(localValue)
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Invalid date and time'
  }

  const date = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
  const time = new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsedDate)

  return `${date} • ${time}`
}

const toIsoDateTime = (value) => {
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString()
}

const addHoursToLocalValue = (value, hours) => {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''
  parsedDate.setHours(parsedDate.getHours() + hours)
  return toDateTimeLocalValue(parsedDate.toISOString())
}

const addMinutesToLocalValue = (value, minutes) => {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''
  parsedDate.setMinutes(parsedDate.getMinutes() + minutes)
  return toDateTimeLocalValue(parsedDate.toISOString())
}

const toEditableShiftStart = (value) => {
  const currentValue = getCurrentDateTimeLocalValue()
  const requestedValue = toDateTimeLocalValue(value)
  return requestedValue && requestedValue >= currentValue ? requestedValue : currentValue
}

const resolveGroupId = (assignment) => assignment.groupId || `${assignment.patrolArea}__${assignment.assignedAt || 'none'}`

const createDeploymentId = (prefix) => {
  const uniquePart = globalThis.crypto?.randomUUID?.().slice(0, 8)
    || Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${uniquePart.toUpperCase()}`
}

const getDeploymentMode = (assignment) => (
  assignment.status === 'scheduled'
    ? DEPLOYMENT_MODES.SCHEDULE_LATER
    : DEPLOYMENT_MODES.START_NOW
)

const formatDeploymentStatus = (status) => (
  status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : 'Active'
)

const openDateTimePicker = (event) => {
  const input = event.currentTarget
  if (typeof input.showPicker !== 'function') return

  try {
    input.showPicker()
  } catch {
    input.focus()
  }
}

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
    if (Array.isArray(personnel) && personnel.length > 0) {
      return personnel.map((member) => ({
        id: member.id,
        name: member.name,
        rank: member.rank,
      }))
    }

    return []
  }, [personnel])

  const [assignmentForm, setAssignmentForm] = useState(() => {
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
  })
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
  const [deploymentSearch, setDeploymentSearch] = useState('')
  const deferredDeploymentSearch = useDeferredValue(deploymentSearch)
  const [activeDeploymentView, setActiveDeploymentView] = useState(DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)
  const [openGroupMenuId, setOpenGroupMenuId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeploymentsLoading, setIsDeploymentsLoading] = useState(true)
  const [minimumShiftDateTime, setMinimumShiftDateTime] = useState(getCurrentDateTimeLocalValue)
  const minimumSelectableShiftStart = assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER
    ? addMinutesToLocalValue(minimumShiftDateTime, 1)
    : minimumShiftDateTime
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

  useEffect(() => {
    if (listOnly || !location.state) return
    if (requestedAssignment) {
      showFeedback(`Re-assigning ${requestedAssignment.id}. Update the details, then save.`, { type: 'info' })
    } else if (requestedGroupFirstAssignment) {
      showFeedback(`Re-assigning the group in ${requestedGroupFirstAssignment.patrolArea}. Update the details, then save.`, { type: 'info' })
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

  const activePersonnelIds = assignmentForm.personnelIds.filter((id) =>
    personnelOptions.some((item) => item.id === id)
  )

  const selectedPersonnelMembers = personnelOptions.filter((item) =>
    activePersonnelIds.includes(item.id)
  )

  const formShiftStart = new Date(assignmentForm.shiftStart)
  const formShiftEnd = new Date(assignmentForm.shiftEnd)
  const hasValidShiftStart = !Number.isNaN(formShiftStart.getTime())
    && formShiftStart >= new Date(minimumSelectableShiftStart)
  const hasValidShiftEnd = !Number.isNaN(formShiftEnd.getTime()) && formShiftEnd > formShiftStart
  const isWithinMaximumDuration = hasValidShiftStart && hasValidShiftEnd
    && formShiftEnd.getTime() - formShiftStart.getTime() <= 24 * 60 * 60 * 1000
  const deploymentFormState = {
    canSubmit: !isDeploymentsLoading
      && selectedPersonnelMembers.length > 0
      && Boolean(assignmentForm.patrolArea.trim())
      && hasValidShiftStart
      && hasValidShiftEnd
      && isWithinMaximumDuration
      && (!editingAssignmentId || selectedPersonnelMembers.length === 1),
    maximumShiftEnd: assignmentForm.shiftStart
      ? addHoursToLocalValue(assignmentForm.shiftStart, 24)
      : '',
    minimumShiftEnd: assignmentForm.shiftStart > minimumSelectableShiftStart
      ? assignmentForm.shiftStart
      : minimumSelectableShiftStart,
  }

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
    const query = deferredDeploymentSearch.trim().toLowerCase()

    if (!query) {
      return groupedAssignments
    }

    return groupedAssignments.flatMap((group) => {
      if (matchesPrefixSearch(query, [group.patrolArea])) return [group]

      const matchingAssignments = group.assignments.filter((assignment) => (
        matchesPrefixSearch(query, [
        assignment.id,
        assignment.personnelName,
        assignment.rank,
        assignment.status,
        ])
      ))

      return matchingAssignments.length > 0
        ? [{ ...group, assignments: matchingAssignments }]
        : []
    })
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

  const handleFormChange = (field) => (event) => {
    setAssignmentForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }))
  }

  const handleModeChange = (mode) => {
    setAssignmentForm((prev) => ({
      ...prev,
      mode,
      shiftStart: mode === DEPLOYMENT_MODES.START_NOW
        ? getCurrentDateTimeLocalValue()
        : '',
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
    showFeedback(`Re-assigning ${assignment.id}. Update details, then save.`, { type: 'info' })
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
    showFeedback(`Re-assigning the group in ${firstAssignment.patrolArea}. Update details, then save.`, { type: 'info' })
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
          <fieldset className="assignment-mode-selector mb-3" disabled={isSaving}>
            <legend>Deployment Timing</legend>
            <div
              className="assignment-mode-options smooth-underline-control"
              style={{ '--smooth-underline-left': assignmentForm.mode === DEPLOYMENT_MODES.START_NOW ? '25%' : '75%' }}
            >
              <label className={`assignment-mode-option${assignmentForm.mode === DEPLOYMENT_MODES.START_NOW ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="deployment-mode"
                  value={DEPLOYMENT_MODES.START_NOW}
                  checked={assignmentForm.mode === DEPLOYMENT_MODES.START_NOW}
                  onChange={() => handleModeChange(DEPLOYMENT_MODES.START_NOW)}
                />
                <span>
                  <strong>Start Now</strong>
                  <small>Begin using the current date and time.</small>
                </span>
              </label>
              <label className={`assignment-mode-option${assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="deployment-mode"
                  value={DEPLOYMENT_MODES.SCHEDULE_LATER}
                  checked={assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER}
                  onChange={() => handleModeChange(DEPLOYMENT_MODES.SCHEDULE_LATER)}
                />
                <span>
                  <strong>Schedule for Later</strong>
                  <small>Keep personnel Off Duty until the future shift begins.</small>
                </span>
              </label>
            </div>
            <div
              className={`assignment-mode-status assignment-mode-status--${assignmentForm.mode === DEPLOYMENT_MODES.START_NOW ? 'start' : 'scheduled'}`}
              aria-live="polite"
            >
              <span className="assignment-mode-status__dot" aria-hidden="true" />
              <span>
                <strong>{assignmentForm.mode === DEPLOYMENT_MODES.START_NOW ? 'Start Now' : 'Schedule for Later'}</strong>
                {' → '}
                {assignmentForm.mode === DEPLOYMENT_MODES.START_NOW
                  ? 'Personnel becomes On Duty immediately.'
                  : 'Personnel remains Off Duty until shift start.'}
              </span>
            </div>
          </fieldset>

          <div className="assignment-grid mb-3">
            <label className="assignment-field assignment-field--area">
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

            <label className="assignment-field assignment-field--start">
              <span>{assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER ? 'Scheduled Start *' : 'Shift Start *'}</span>
              <input
                type="datetime-local"
                className="settings-input w-100 assignment-datetime-input"
                value={assignmentForm.shiftStart}
                onChange={handleFormChange('shiftStart')}
                onClick={openDateTimePicker}
                min={minimumSelectableShiftStart}
                step="60"
                aria-label={assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER
                  ? 'Scheduled deployment start date and time'
                  : 'Deployment shift start date and time'}
                title="Click anywhere in this field to open the date and time picker"
                required
              />
              <small className="assignment-field__datetime-preview">
                {formatDateTimePreview(assignmentForm.shiftStart)}
              </small>
              <small className="assignment-field__hint">
                {assignmentForm.mode === DEPLOYMENT_MODES.START_NOW
                  ? 'Defaults to now. Click anywhere in the field to adjust it.'
                  : 'Choose a future date and time; past options are unavailable.'}
              </small>
            </label>

            <label className="assignment-field assignment-field--end">
              <span>Shift End *</span>
              <input
                type="datetime-local"
                className="settings-input w-100 assignment-datetime-input"
                value={assignmentForm.shiftEnd}
                onChange={handleFormChange('shiftEnd')}
                onClick={openDateTimePicker}
                min={deploymentFormState.minimumShiftEnd}
                max={deploymentFormState.maximumShiftEnd}
                step="60"
                aria-label="Deployment shift end date and time"
                title="Click anywhere in this field to open the date and time picker"
                required
              />
              <small className="assignment-field__datetime-preview">
                {formatDateTimePreview(assignmentForm.shiftEnd)}
              </small>
              <small className="assignment-field__hint">
                Click anywhere in the field to choose an end time, up to 24 hours after shift start.
              </small>
            </label>

            <div className="assignment-field assignment-field--personnel">
              <span>Personnel (Checkbox)</span>
              <input
                type="search"
                className="settings-input w-100 assignment-search-input"
                value={personnelSearch}
                onChange={(event) => setPersonnelSearch(event.target.value)}
                placeholder="Search personnel name or rank"
                disabled={isInitialDataLoading}
              />

              <div className="assignment-checklist no-scrollbar">
                {isInitialDataLoading ? (
                  Array.from({ length: 4 }, (_, index) => (
                    <SkeletonBlock key={index} width={`${78 + (index % 3) * 7}%`} height="2.25rem" />
                  ))
                ) : filteredPersonnelOptions.length === 0 ? (
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
                  disabled={isInitialDataLoading || filteredPersonnelOptions.length === 0}
                >
                  {areAllFilteredSelected ? 'Clear Filtered' : 'Select All Filtered'}
                </button>
              </div>
            </div>

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
              disabled={isSaving || !deploymentFormState.canSubmit}
            >
              {isSaving
                ? 'Saving...'
                : editingAssignmentId
                  ? 'Save Re-assignment'
                  : editingGroupId
                    ? 'Save Group Re-assignment'
                    : assignmentForm.mode === DEPLOYMENT_MODES.SCHEDULE_LATER
                      ? 'Schedule Deployment'
                      : 'Start Deployment'}
            </button>
            {(editingAssignmentId || editingGroupId) && (
              <button type="button" className="assignment-inline-btn" onClick={handleCancelEdit}>
                Cancel Re-assign
              </button>
            )}
          </div>
        </form>
      </div>
      )}

      {listOnly && (
      <div className="widget-card deployment-list-card slide-up overflow-auto no-scrollbar">
        <div className="assignment-list-header mb-3">
          <h3 className="widget-title mb-0">Assigned Deployment List</h3>
          <input
            type="search"
            className="settings-input assignment-list-search"
            value={deploymentSearch}
            onChange={(event) => setDeploymentSearch(event.target.value)}
            placeholder="Search personnel name, rank, barangay, or assignment ID"
          />
        </div>

        <div
          className="deployment-view-nav smooth-underline-control mb-3"
          role="tablist"
          aria-label="Deployment list views"
          style={{ '--smooth-underline-left': activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW ? '25%' : '75%' }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW}
            aria-controls="deployment-list-panel"
            className={`deployment-view-tab${activeDeploymentView === DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW ? ' deployment-view-tab--active' : ''}`}
            onClick={() => {
              setActiveDeploymentView(DEPLOYMENT_LIST_VIEWS.ACTIVE_NOW)
              setOpenGroupMenuId(null)
            }}
          >
            Active Now
            <span className="deployment-view-count">{deploymentViewCounts.active}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER}
            aria-controls="deployment-list-panel"
            className={`deployment-view-tab${activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER ? ' deployment-view-tab--active' : ''}`}
            onClick={() => {
              setActiveDeploymentView(DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER)
              setOpenGroupMenuId(null)
            }}
          >
            Scheduled Later
            <span className="deployment-view-count">{deploymentViewCounts.scheduled}</span>
          </button>
        </div>

        <div id="deployment-list-panel" role="tabpanel" className="deployment-list-panel">
          {isDeploymentsLoading ? (
            <table className="personnel-table assignment-list-table table align-middle mb-0" aria-busy="true">
              <thead>
                <tr className="assignment-group-table">
                  <th>Assignment ID</th>
                  <th>Personnel</th>
                  <th>Patrol Area</th>
                  <th>Shift Start</th>
                  <th>Shift End</th>
                  <th>Status</th>
                  <th>Assigned At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeletonRows columns={8} rows={5} label="Loading deployments" />
              </tbody>
            </table>
          ) : assignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">No deployment assignments yet.</p>
          ) : visibleAssignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">
              {activeDeploymentView === DEPLOYMENT_LIST_VIEWS.SCHEDULED_LATER
                ? 'No deployments are scheduled for later.'
                : 'No deployments are active now.'}
            </p>
          ) : filteredGroupedAssignments.length === 0 ? (
            <p className="text-body-secondary mb-0 small">
              No deployment group matched "{deploymentSearch}".
            </p>
          ) : (
            <table className="personnel-table assignment-list-table table align-middle mb-0">
            <thead>
              <tr className="assignment-group-table">
                <th>Assignment ID</th>
                <th>Personnel</th>
                <th>Patrol Area</th>
                <th>Shift Start</th>
                <th>Shift End</th>
                <th>Status</th>
                <th>Assigned At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroupedAssignments.map((group) => (
                <Fragment key={group.groupId}>
                  <tr className="assignment-group-row">
                    <td colSpan={7} className="assignment-group-cell">
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
                      <td>
                        <span className={`deployment-status deployment-status--${assignment.status || 'active'}`}>
                          {formatDeploymentStatus(assignment.status)}
                        </span>
                      </td>
                      <td>{formatDateTime(assignment.assignedAt)}</td>
                      <td className="assignment-actions-cell">
                        <div className="assignment-table-actions">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            </table>
          )}
        </div>
      </div>
      )}

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
