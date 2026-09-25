import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { changePassword } from '../api/auth'
import { apiFieldErrors } from '../users/fieldErrors'
import { Button } from './Button'
import styles from './ChangePassword.module.css'
import { TextField } from './TextField'

// Profile → "Change password": current, new, and the new one again.
export function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const change = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setRepeat('')
    },
    onError: (error) => {
      const { fields, general } = apiFieldErrors(error)
      setErrors(general ? { new_password: general } : fields)
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    change.reset()
    const found: Record<string, string> = {}
    if (!current) found.current_password = 'Enter your current password'
    if (next.length < 8) found.new_password = 'Use at least 8 characters'
    else if (repeat !== next) found.repeat = "The two new passwords don't match"
    setErrors(found)
    if (Object.keys(found).length === 0) change.mutate()
  }

  return (
    <section className={styles.section} aria-labelledby="change-password">
      <h2 id="change-password" className={styles.title}>
        Change password
      </h2>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current_password}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          help="At least 8 characters"
          error={errors.new_password}
        />
        <TextField
          label="New password again"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={errors.repeat}
        />
        <div>
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
      {change.isSuccess && (
        <p className={styles.success} role="status">
          Your password was changed.
        </p>
      )}
    </section>
  )
}
