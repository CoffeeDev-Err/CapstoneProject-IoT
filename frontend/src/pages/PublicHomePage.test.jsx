import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import PublicHomePage from './PublicHomePage'

afterEach(cleanup)

describe('public GeoSentri homepage', () => {
  it('presents indexable system information and a portal sign-in link', () => {
    render(<MemoryRouter><PublicHomePage /></MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Operational visibility for a safer Cabagan.')
    expect(screen.getByText(/secure web and mobile operations portal/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /sign in/i })[0]).toHaveAttribute('href', '/login')
    expect(screen.getByAltText('Philippine National Police seal')).toBeInTheDocument()
  })
})
