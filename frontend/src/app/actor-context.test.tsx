import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActorProvider, useActor } from './actor-context'
import { useUIStore } from './ui-store'

const mocks = vi.hoisted(() => ({
  mode: 'demo' as 'demo' | 'api',
  listUsers: vi.fn(),
}))
vi.mock('@/api', () => ({
  api: { listUsers: mocks.listUsers },
  get dataMode() {
    return mocks.mode
  },
}))

const users = [
  { id: 'first-user', display_name: 'Demo User 1' },
  { id: 'second-user', display_name: 'Demo User 2' },
]

function Probe() {
  const actor = useActor()
  return (
    <>
      <p role="status">{actor.actorId ?? 'No actor'}</p>
      <button onClick={() => actor.setActorId(null)}>Clear selection</button>
      <button onClick={() => actor.setActorId('second-user')}>Choose second user</button>
    </>
  )
}

function renderActor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ActorProvider>
        <Probe />
      </ActorProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.mode = 'demo'
  mocks.listUsers.mockReset().mockResolvedValue(users)
  useUIStore.setState({ selectedActorId: null, returnSnapshots: {} })
})

describe('demo actor initialization', () => {
  it('selects the first loaded demo user and allows an explicit later change', async () => {
    renderActor()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('first-user'))
    fireEvent.click(screen.getByRole('button', { name: 'Choose second user' }))
    expect(screen.getByRole('status')).toHaveTextContent('second-user')
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('status')).toHaveTextContent('No actor')
  })
  it('preserves a valid stored choice', async () => {
    useUIStore.setState({ selectedActorId: 'second-user' })
    renderActor()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('second-user'))
  })
  it('requires a deliberate selection in API mode', async () => {
    mocks.mode = 'api'
    renderActor()
    await waitFor(() => expect(mocks.listUsers).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('No actor')
    expect(useUIStore.getState().selectedActorId).toBeNull()
  })
})
