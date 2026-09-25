import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { queryKeys } from '../api/queryClient'
import { listTrainings } from '../api/trainings'
import { isAdmin } from '../auth/permissions'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button, ButtonLink } from '../components/Button'
import { LevelTag } from '../components/LevelTag'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/TextField'
import { TrainingCard } from '../components/TrainingCard'
import { isLevel, LEVELS } from '../trainings/levels'
import styles from './TrainingsPage.module.css'

export function TrainingsPage() {
  const { user } = useAuth()
  const admin = user !== null && isAdmin(user)

  // The admin's level filter lives in the URL (?level=senior), so it survives a refresh and can be shared.
  const [searchParams, setSearchParams] = useSearchParams()
  const levelParam = searchParams.get('level')
  const level = admin && isLevel(levelParam) ? levelParam : null

  // The query key is the cache key: each level gets its own cached list, and switching back is instant.
  const trainings = useQuery({
    queryKey: queryKeys.trainingList(level),
    queryFn: () => listTrainings(level),
  })

  return (
    <>
      <PageHeader
        title="Trainings"
        actions={admin && <ButtonLink to="/admin/trainings/new">+ New training</ButtonLink>}
      >
        {admin ? (
          'Every training, including past and cancelled ones'
        ) : (
          <span className={styles.subtitle}>
            Upcoming trainings for your level {user && <LevelTag level={user.level} />}
          </span>
        )}
      </PageHeader>

      {admin && (
        <SelectField
          label="Level"
          className={styles.filter}
          value={level ?? ''}
          onChange={(event) => setSearchParams(event.target.value ? { level: event.target.value } : {})}
        >
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </SelectField>
      )}

      {trainings.isPending ? (
        <p className={styles.message} role="status">
          Loading trainings…
        </p>
      ) : trainings.isError ? (
        <div className={styles.error}>
          <Alert title="Couldn't load trainings">Check your connection and try again.</Alert>
          <Button onClick={() => trainings.refetch()}>Try again</Button>
        </div>
      ) : trainings.data.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {admin ? 'No trainings for this filter' : 'No upcoming trainings for your level yet'}
          </p>
          <p className={styles.message}>
            {admin ? 'Create one with “+ New training”.' : 'New trainings show up here as soon as an admin adds them.'}
          </p>
        </div>
      ) : (
        <ul className={styles.grid} aria-label="Trainings">
          {trainings.data.map((training) => (
            <li key={training.id} className={styles.item}>
              <TrainingCard training={training} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
