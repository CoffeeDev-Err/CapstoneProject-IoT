export const mergeNotifications = (current, history, limit) => {
  const byId = new Map()
  current.forEach((notification) => byId.set(notification.id, notification))
  history.forEach((notification) => {
    if (!byId.has(notification.id)) byId.set(notification.id, notification)
  })
  return [...byId.values()]
    .sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime())
    .slice(0, limit)
}

export const mergeReports = (reports, updates) => {
  if (!Array.isArray(updates) || updates.length === 0) return reports
  const byId = new Map(reports.map((report) => [report.id, report]))
  updates.forEach((update) => {
    const reportId = update.report_id || update.id
    if (!reportId) return
    byId.set(reportId, { ...(byId.get(reportId) || {}), ...update, id: reportId })
  })
  return [...byId.values()]
}

export const upsertTask = (tasks, incoming) => {
  if (!incoming?.id) return tasks
  return tasks.some((task) => task.id === incoming.id)
    ? tasks.map((task) => task.id === incoming.id ? { ...task, ...incoming } : task)
    : [incoming, ...tasks]
}

export const evaluateGeofenceTransition = (personnel, previousOutsideIds = new Set()) => {
  const outsidePersonnel = personnel.filter((member) => (
    member.isVisibleOnMap !== false && member.isInsideCabagan === false
  ))
  const outsideIds = new Set(outsidePersonnel.map((member) => member.id))
  return {
    outsidePersonnel,
    outsideIds,
    newlyOutside: outsidePersonnel.filter((member) => !previousOutsideIds.has(member.id)),
    hasRecovered: outsidePersonnel.length === 0 && previousOutsideIds.size > 0,
  }
}
