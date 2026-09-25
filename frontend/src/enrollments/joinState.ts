import type { TrainingSummary } from '../api/trainings'

// What the join button shows, derived from the training on every render (never stored in state).
export type JoinState = 'can_join' | 'pending' | 'enrolled' | 'rejected' | 'full' | 'cancelled' | 'started'

export function joinState(training: TrainingSummary, now = new Date()): JoinState {
  if (training.cancelled) return 'cancelled'
  if (training.my_enrollment_status === 'pending') return 'pending'
  if (training.my_enrollment_status === 'approved') return 'enrolled'
  if (training.my_enrollment_status === 'rejected') return 'rejected'
  // No enrollment, or withdrawn earlier: joining is possible again unless it's too late or full
  if (new Date(training.starts_at) <= now) return 'started'
  if (training.seats_left <= 0) return 'full'
  return 'can_join'
}

export const JOIN_LABELS: Record<JoinState, string> = {
  can_join: 'Request to join',
  pending: 'Pending approval',
  enrolled: 'Enrolled ✓',
  rejected: 'Rejected',
  full: 'Full',
  cancelled: 'Cancelled',
  started: 'Already started',
}

// Why the button is disabled, shown under it.
export const JOIN_HINTS: Partial<Record<JoinState, string>> = {
  pending: 'Your team lead will decide soon.',
  enrolled: 'You have a seat. See you there!',
  rejected: 'Your request was rejected.',
  full: 'No seats left.',
  started: 'Requests close when a training starts.',
}

// Withdraw is offered while pending or approved, until the training starts (plan.md → F3).
export function canWithdraw(training: TrainingSummary, now = new Date()): boolean {
  const status = training.my_enrollment_status
  return (
    !training.cancelled &&
    (status === 'pending' || status === 'approved') &&
    training.my_enrollment_id != null &&
    new Date(training.starts_at) > now
  )
}
