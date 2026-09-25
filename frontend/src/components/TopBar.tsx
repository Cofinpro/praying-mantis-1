import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { externalNavLinks, internalNavLinks, placeholderUser } from '../config/navigation'
import { Avatar } from './Avatar'
import { ExternalNavItem, NavItem } from './NavItem'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import styles from './TopBar.module.css'

export function TopBar() {
  const { pathname } = useLocation()
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
          <Avatar name={placeholderUser.name} />
          <span className={styles.userName}>{placeholderUser.name}</span>
        </Link>
        <button
          type="button"
          className={styles.menuButton}
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
