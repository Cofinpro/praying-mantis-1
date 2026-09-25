import { ApiError } from '../api/client'

// One friendly sentence per business-rule code (409 {detail: {code, message}}), agreed in plan.md → F3 and F6.
// The code is stable; the backend's message is only the fallback for a code we don't know yet.
const MESSAGES: Record<string, string> = {
  already_requested: "You've already asked to join this training.",
  request_rejected: 'Your request for this training was rejected, so you can’t ask again.',
  training_full: 'Sorry, this training just filled up.',
  training_started: 'This training has already started.',
  training_cancelled: 'This training was cancelled.',
  not_pending: 'This request was already decided.',
  not_withdrawable: 'This request can no longer be withdrawn.',
  seat_taken: 'Sorry, this seat was just taken.',
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
