import { NavLink } from 'react-router'
import styles from './NavItem.module.css'

type NavItemProps = {
  label: string
  to: string
  onClick?: () => void
}

// NavLink passes `isActive` to className, so the active style follows the URL (like router-link-active).
// It also matches child routes: /trainings/42 keeps "Trainings" active.
export function NavItem({ label, to, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
    >
      {label}
    </NavLink>
  )
}

type ExternalNavItemProps = {
  label: string
  href: string | null
}

export function ExternalNavItem({ label, href }: ExternalNavItemProps) {
  const arrow = <span aria-hidden="true">↗</span>

  if (href === null) {
    return (
      <span className={`${styles.item} ${styles.disabled}`} role="link" aria-disabled="true" title="Link coming soon">
        {label}
        {arrow}
        <span className="visually-hidden"> (coming soon)</span>
      </span>
    )
  }

  return (
    <a className={styles.item} href={href} target="_blank" rel="noreferrer">
      {label}
      {arrow}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  )
}
