import { Link } from 'react-router'
import styles from './BackLink.module.css'

// "← All trainings" above a page title, as in Figma.
export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={styles.back}>
      <span aria-hidden="true">←</span> {children}
    </Link>
  )
}
