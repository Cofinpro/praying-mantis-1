import { ApiError } from '../api/client'

// One friendly sentence per business-rule code (409 {detail: {code, message}}), agreed in plan.md → F3 and F6.
// The code is stable; the backend's message is only the fallback for a code we don't know yet.
const MESSAGES: Record<string, string> = {
  already_requested: "You've already asked to join this training.",
  request_rejected: 'Your request for this training was rejected, so you can’t ask again.',
  training_full: 'Sorry, this training just filled up. You can join the waitlist.',
  already_waitlisted: "You're already on the waitlist for this training.",
  training_not_full: 'A seat just opened up: you can request it now.',
  training_started: 'This training has already started.',
  training_cancelled: 'This training was cancelled.',
  not_pending: 'This request was already decided.',
  second_approver_needed: 'You approved this as team lead, so someone else in HR gives the second approval.',
  not_withdrawable: 'This request can no longer be withdrawn.',
  seat_taken: 'Sorry, this seat was just taken.',
  not_completed: 'You can rate a training once you have completed it.',
  too_many_materials: 'This training already has 20 files. Delete one first.',
  already_reserved: 'You already have a seat that day.',
  reservation_in_past: "Past reservations can't be cancelled.",
}

export function enrollmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]
    if (error.status === 403) return typeof error.detail === 'string' ? error.detail : "You can't do that."
    const detail = error.detail as { message?: unknown } | string | undefined
    if (typeof detail === 'string') return detail
    if (typeof detail?.message === 'string') return detail.message
  }
  return 'Something went wrong. Try again.'
}
