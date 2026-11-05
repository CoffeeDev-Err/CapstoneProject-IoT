import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useDeploymentForm } from './useDeploymentForm'
import { deploymentDetailsFrom } from './deploymentForm'
afterEach(cleanup)
it('requires Walk/Car/Motorcycle only for route patrol and retains the chosen mode when editing', () => {
  const { result } = renderHook(() => useDeploymentForm({ personnelOptions: [{ id: 'P-1' }], isDeploymentsLoading: false, isInitialDataLoading: false }))
  act(() => result.current.setAssignmentForm(form => ({ ...form, personnelIds: ['P-1'], deploymentType: 'route',
    patrolArea: 'Cabagan Santa Maria Road', shiftStart: new Date(Date.now() + 3600_000).toISOString(), shiftEnd: new Date(Date.now() + 7200_000).toISOString() })))
  expect(result.current.deploymentFormState.canSubmit).toBe(false)
  expect(result.current.deploymentBlockingReasons).toContain('Choose Walk, Car, or Motorcycle Patrol.')
  for (const patrolMode of ['walk', 'car', 'motorcycle']) {
    act(() => result.current.setAssignmentForm(form => ({ ...form, patrolMode })))
    expect(result.current.deploymentFormState.canSubmit).toBe(true)
  }
  act(() => result.current.setAssignmentForm(form => ({ ...form, deploymentType: 'area', patrolMode: '' })))
  expect(result.current.deploymentFormState.canSubmit).toBe(true)
  expect(deploymentDetailsFrom({ deploymentType: 'route', patrolMode: 'motorcycle' }).patrolMode).toBe('motorcycle')
  expect(deploymentDetailsFrom({ deploymentType: 'route' }).patrolMode).toBe('')
})
