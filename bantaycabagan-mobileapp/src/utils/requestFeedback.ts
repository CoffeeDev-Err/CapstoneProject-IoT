// Keep validation details, but distinguish a rejected request from an unconfirmed write.
export function requestErrorMessage(error: unknown, { action = 'complete this request', write = false, recovery = '' } = {}) {
  const detail = error && typeof error === 'object' ? error as { message?: unknown; status?: number; code?: string; name?: string; field?: string } : {}
  const message = typeof detail.message === 'string' ? detail.message.trim() : ''
  const generic = !message || /^(unable to complete the request\.?|internal server error\.?|request failed\.?|notification request failed\.?)$/i.test(message)
  const technical = /TypeError|SyntaxError|stack trace|ECONN|MongoServer|Cast to ObjectId|<html|<!doctype|fetch failed|failed to fetch|network request failed/i.test(message)
  if (detail.status === 401) return 'Your session has expired or is no longer valid. Sign in again to continue.'
  if (detail.status === 403) return generic || technical
    ? 'You do not have permission to perform this action. Contact your supervisor if you need access.'
    : message
  if (detail.status === 413 || detail.code === 'LIMIT_FILE_SIZE') return 'The selected file is too large. Choose a smaller file and try again.'
  if (detail.code === 'OTP_ATTEMPTS_EXCEEDED') return 'Too many incorrect attempts. Request a new code to continue.'
  if (detail.code === 'ACTIVE_BACKUP_REQUEST_EXISTS') return message
    || 'You already have an active backup request. Open Tasks to view or cancel it.'
  if (detail.code === 'REPORT_ALREADY_RESOLVED') return message
    || 'This incident has already been resolved. Open the report to view the recorded resolution.'
  if (detail.status === 429) return 'Too many requests. Wait a moment before trying again.'
  const connection = ['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_RESPONSE'].includes(detail.code || '')
    || detail.status === 0 || detail.status === 408 || detail.name === 'TypeError'
  if (write && (connection || (detail.status ?? 0) >= 500)) {
    return `Could not confirm the request to ${action}. ${recovery || 'Check your connection, then refresh the relevant record or list before trying again to avoid repeating an action that may already be saved.'}`
  }
  if (connection) return `Could not ${action}. Check your internet connection and try again.`
  if ((detail.status ?? 0) >= 500) return `Could not ${action} because the service is temporarily unavailable. Try again shortly. If it continues, contact your administrator.`
  if (detail.status === 404) return `The requested item is no longer available. Refresh the page or list and select it again.`
  if (detail.status === 409 && !detail.field && detail.code !== 'DUPLICATE_VALUE') {
    return `${generic || technical ? 'This action conflicts with the latest record.' : message} Refresh the record before trying again.`
  }
  if (!generic && !technical) return message
  return write ? `Could not ${action}. Check the details and try again.` : `Could not ${action}. Try refreshing the page or list.`
}
