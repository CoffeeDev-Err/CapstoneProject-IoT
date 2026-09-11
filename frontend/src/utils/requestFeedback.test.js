import { describe, it, expect } from 'vitest'
import { requestErrorMessage } from './requestFeedback'

describe('actionable request feedback', () => {
  it('distinguishes an unconfirmed write from a failed read', () => {
    const error = { status: 408, code: 'REQUEST_TIMEOUT' }
    expect(requestErrorMessage(error, { action: 'save deployment changes', write: true })).toMatch(/Could not confirm.*refresh/i)
    expect(requestErrorMessage(error, { action: 'load reports' })).toMatch(/internet connection/)
    expect(requestErrorMessage({ status: 503 }, { action: 'request backup', write: true })).toMatch(/may already be saved/)
  })
  it('preserves specific validation and permission details', () => {
    expect(requestErrorMessage({ status: 422, message: 'Select a barangay.' })).toBe('Select a barangay.')
    expect(requestErrorMessage({ status: 409, code: 'DUPLICATE_VALUE', field: 'email', message: 'Email is already in use.' })).toBe('Email is already in use.')
    expect(requestErrorMessage({ status: 403, message: 'Only the reporting officer can resolve this incident.' })).toMatch(/^Only the reporting officer/)
    expect(requestErrorMessage({ status: 409, message: 'The response team is already full.' })).toMatch(/already full.*Refresh/)
    expect(requestErrorMessage({ status: 400, field: 'title', message: 'Report title is required.' })).toBe('Report title is required.')
    expect(requestErrorMessage({ status: 409, code: 'ACTIVE_BACKUP_REQUEST_EXISTS', message: 'You already have an active backup request. Open Tasks to view or cancel it.' })).toBe('You already have an active backup request. Open Tasks to view or cancel it.')
  })
  it('gives recovery steps for session, upload, and rate errors', () => {
    expect(requestErrorMessage({ status: 401 })).toMatch(/Sign in again/)
    expect(requestErrorMessage({ status: 413 })).toMatch(/smaller file/)
    expect(requestErrorMessage({ status: 429 })).toMatch(/Wait a moment/)
    expect(requestErrorMessage({ status: 404 })).toMatch(/select it again/)
  })
  it('handles absent errors and avoids displaying technical server failures', () => {
    expect(requestErrorMessage(undefined, { action: 'load accounts' })).toMatch(/Could not load accounts/)
    expect(requestErrorMessage({ message: 'MongoServerError: private details' })).not.toContain('private details')
    expect(requestErrorMessage({ status: 500, message: 'private details' })).not.toContain('private details')
  })
})
