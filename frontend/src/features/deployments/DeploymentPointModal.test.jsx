import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeploymentPointModal from './DeploymentPointModal'

vi.mock('maplibre-gl', () => ({
  AttributionControl: vi.fn(),
  Map: vi.fn(),
  Marker: vi.fn(),
  NavigationControl: vi.fn(),
  setWorkerUrl: vi.fn(),
}))

vi.mock('../../services/mapTilerWeb', () => ({
  getMapTilerWebStyleUrl: vi.fn(),
  hasMapTilerWebApiKey: false,
}))

const area = {
  category: 'zone',
  coverageBarangays: ['CENTRO'],
  name: 'Cabagan Public Market Zone',
  referenceCenter: { latitude: 17.427, longitude: 121.768 },
}

afterEach(cleanup)

describe('DeploymentPointModal', () => {
  it('keeps the point-label input focused when its parent rerenders', () => {
    const props = {
      area,
      initialPoint: null,
      onConfirm: vi.fn(),
      visible: true,
    }
    const { rerender } = render(<DeploymentPointModal {...props} onClose={() => {}} />)
    const input = screen.getByLabelText('Point label')

    input.focus()
    fireEvent.change(input, { target: { value: 'Public market entrance' } })
    rerender(<DeploymentPointModal {...props} onClose={() => {}} />)

    expect(input).toHaveValue('Public market entrance')
    expect(input).toHaveFocus()
  })
})
