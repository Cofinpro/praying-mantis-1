import { Link } from 'react-router'
import { Logo } from '../components/Logo'
import styles from './LoginPage.module.css'

// Outside the Layout route, so it has no TopBar (as in Figma).
export function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Logo />
        <div className={styles.heading}>
          <h1 className={styles.title}>Log in</h1>
          <p className={styles.subtitle}>Book trainings and reserve your seat in the office.</p>
        </div>
        <p>The login form comes in FE-1.1.</p>
        <Link to="/trainings">Continue to the app</Link>
      </div>
    </main>
  )
}
