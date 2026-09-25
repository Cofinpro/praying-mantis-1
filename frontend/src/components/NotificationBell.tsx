import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type NotificationList,
} from '../api/notifications'
import { queryKeys } from '../api/queryClient'
import { formatTimeAgo } from '../lib/datetime'
import styles from './NotificationBell.module.css'

// The bell and its dropdown. The list is a disclosure (a button that shows a panel of buttons), not an
// ARIA "menu": menus promise arrow-key navigation and typeahead, which a short list of links doesn't need.
export function NotificationBell() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Polling: refetch every 30 s while the page is open (plan.md → F4). TanStack pauses it in a
  // background tab and refetches when the window regains focus.
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: listNotifications,
    refetchInterval: 30_000,
  })
  const unread = notifications.data?.unread_count ?? 0
  const items = notifications.data?.items ?? []

  // Mark as read in the cache straight away (optimistic): it's harmless if the request fails, and the
  // next poll corrects it anyway.
  function markLocally(update: (n: Notification) => Notification, unreadCount: (old: NotificationList) => number) {
    queryClient.setQueryData<NotificationList>(queryKeys.notifications, (old) =>
      old ? { unread_count: unreadCount(old), items: old.items.map(update) } : old,
    )
  }
  const readOne = useMutation({
    mutationFn: (n: Notification) => markNotificationRead(n.id),
    onMutate: (n) =>
      markLocally(
        (item) => (item.id === n.id ? { ...item, read: true } : item),
        (old) => Math.max(0, old.unread_count - (n.read ? 0 : 1)),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  })
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => markLocally((item) => ({ ...item, read: true }), () => 0),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  })

  function close({ restoreFocus }: { restoreFocus: boolean }) {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  // While open: move focus into the panel, close on Escape (focus back to the bell) and on a click outside.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close({ restoreFocus: true })
    }
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) close({ restoreFocus: false })
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    // Listeners added in an effect are removed in its cleanup, or every open would stack another one.
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function openNotification(n: Notification) {
    if (!n.read) readOne.mutate(n)
    close({ restoreFocus: false })
    if (n.link) navigate(n.link)
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.bell}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close({ restoreFocus: false }) : setOpen(true))}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 8C5 6.67392 5.52678 5.40215 6.46447 4.46447C7.40215 3.52678 8.67392 3 10 3C11.3261 3 12.5979 3.52678 13.5355 4.46447C14.4732 5.40215 15 6.67392 15 8V11.5L16.5 14H3.5L5 11.5V8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 16.5C8 17.0304 8.21071 17.5391 8.58579 17.9142C8.96086 18.2893 9.46957 18.5 10 18.5C10.5304 18.5 11.0391 18.2893 11.4142 17.9142C11.7893 17.5391 12 17.0304 12 16.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 && (
          <span className={styles.count} aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} ref={panelRef} className={styles.panel} role="region" aria-label="Notifications" tabIndex={-1}>
          <div className={styles.header}>
            <h2 className={styles.title}>Notifications</h2>
            <button
              type="button"
              className={styles.markAll}
              onClick={() => readAll.mutate()}
              disabled={unread === 0}
            >
              Mark all as read
            </button>
          </div>
          {notifications.isError ? (
            <p className={styles.empty}>Couldn't load notifications.</p>
          ) : items.length === 0 ? (
            <p className={styles.empty}>{notifications.isPending ? 'Loading…' : "You're all caught up."}</p>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${n.read ? '' : styles.unread}`}
                    onClick={() => openNotification(n)}
                    // Spelled out, because the dot and bold text only show "unread" visually
                    aria-label={`${n.message}${n.read ? '' : ' (unread)'}, ${formatTimeAgo(n.created_at)}`}
                  >
                    {!n.read && <span className={styles.dot} aria-hidden="true" />}
                    <span className={styles.message}>{n.message}</span>
                    <span className={styles.time}>{formatTimeAgo(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
