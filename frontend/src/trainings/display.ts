import type { TrainingSummary } from '../api/trainings'

// Text shown for a training in cards and on its detail page.

export function trainerLabel(training: Pick<TrainingSummary, 'trainer' | 'external_trainer_name'>) {
  if (training.trainer) return `Trainer: ${training.trainer.name}`
  return training.external_trainer_name ? `External – ${training.external_trainer_name}` : 'External trainer'
}

export function seatsLabel({ seats_left, max_seats }: Pick<TrainingSummary, 'seats_left' | 'max_seats'>) {
  const left = `${seats_left} of ${max_seats} seats left`
  return seats_left <= 0 ? `Full · ${left}` : left
}

export type BadgeStatus = 'waitlisted' | 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled'

const BADGE_STATUSES: BadgeStatus[] = ['waitlisted', 'pending', 'approved', 'rejected', 'withdrawn', 'cancelled']

// my_enrollment_status is a plain string in the API schema, so narrow it before showing a badge.
export const isBadgeStatus = (value: string | null | undefined): value is BadgeStatus =>
  BADGE_STATUSES.includes(value as BadgeStatus)
