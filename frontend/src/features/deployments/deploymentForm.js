import { CABAGAN_BARANGAYS } from '../../constants/cabaganBarangays'

export const DEPLOYMENT_MODES = Object.freeze({ START_NOW: 'start_now', SCHEDULE_LATER: 'schedule_later' })
export const DEPLOYMENT_LIST_VIEWS = Object.freeze({ ACTIVE_NOW: 'active_now', SCHEDULED_LATER: 'scheduled_later' })

export const patrolAreas = [
  ...CABAGAN_BARANGAYS.map((barangay) => `Barangay ${barangay}`),
  'Cabagan Public Market Zone', 'Municipal Hall Perimeter', 'Barangay Centro Route',
  'Cabagan-Santa Maria Road', 'Cabagan-Tumauini Road', 'Maharlika Highway Northbound',
  'Maharlika Highway Southbound', 'National Highway Checkpoint North',
  'National Highway Checkpoint South', 'Highway Checkpoint North', 'Highway Checkpoint South',
  'School Safety Patrol Route', 'Bridge Approach Patrol Zone',
]

export const formatDateTime = (isoValue) => {
  if (!isoValue) return '-'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(isoValue))
}

export const toDateTimeLocalValue = (value) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''
  const year = parsedDate.getFullYear()
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
  const day = String(parsedDate.getDate()).padStart(2, '0')
  const hours = String(parsedDate.getHours()).padStart(2, '0')
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export const getCurrentDateTimeLocalValue = () => toDateTimeLocalValue(new Date().toISOString())
export const createEmptyAssignmentForm = () => ({
  mode: DEPLOYMENT_MODES.START_NOW, personnelIds: [], patrolArea: patrolAreas[0],
  shiftStart: getCurrentDateTimeLocalValue(), shiftEnd: '', notes: '',
})

export const formatDateTimePreview = (localValue) => {
  if (!localValue) return 'No date and time selected'
  const parsedDate = new Date(localValue)
  if (Number.isNaN(parsedDate.getTime())) return 'Invalid date and time'
  const date = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsedDate)
  const time = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true }).format(parsedDate)
  return `${date} • ${time}`
}

export const toIsoDateTime = (value) => {
  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString()
}
export const addHoursToLocalValue = (value, hours) => {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''
  parsedDate.setHours(parsedDate.getHours() + hours)
  return toDateTimeLocalValue(parsedDate.toISOString())
}
export const addMinutesToLocalValue = (value, minutes) => {
  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''
  parsedDate.setMinutes(parsedDate.getMinutes() + minutes)
  return toDateTimeLocalValue(parsedDate.toISOString())
}
export const toEditableShiftStart = (value) => {
  const currentValue = getCurrentDateTimeLocalValue()
  const requestedValue = toDateTimeLocalValue(value)
  return requestedValue && requestedValue >= currentValue ? requestedValue : currentValue
}
export const resolveGroupId = (assignment) => assignment.groupId || `${assignment.patrolArea}__${assignment.assignedAt || 'none'}`
export const createDeploymentId = (prefix) => {
  const uniquePart = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${uniquePart.toUpperCase()}`
}
export const getDeploymentMode = (assignment) => assignment.status === 'scheduled'
  ? DEPLOYMENT_MODES.SCHEDULE_LATER : DEPLOYMENT_MODES.START_NOW
export const formatDeploymentStatus = (status) => status
  ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : 'Active'
export const openDateTimePicker = (event) => {
  const input = event.currentTarget
  if (typeof input.showPicker !== 'function') return
  try { input.showPicker() } catch { input.focus() }
}
