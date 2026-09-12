const text = (value) => String(value || '').trim()

export const getNotificationNavigationTarget = (notification = {}) => {
  const data = notification.data && typeof notification.data === 'object'
    ? notification.data
    : {}
  const referenceType = text(notification.referenceType).toLowerCase()
  const referenceId = text(notification.referenceId)

  if (referenceType === 'report') {
    const reportId = text(data.reportId) || referenceId
    return reportId ? { pathname: '/reports', state: { reportId } } : { pathname: '/reports' }
  }

  if (referenceType === 'task') {
    const taskId = text(data.taskId) || referenceId
    return {
      pathname: '/',
      state: {
        taskId: taskId || undefined,
        locatePersonnelId: text(data.personnelId) || undefined,
      },
    }
  }

  if (referenceType === 'personnel' || referenceType === 'geofence') {
    const personnelId = text(data.personnelId)
      || (referenceType === 'personnel' ? referenceId : '')
    return personnelId
      ? { pathname: '/', state: { locatePersonnelId: personnelId } }
      : { pathname: '/' }
  }

  if (referenceType === 'deployment') {
    const deploymentId = text(data.assignmentId) || referenceId
    return {
      pathname: '/deployments',
      state: { deploymentId: deploymentId || undefined },
    }
  }

  if (referenceType === 'user') return { pathname: '/personnel' }
  return null
}
