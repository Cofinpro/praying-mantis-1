import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { createUser } from '../api/adminUsers'
import { queryKeys } from '../api/queryClient'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { UserForm } from '../components/UserForm'
import { emptyUser, type UserFormValues } from '../users/userForm'
import styles from './TrainingFormPage.module.css'

export function NewUserPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function create(values: UserFormValues) {
    await createUser(values)
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
    navigate('/admin/users')
  }

  return (
    <div className={styles.page}>
      <div>
        <BackLink to="/admin/users">All users</BackLink>
        <PageHeader title="New user">They log in with this email and password.</PageHeader>
      </div>
      <UserForm initial={emptyUser} submitLabel="Create user" submittingLabel="Creating…" onSubmit={create} />
    </div>
  )
}
