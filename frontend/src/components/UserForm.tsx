import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { listAdminUsers } from '../api/adminUsers'
import { queryKeys } from '../api/queryClient'
import { LEVELS } from '../trainings/levels'
import { apiFieldErrors } from '../users/fieldErrors'
import { CLIENTS, type Client, type UserFormValues } from '../users/userForm'
import { Alert } from './Alert'
import { Button, ButtonLink } from './Button'
import { SelectField, TextField } from './TextField'
import styles from './UserForm.module.css'

type UserFormProps = {
  initial: UserFormValues
  // The user being edited (excluded from the team lead choices); undefined when creating
  userId?: number
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: UserFormValues) => Promise<void>
}

// Create and edit a user (the same pattern as TrainingForm): the page decides what submit means,
// the form shows 422s next to fields and 409s (email_taken → Email) where they belong.
export function UserForm({ initial, userId, submitLabel, submittingLabel, onSubmit }: UserFormProps) {
  const creating = userId === undefined
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Everyone, for the team lead select. Cached with the Users page's own list.
  const people = useQuery({ queryKey: queryKeys.adminUserList(''), queryFn: () => listAdminUsers() })

  function set<K extends keyof UserFormValues>(field: K, value: UserFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {}
    if (!values.name.trim()) found.name = 'Enter a name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = 'Enter an email address'
    if (creating && values.password.length < 8) found.password = 'Use at least 8 characters'
    return found
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setGeneral(null)
    if (Object.keys(found).length > 0) return
    setSubmitting(true)
    try {
      await onSubmit({ ...values, name: values.name.trim(), email: values.email.trim() })
    } catch (error) {
      setSubmitting(false)
      const { fields, general } = apiFieldErrors(error, { email_taken: 'email', cannot_demote_self: 'is_admin' })
      setErrors(fields)
      setGeneral(general)
    }
  }

  const leads = (people.data ?? []).filter((p) => p.id !== userId)

  return (
    <>
      {general && <Alert title="Could not save the user">{general}</Alert>}
      <form id="user-form" className={styles.card} onSubmit={handleSubmit} noValidate>
        <TextField label="Name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
        />
        <div className={styles.row}>
          <SelectField label="Client" value={values.client} onChange={(e) => set('client', e.target.value as Client)}>
            {CLIENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <SelectField label="Level" value={values.level} onChange={(e) => set('level', e.target.value as UserFormValues['level'])}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField
          label="Team lead"
          value={values.team_lead_id ?? ''}
          onChange={(e) => set('team_lead_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">No team lead (an admin approves their requests)</option>
          {leads.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        {errors.team_lead_id && (
          <p className={styles.error} role="alert">
            {errors.team_lead_id}
          </p>
        )}
        <label className={styles.checkbox}>
          <input type="checkbox" checked={values.is_admin} onChange={(e) => set('is_admin', e.target.checked)} />
          Admin (can manage trainings and users, and approves requests of people without a team lead)
        </label>
        {errors.is_admin && (
          <p className={styles.error} role="alert">
            {errors.is_admin}
          </p>
        )}
        {creating && (
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => set('password', e.target.value)}
            help="At least 8 characters. Share it with them privately; they can change it on their Profile."
            error={errors.password}
          />
        )}
      </form>
      <div className={styles.actions}>
        <ButtonLink to="/admin/users" variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" form="user-form" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </>
  )
}
