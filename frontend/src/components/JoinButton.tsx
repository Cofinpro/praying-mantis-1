import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requestToJoin } from '../api/enrollments'
import { queryKeys } from '../api/queryClient'
import type { TrainingSummary } from '../api/trainings'
import { JOIN_HINTS, JOIN_LABELS, joinState } from '../enrollments/joinState'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { Button } from './Button'
import styles from './JoinButton.module.css'

// "Request to join" and its disabled states, for the detail page's "Your place" panel.
export function JoinButton({ training }: { training: TrainingSummary }) {
  const queryClient = useQueryClient()
  const join = useMutation({
    mutationFn: () => requestToJoin(training.id),
    // Success or refusal, the training changed (my status, or seats): refetch the detail and every list,
    // so the badge updates everywhere. invalidateQueries matches every key that starts with ['trainings'].
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.trainings }),
  })

  const state = joinState(training)
  const hint = JOIN_HINTS[state]

  return (
    <div className={styles.join}>
      <Button onClick={() => join.mutate()} disabled={state !== 'can_join' || join.isPending}>
        {join.isPending ? 'Sending request…' : JOIN_LABELS[state]}
      </Button>
      {hint && <p className={styles.hint}>{hint}</p>}
      {join.isError && (
        <p className={styles.error} role="alert">
          {enrollmentErrorMessage(join.error)}
        </p>
      )}
    </div>
  )
}
