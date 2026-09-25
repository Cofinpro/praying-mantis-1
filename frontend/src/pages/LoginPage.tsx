import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { TextField } from '../components/TextField'
import styles from './LoginPage.module.css'

// The seed password only exists locally and in the mocks, so the hint isn't shown against a real backend.
const showSeedHint = import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS === 'true'

// Outside the Layout route, so it has no TopBar (as in Figma).
export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  // Controlled inputs: React state is the source of truth and each keystroke goes through onChange,
  // where Vue would use v-model.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<{ title: string; hint: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/trainings" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop the browser's own form submit (a full page load), like @submit.prevent in Vue.
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/trainings', { replace: true })
    } catch (err) {
      setError(loginErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Logo />
        <div className={styles.heading}>
          <h1 className={styles.title}>Log in</h1>
          <p className={styles.subtitle}>Book trainings and reserve your seat in the office.</p>
        </div>
        {error && <Alert title={error.title}>{error.hint}</Alert>}
        <form className={styles.form} onSubmit={handleSubmit}>
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            help={error ? undefined : 'Use your company email'}
            invalid={error !== null}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={error !== null}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        {showSeedHint && <p className={styles.hint}>Local seed users: password123</p>}
      </div>
    </main>
  )
}

function loginErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    const title = typeof err.detail === 'string' ? err.detail : `The server answered with an error (${err.status})`
    return { title, hint: 'Check your details and try again.' }
  }
  // fetch() itself failed: offline, blocked by the browser, or the server is down or still waking up
  return { title: "Can't reach the server", hint: 'Check your connection and try again in a moment.' }
}
