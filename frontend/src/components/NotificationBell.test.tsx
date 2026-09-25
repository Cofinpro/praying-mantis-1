import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Notification, NotificationList } from '../api/notifications'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

const recent = new Date(Date.now() - 5 * 60_000).toISOString()
const notifications: Notification[] = [
  { id: 1, type: 'enrollment_approved', message: 'Your request for React Basics was approved', link: '/trainings/12', read: false, created_at: recent },
  { id: 2, type: 'enrollment_requested', message: 'Marta asked to join SQL', link: '/approvals', read: false, created_at: recent },
  { id: 3, type: 'training_changed', message: 'Git moved to a new time', link: '/trainings/7', read: true, created_at: recent },
]

// A stateful notifications backend that counts GETs and records reads.
function serveNotifications(initial = notifications) {
  let items = initial.map((n) => ({ ...n }))
  const calls = { list: 0, read: [] as number[], readAll: 0 }
  const body = (): NotificationList => ({ unread_count: items.filter((n) => !n.read).length, items })
  server.use(
    http.get('*/api/notifications', () => {
      calls.list += 1
      return HttpResponse.json(body())
    }),
    http.post('*/api/notifications/read-all', () => {
      calls.readAll += 1
      items = items.map((n) => ({ ...n, read: true }))
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/notifications/:id/read', ({ params }) => {
      calls.read.push(Number(params.id))
      items = items.map((n) => (n.id === Number(params.id) ? { ...n, read: true } : n))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

async function renderLoggedIn() {
  await storeLoginToken('joao@cofinpro.pt')
  return renderRoute('/trainings')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('notification bell', () => {
  it('shows the unread count', async () => {
    serveNotifications()
    await renderLoggedIn()

    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('polls every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const calls = serveNotifications()
    await renderLoggedIn()
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    const before = calls.list

    await act(() => vi.advanceTimersByTimeAsync(30_000))

    await waitFor(() => expect(calls.list).toBe(before + 1))
  })

  it('lists the latest notifications, moves focus into the list, and Escape closes it', async () => {
    serveNotifications()
    const user = userEvent.setup()
    await renderLoggedIn()
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })

    await user.click(bell)
    const panel = screen.getByRole('region', { name: 'Notifications' })
    expect(panel).toHaveFocus()
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
    expect(within(panel).getByRole('button', { name: /Your request for React Basics was approved \(unread\)/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(bell).toHaveFocus()
  })

  it('clicking one marks it read and opens its link', async () => {
    const calls = serveNotifications()
    const user = userEvent.setup()
    const { router } = await renderLoggedIn()

    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.click(screen.getByRole('button', { name: /Your request for React Basics was approved/ }))

    expect(router.state.location.pathname).toBe('/trainings/12')
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
    expect(calls.read).toEqual([1])
  })

  it('"Mark all as read" clears the count', async () => {
    const calls = serveNotifications()
    const user = userEvent.setup()
    await renderLoggedIn()

    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }))

    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(calls.readAll).toBe(1)
  })

  it('closes when clicking outside', async () => {
    serveNotifications()
    const user = userEvent.setup()
    await renderLoggedIn()

    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.click(screen.getByRole('heading', { name: 'Trainings' }))

    expect(screen.queryByRole('region', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('closes the phone menu when it opens, so the two panels never stack', async () => {
    serveNotifications()
    const user = userEvent.setup()
    await renderLoggedIn()
    const menu = await screen.findByRole('button', { name: 'Menu' })

    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }))

    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument()
  })
})
