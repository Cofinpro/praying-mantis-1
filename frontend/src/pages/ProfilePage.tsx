import { useQuery } from '@tanstack/react-query'
import { getMyEnrollments } from '../api/enrollments'
import { queryKeys } from '../api/queryClient'
import type { TrainingSummary } from '../api/trainings'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { TrainingCard } from '../components/TrainingCard'
import { levelLabel } from '../trainings/levels'
import styles from './ProfilePage.module.css'

// Built from existing pieces: the user from useAuth() (/me), and TrainingCards for each section.
export function ProfilePage() {
  const { user } = useAuth()
  const mine = useQuery({ queryKey: queryKeys.myEnrollments, queryFn: getMyEnrollments })

  if (!user) return null

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile</h1>

      {/* Figma "ProfileHeader" */}
      <section className={styles.header} aria-label="Your details">
        <Avatar name={user.name} size="md" />
        <div className={styles.identity}>
          <p className={styles.name}>{user.name}</p>
          <p className={styles.email}>{user.email}</p>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Client</dt>
            <dd>{user.client}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>{levelLabel(user.level)}</dd>
          </div>
          <div>
            <dt>Team lead</dt>
            <dd>{user.team_lead?.name ?? 'None (an admin approves your requests)'}</dd>
          </div>
        </dl>
      </section>

      {mine.isPending ? (
        <p className={styles.muted} role="status">
          Loading your trainings…
        </p>
      ) : mine.isError ? (
        <div className={styles.error}>
          <Alert title="Couldn't load your trainings">Check your connection and try again.</Alert>
          <Button onClick={() => mine.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          <Section title="Upcoming" trainings={mine.data.upcoming} empty="No upcoming trainings. Request one from Trainings." />
          <Section title="Pending" trainings={mine.data.pending} empty="No requests waiting for a decision." />
          <Section
            title="Completed"
            trainings={mine.data.completed}
            empty="No completed trainings yet."
            footerNote="Completed"
          />
        </>
      )}
    </div>
  )
}

type SectionProps = {
  title: string
  trainings: TrainingSummary[]
  empty: string
  footerNote?: string
}

function Section({ title, trainings, empty, footerNote }: SectionProps) {
  const headingId = `profile-${title.toLowerCase()}`
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.sectionTitle}>
        {title} <span className={styles.count}>{trainings.length}</span>
      </h2>
      {trainings.length === 0 ? (
        <p className={styles.emptySection}>{empty}</p>
      ) : (
        <ul className={styles.grid}>
          {trainings.map((training) => (
            <li key={training.id} className={styles.item}>
              <TrainingCard training={training} footerNote={footerNote} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
