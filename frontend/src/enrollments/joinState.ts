import type { TrainingSummary } from '../api/trainings'

// What the join button shows, derived from the training on every render (never stored in state).
export type JoinState = 'can_join' | 'join_waitlist' | 'waitlisted' | 'pending' | 'enrolled' | 'completed' | 'rejected' | 'cancelled' | 'started'

export function joinState(training: TrainingSummary, now = new Date()): JoinState {
  if (training.cancelled) return 'cancelled'
  if (training.my_enrollment_status === 'waitlisted') return 'waitlisted'
  if (training.my_enrollment_status === 'pending') return 'pending'
  if (training.my_enrollment_status === 'approved') return new Date(training.ends_at) <= now ? 'completed' : 'enrolled'
  if (training.my_enrollment_status === 'rejected') return 'rejected'
  // No enrollment, or withdrawn earlier: joining is possible again unless it's too late. Full = the waitlist
  if (new Date(training.starts_at) <= now) return 'started'
  if (training.seats_left <= 0) return 'join_waitlist'
  return 'can_join'
}

export const JOIN_LABELS: Record<JoinState, string> = {
  can_join: 'Request to join',
  join_waitlist: 'Join the waitlist',
  waitlisted: 'On the waitlist',
  pending: 'Pending approval',
  enrolled: 'Enrolled ✓',
  completed: 'Completed ✓',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  started: 'Already started',
}

// Why the button is disabled (or, for the waitlist, what joining means), shown under it.
export const JOIN_HINTS: Partial<Record<JoinState, string>> = {
  pending: 'Your team lead will decide soon.',
  enrolled: 'You have a seat. See you there!',
  completed: 'You took part in this training.',
  rejected: 'Your request was rejected.',
  join_waitlist: 'No seats left. Join the waitlist: when a place opens up, the first in line moves up.',
  started: 'Requests close when a training starts.',
}

// Both buttons send something: the rest are disabled.
export const CAN_SEND: JoinState[] = ['can_join', 'join_waitlist']

// Under the button while waitlisted: where I am in line.
export function waitlistHint(position: number | null | undefined): string {
  const place = position === 1 ? 'You’re next in line' : position ? `You’re #${position} in line` : 'You’re in line'
  return `${place}. When a place opens up, your request goes to your team lead.`
}

// Withdraw is offered while waitlisted, pending or approved, until the training starts (plan.md → F3).
export function canWithdraw(training: TrainingSummary, now = new Date()): boolean {
  const status = training.my_enrollment_status
  return (
    !training.cancelled &&
    (status === 'waitlisted' || status === 'pending' || status === 'approved') &&
    training.my_enrollment_id != null &&
    new Date(training.starts_at) > now
  )
}
