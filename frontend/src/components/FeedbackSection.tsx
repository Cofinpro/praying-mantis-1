import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { queryKeys } from '../api/queryClient'
import { getFeedback, rateTraining, type FeedbackSummary } from '../api/trainings'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { formatDateTime } from '../lib/datetime'
import { Avatar } from './Avatar'
import { Button } from './Button'
import styles from './FeedbackSection.module.css'
import { StarInput, StarRating } from './Stars'
import { TextArea } from './TextField'

// The detail page's "Feedback": the average for everyone, a form for people who completed the training,
// and the comments for admins and the trainer.
export function FeedbackSection({ trainingId }: { trainingId: number }) {
  const feedback = useQuery({ queryKey: queryKeys.trainingFeedback(trainingId), queryFn: () => getFeedback(trainingId) })

  if (!feedback.isSuccess) return null
  const data = feedback.data
  // Nothing to show yet, and nothing to do: keep the page quiet
  if (data.rating_count === 0 && !data.can_rate && data.comments === null) return null

  return (
    <section className={styles.section} aria-labelledby="feedback-heading">
      <h2 id="feedback-heading" className={styles.title}>
        Feedback
      </h2>
      {data.average_rating !== null ? (
        <StarRating average={data.average_rating} count={data.rating_count} />
      ) : (
        <p className={styles.muted}>No ratings yet.</p>
      )}
      {data.can_rate && <RateForm trainingId={trainingId} feedback={data} />}
      {data.comments && data.comments.length > 0 && (
        <ul className={styles.comments} aria-label="Comments">
          {data.comments.map((c) => (
            <li key={c.user.id} className={styles.comment}>
              <Avatar name={c.user.name} src={c.user.avatar_url} />
              <div>
                <p className={styles.author}>
                  {c.user.name} <span className={styles.muted}>· {'★'.repeat(c.rating)} · {formatDateTime(c.updated_at)}</span>
                </p>
                {c.comment && <p>{c.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RateForm({ trainingId, feedback }: { trainingId: number; feedback: FeedbackSummary }) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState<number | null>(feedback.mine?.rating ?? null)
  const [comment, setComment] = useState(feedback.mine?.comment ?? '')
  const [missing, setMissing] = useState(false)
  const save = useMutation({
    mutationFn: () => rateTraining(trainingId, rating!, comment.trim() || null),
    // The average on this page, the card in lists and "Rate it" on the profile all change
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trainings }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMissing(rating === null)
    if (rating !== null) save.mutate()
  }

  const rated = feedback.mine !== null
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <StarInput value={rating} onChange={setRating} legend={rated ? 'Your rating' : 'How was it?'} />
      {missing && (
        <p className={styles.error} role="alert">
          Choose from 1 to 5 stars
        </p>
      )}
      <TextArea
        label="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        help="Admins and the trainer see your name with it"
        maxLength={2000}
      />
      <div className={styles.actions}>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : rated ? 'Update feedback' : 'Send feedback'}
        </Button>
        {save.isSuccess && (
          <span className={styles.thanks} role="status">
            Thanks for your feedback!
          </span>
        )}
      </div>
      {save.isError && (
        <p className={styles.error} role="alert">
          {enrollmentErrorMessage(save.error)}
        </p>
      )}
    </form>
  )
}
