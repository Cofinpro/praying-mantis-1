import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { getTraining, type TrainingSummary } from '../api/trainings'
import { Alert } from '../components/Alert'
import { BackLink } from '../components/BackLink'
import { Button } from '../components/Button'
import { LevelTag } from '../components/LevelTag'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { formatTrainingTime } from '../lib/datetime'
import { isBadgeStatus, seatsLabel, trainerLabel } from '../trainings/display'
import { NotFoundPage } from './NotFoundPage'
import styles from './TrainingDetailPage.module.css'

// The full training, or just the list's summary while the full one loads (no description yet).
type TrainingOrSummary = TrainingSummary & { description?: string }

export function TrainingDetailPage() {
  // Like `useRoute().params` in Vue. Params are always strings (or undefined), never numbers.
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const validId = Number.isInteger(id) && id > 0
  const queryClient = useQueryClient()

  const training = useQuery<TrainingOrSummary>({
    queryKey: queryKeys.trainingDetail(id),
    queryFn: () => getTraining(id),
    enabled: validId,
    // Coming from the list, the card's data is already cached: show it at once while the description loads.
    placeholderData: () => findInCachedLists(queryClient.getQueriesData<TrainingSummary[]>({ queryKey: ['trainings', 'list'] }), id),
  })

  if (!validId || (training.error instanceof ApiError && training.error.status === 404)) {
    return <NotFoundPage title="Training not found" message="It doesn't exist, or it isn't for your level." />
  }

  if (training.isPending) {
    return (
      <p className={styles.muted} role="status">
        Loading training…
      </p>
    )
  }

  if (training.isError) {
    return (
      <div className={styles.error}>
        <Alert title="Couldn't load this training">Check your connection and try again.</Alert>
        <Button onClick={() => training.refetch()}>Try again</Button>
      </div>
    )
  }

  // Everything below is derived from the server data on each render, never copied into useState:
  // when the query refetches (say, after joining in F3), the page updates by itself.
  const data = training.data
  const status = data.cancelled ? 'cancelled' : data.my_enrollment_status
  const description = data.description ?? null

  return (
    <>
      <BackLink to="/trainings">All trainings</BackLink>
      {data.cancelled && (
        <div className={styles.banner}>
          <Alert title="This training was cancelled">It won't take place, and it can't be joined.</Alert>
        </div>
      )}
      <PageHeader title={data.name}>{formatTrainingTime(data.starts_at, data.ends_at)}</PageHeader>

      <div className={styles.layout}>
        <div className={styles.main}>
          <dl className={styles.facts}>
            <div>
              <dt>Trainer</dt>
              <dd>{trainerLabel(data).replace(/^Trainer: /, '')}</dd>
            </div>
            <div>
              <dt>Levels</dt>
              <dd>
                <ul className={styles.levels}>
                  {data.levels.map((level) => (
                    <li key={level}>
                      <LevelTag level={level} />
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>

          <section className={styles.description} aria-labelledby="description-heading">
            <h2 id="description-heading" className={styles.sectionTitle}>
              Description
            </h2>
            {description === null ? (
              <p className={styles.muted}>Loading description…</p>
            ) : (
              <p className={styles.descriptionText}>{description}</p>
            )}
          </section>
        </div>

        {/* The action panel. F3 puts "Request to join" and "Withdraw" here. */}
        <aside className={styles.panel} aria-label="Your place">
          <p className={styles.seats}>{seatsLabel(data)}</p>
          {isBadgeStatus(status) && <StatusBadge status={status} />}
          {!data.cancelled && <p className={styles.muted}>Requests to join open soon.</p>}
        </aside>
      </div>
    </>
  )
}

// A training from any cached list (whatever the level filter), as a stand-in until the detail arrives.
function findInCachedLists(lists: [unknown, TrainingSummary[] | undefined][], id: number) {
  for (const [, trainings] of lists) {
    const found = trainings?.find((t) => t.id === id)
    if (found) return found
  }
  return undefined
}
