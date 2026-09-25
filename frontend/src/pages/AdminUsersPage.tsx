import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { listAdminUsers } from '../api/adminUsers'
import { queryKeys } from '../api/queryClient'
import { Alert } from '../components/Alert'
import { Avatar } from '../components/Avatar'
import { ButtonLink } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { TextField } from '../components/TextField'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { levelLabel } from '../trainings/levels'
import styles from './AdminUsersPage.module.css'

// /admin/users: everyone, searchable, each linking to their edit page.
export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search.trim())
  const users = useQuery({
    queryKey: queryKeys.adminUserList(debounced),
    queryFn: () => listAdminUsers(debounced),
    // Keep showing the previous results while the next search loads, instead of flashing "Loading…"
    placeholderData: (previous) => previous,
  })

  return (
    <>
      <PageHeader title="Users" actions={<ButtonLink to="/admin/users/new">+ New user</ButtonLink>}>
        Everyone who can log in, their client, level and team lead
      </PageHeader>

      <div className={styles.search}>
        <TextField label="Search" type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {users.isPending ? (
        <p className={styles.muted} role="status">
          Loading users…
        </p>
      ) : users.isError ? (
        <Alert title="Couldn't load the users">Check your connection and try again.</Alert>
      ) : users.data.length === 0 ? (
        <p className={styles.muted}>No one matches “{debounced}”.</p>
      ) : (
        <ul className={styles.list} aria-label="Users">
          {users.data.map((user) => (
            <li key={user.id} className={styles.row}>
              <Avatar name={user.name} src={user.avatar_url} />
              <div className={styles.who}>
                <Link to={`/admin/users/${user.id}/edit`} className={styles.name}>
                  {user.name}
                </Link>
                <span className={styles.muted}>{user.email}</span>
              </div>
              <div className={styles.facts}>
                <span>
                  {user.client} · {levelLabel(user.level)}
                </span>
                <span className={styles.muted}>{user.team_lead ? `Lead: ${user.team_lead.name}` : 'No team lead'}</span>
              </div>
              <div className={styles.roles}>
                {user.is_admin && <span className={styles.role}>Admin</span>}
                {user.is_team_lead && <span className={styles.role}>Team lead</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
