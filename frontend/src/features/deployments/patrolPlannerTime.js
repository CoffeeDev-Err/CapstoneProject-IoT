export const weekFor = (date) => {
  const local = new Date(new Date(date).getTime() + 8 * 3600000)
  if (!Number.isFinite(local.getTime())) return ''
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7)
  return local.toISOString().slice(0, 10)
}
export const toPatrolLocalTime = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16)
export const patrolTime = value => new Date(`${value}:00+08:00`)
