import { Link } from 'react-router'
import type { TrainingSummary } from '../api/trainings'
import { formatTrainingTime } from '../lib/datetime'
import { isBadgeStatus, seatsLabel, trainerLabel } from '../trainings/display'
import { LevelTag } from './LevelTag'
import { StatusBadge } from './StatusBadge'
import styles from './TrainingCard.module.css'

// Figma "TrainingCard". The whole card is clickable, but only the name is a link: a screen reader hears
// one link per card instead of the whole card's text (the "stretched link" trick, see the CSS).
type TrainingCardProps = {
  training: TrainingSummary
  // Replaces "N of M seats left", e.g. "Completed" on the profile, where seats no longer matter
  footerNote?: string
}

export function TrainingCard({ training, footerNote }: TrainingCardProps) {
  const status = training.cancelled ? 'cancelled' : training.my_enrollment_status

  return (
    <article className={styles.card}>
      <h2 className={`${styles.name} ${training.cancelled ? styles.cancelledName : ''}`}>
        <Link to={`/trainings/${training.id}`} className={styles.link}>
          {training.name}
        </Link>
      </h2>
      <p className={styles.meta}>{formatTrainingTime(training.starts_at, training.ends_at)}</p>
      <p className={styles.meta}>{trainerLabel(training)}</p>
      <ul className={styles.levels} aria-label="Levels">
        {training.levels.map((level) => (
          <li key={level}>
            <LevelTag level={level} />
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <span className={styles.seats}>{footerNote ?? seatsLabel(training)}</span>
        {isBadgeStatus(status) && <StatusBadge status={status} />}
      </div>
    </article>
  )
}
