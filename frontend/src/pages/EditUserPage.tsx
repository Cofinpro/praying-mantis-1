import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getAdminUser, resetPassword, updateUser, type UserAdmin, type UserUpdate } from '../api/adminUsers'
import { ApiError } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { Alert } from '../components/Alert'
import { BackLink } from '../components/BackLink'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { TextField } from '../components/TextField'
import { UserForm } from '../components/UserForm'
import { userToForm, type UserFormValues } from '../users/userForm'
import { apiFieldErrors } from '../users/fieldErrors'
import { NotFoundPage } from './NotFoundPage'
import styles from './TrainingFormPage.module.css'

// Only what changed, like the training edit (a PATCH never overwrites someone else's newer edit)
function changedFields(before: UserFormValues, after: UserFormValues): UserUpdate {
  const changes: UserUpdate = {}
  for (const key of ['name', 'email', 'client', 'level', 'is_admin', 'team_lead_id'] as const) {
    if (before[key] !== after[key]) Object.assign(changes, { [key]: after[key] })
  }
  return changes
}

export function EditUserPage() {
  const id = Number(useParams().id)
  const validId = Number.isInteger(id) && id > 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useQuery({ queryKey: queryKeys.adminUser(id), queryFn: () => getAdminUser(id), enabled: validId })

  if (!validId || (user.error instanceof ApiError && user.error.status === 404)) {
    return <NotFoundPage title="User not found" message="They may have been removed." />
  }
  if (user.isPending) return <p role="status">Loading user…</p>
  if (user.isError) return <Alert title="Couldn't load this user">Check your connection and try again.</Alert>

  const initial = userToForm(user.data)

  async function save(values: UserFormValues) {
    const changes = changedFields(initial, values)
    if (Object.keys(changes).length > 0) {
      await updateUser(id, changes)
      // Names, leads and roles show in many places: refresh the user lists and my own /me
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ])
    }
    navigate('/admin/users')
  }

  return (
    <div className={styles.page}>
      <div>
        <BackLink to="/admin/users">All users</BackLink>
        <PageHeader title="Edit user">{user.data.name}</PageHeader>
      </div>
      <UserForm key={id} initial={initial} userId={id} submitLabel="Save changes" submittingLabel="Saving…" onSubmit={save} />
      <ResetPassword user={user.data} />
    </div>
  )
}

// A separate form: an admin sets a new password when someone forgot theirs.
function ResetPassword({ user }: { user: UserAdmin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reset = useMutation({
    mutationFn: () => resetPassword(user.id, password),
    onSuccess: () => setPassword(''),
    onError: (err) => setError(apiFieldErrors(err).fields.password ?? 'Could not set the password. Try again.'),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    reset.reset()
    if (password.length < 8) return setError('Use at least 8 characters')
    reset.mutate()
  }

  return (
    <section aria-labelledby="reset-password">
      <h2 id="reset-password" className={styles.sectionTitle}>
        Reset password
      </h2>
      <form className={styles.inlineForm} onSubmit={submit} noValidate>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          help={`Tell ${user.name} the new password privately.`}
          error={error ?? undefined}
        />
        <Button type="submit" variant="secondary" disabled={reset.isPending}>
          {reset.isPending ? 'Setting…' : 'Set password'}
        </Button>
      </form>
      {reset.isSuccess && (
        <p className={styles.success} role="status">
          Password changed. Their current sessions stay logged in until they expire.
        </p>
      )}
    </section>
  )
}
