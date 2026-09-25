import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { externalNavLinks, internalNavLinks } from '../config/navigation'
import { Avatar } from './Avatar'
import { ExternalNavItem, NavItem } from './NavItem'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import styles from './TopBar.module.css'

export function TopBar() {
  const { pathname } = useLocation()
  // Only rendered inside <RequireAuth>, so there is always a user.
  const { user, logout } = useAuth()
  const name = user?.name ?? ''
  // The phone menu remembers the page it was opened on, so it closes by itself after any navigation
  // (nav link, logo or profile) without an effect that resets state.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null)
  const menuOpen = menuOpenedAt === pathname

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link to="/trainings" className={styles.home}>
          <Logo />
        </Link>
        <nav id="main-nav" aria-label="Main" className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`}>
          {internalNavLinks.map((link) => (
            <NavItem key={link.to} label={link.label} to={link.to} />
          ))}
          {externalNavLinks.map((link) => (
            <ExternalNavItem key={link.label} label={link.label} href={link.href} />
          ))}
        </nav>
      </div>

      <div className={styles.right}>
        <NotificationBell />
        <Link to="/profile" className={styles.user}>
          <Avatar name={name} />
          <span className={styles.userName}>{name}</span>
        </Link>
        {/* Not in Figma, which has no logout control. An icon button like the bell keeps the bar unchanged. */}
        <button type="button" className={styles.iconButton} onClick={logout} title="Log out">
          <span className="visually-hidden">Log out</span>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M8 3H5C4.44772 3 4 3.44772 4 4V16C4 16.5523 4.44772 17 5 17H8M13 6L17 10M17 10L13 14M17 10H8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.menuButton}`}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpenedAt(menuOpen ? null : pathname)}
        >
          <span className="visually-hidden">Menu</span>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  )
}
