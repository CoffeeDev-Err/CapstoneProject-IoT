import { describe, expect, it } from 'vitest'
import { getNotificationNavigationTarget } from './notificationNavigation'

describe('notification navigation', () => {
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
