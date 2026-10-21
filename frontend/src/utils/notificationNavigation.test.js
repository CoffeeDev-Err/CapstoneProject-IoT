import { describe, expect, it } from 'vitest'
import { getNotificationDisplayMessage, getNotificationNavigationTarget } from './notificationNavigation'

describe('notification navigation', () => {
  it('uses a readable fallback for old backup alerts without changing their map target', () => {
    const notification = {
      type: 'emergency', referenceType: 'task', referenceId: 'TSK-OLD',
      message: 'Backup requested by Mon Maguas at GPS 17.42831, 121.77042.',
      data: { taskId: 'TSK-OLD', personnelId: 'PNP-ONE', latitude: 17.42831, longitude: 121.77042 },
    }
    expect(getNotificationDisplayMessage(notification))
      .toBe('Backup requested by Mon Maguas at the current GPS position.')
    expect(getNotificationNavigationTarget(notification).state.taskId).toBe('TSK-OLD')
    expect(getNotificationDisplayMessage({ ...notification, type: 'info' })).toBe(notification.message)
  })
  it('opens the exact report from its stored reference', () => {
    expect(getNotificationNavigationTarget({ referenceType: 'report', referenceId: 'RPT-ONE' }))
      .toEqual({ pathname: '/reports', state: { reportId: 'RPT-ONE' } })
  })

  it('opens backup requests on the map with their task and requester', () => {
    expect(getNotificationNavigationTarget({
      referenceType: 'task',
      referenceId: 'TSK-ONE',
      data: { personnelId: 'PNP-ONE' },
    })).toEqual({
      pathname: '/',
      state: { taskId: 'TSK-ONE', locatePersonnelId: 'PNP-ONE' },
    })
  })

  it('focuses personnel alerts and finds deployment records', () => {
    expect(getNotificationNavigationTarget({ referenceType: 'personnel', referenceId: 'PNP-ONE' }))
      .toEqual({ pathname: '/', state: { locatePersonnelId: 'PNP-ONE' } })
    expect(getNotificationNavigationTarget({ referenceType: 'deployment', referenceId: 'DEP-ONE' }))
      .toEqual({ pathname: '/deployments', state: { deploymentId: 'DEP-ONE' } })
  })

  it('leaves informational notices without a false destination', () => {
    expect(getNotificationNavigationTarget({ type: 'info', title: 'System update' })).toBeNull()
  })
})
