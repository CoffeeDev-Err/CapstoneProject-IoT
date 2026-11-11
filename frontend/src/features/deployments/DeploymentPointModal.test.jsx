import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeploymentPointModal from './DeploymentPointModal'
import { apiRequest } from '../../services/apiClient'

vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn() }))

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
  it('explains a missing barangay boundary instead of showing a fake radius', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Offline'))
    render(<DeploymentPointModal area={area} barangay="Centro" readOnly visible onClose={vi.fn()} />)
    expect(await screen.findByText(/Boundary unavailable. Reference location only/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Point label')).toBeNull()
    expect(screen.queryByText('Confirm point')).toBeNull()
  })
  it('retains a barangay search fallback when online place search is unavailable', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Offline'))
    render(<DeploymentPointModal area={area} visible onClose={vi.fn()} onConfirm={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Find a street, place or barangay'), { target: { value: 'Cubag' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('button', { name: /Barangay Cubag \(reference center/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Place search unavailable')
  })
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
