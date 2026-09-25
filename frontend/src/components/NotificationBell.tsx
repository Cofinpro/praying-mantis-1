import styles from './NotificationBell.module.css'

type NotificationBellProps = {
  unreadCount?: number
}

// Static for now: the dropdown and polling come in FE-4.1.
export function NotificationBell({ unreadCount = 0 }: NotificationBellProps) {
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <button type="button" className={styles.bell} aria-label={label}>
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
      {unreadCount > 0 && (
        <span className={styles.count} aria-hidden="true">
          {unreadCount}
        </span>
      )}
    </button>
  )
}
