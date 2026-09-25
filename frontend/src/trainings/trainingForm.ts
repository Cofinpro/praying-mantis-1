import type { Level, TrainingCreate, TrainingRead, TrainingUpdate } from '../api/trainings'
import { localInputToUtcIso, utcIsoToLocalInput } from '../lib/datetime'

// Everything the create form edits. Inputs hold strings (a number input's value is a string too), so the
// form state stays close to the DOM and is converted once, in toTrainingCreate().
export type TrainerChoice = { kind: 'none' } | { kind: 'user'; id: number; name: string } | { kind: 'external' }

export type TrainingForm = {
  name: string
  description: string
  starts_at: string // "2026-10-14T09:00", local time from <input type="datetime-local">
  ends_at: string
  trainer: TrainerChoice
  external_trainer_name: string
  levels: Level[]
  max_seats: string
}

export type FieldName = keyof TrainingForm
export type FieldErrors = Partial<Record<FieldName, string>>

export const emptyTrainingForm: TrainingForm = {
  name: '',
  description: '',
  starts_at: '',
  ends_at: '',
  trainer: { kind: 'none' },
  external_trainer_name: '',
  levels: [],
  max_seats: '',
}

// Pre-fills the edit form from the API's training (UTC → local time for the inputs).
export function trainingToForm(training: TrainingRead): TrainingForm {
  return {
    name: training.name,
    description: training.description,
    starts_at: utcIsoToLocalInput(training.starts_at),
    ends_at: utcIsoToLocalInput(training.ends_at),
    trainer: training.trainer
      ? { kind: 'user', id: training.trainer.id, name: training.trainer.name }
      : { kind: 'external' },
    external_trainer_name: training.external_trainer_name ?? '',
    levels: training.levels,
    max_seats: String(training.max_seats),
  }
}

// The rules agreed for F2 (plan.md), mirrored from TrainingCreate in backend/app/schemas/training.py.
// They give fast feedback only: the backend checks them again and has the final say.
// When editing, pass the `initial` form: an unchanged start may be in the past (fixing a typo afterwards).
export function validateTrainingForm(form: TrainingForm, now = new Date(), initial?: TrainingForm): FieldErrors {
  const errors: FieldErrors = {}

  const name = form.name.trim()
  if (!name) errors.name = 'Enter a name'
  else if (name.length > 200) errors.name = 'Use at most 200 characters'

  if (!form.description.trim()) errors.description = 'Enter a description'

  const startsAt = form.starts_at ? new Date(form.starts_at) : null
  const endsAt = form.ends_at ? new Date(form.ends_at) : null
  if (!startsAt) errors.starts_at = 'Choose when it starts'
  else if (startsAt <= now && form.starts_at !== initial?.starts_at) errors.starts_at = 'Start must be in the future'
  if (!endsAt) errors.ends_at = 'Choose when it ends'
  else if (startsAt && endsAt <= startsAt) errors.ends_at = 'End must be after start'

  if (form.trainer.kind === 'none') errors.trainer = 'Pick a trainer, or External'
  if (form.external_trainer_name.trim().length > 100) errors.external_trainer_name = 'Use at most 100 characters'

  if (form.levels.length === 0) errors.levels = 'Choose at least one level'

  const seats = Number(form.max_seats)
  if (!form.max_seats || !Number.isInteger(seats) || seats < 1) errors.max_seats = 'Enter at least 1 seat'
  else if (seats > 1000) errors.max_seats = 'Use at most 1000 seats'

  return errors
}

// Only call with a form that passed validateTrainingForm().
export function toTrainingCreate(form: TrainingForm): TrainingCreate {
  const external = form.trainer.kind === 'external'
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    starts_at: localInputToUtcIso(form.starts_at),
    ends_at: localInputToUtcIso(form.ends_at),
    max_seats: Number(form.max_seats),
    trainer_id: form.trainer.kind === 'user' ? form.trainer.id : null,
    external_trainer_name: external && form.external_trainer_name.trim() ? form.external_trainer_name.trim() : null,
    levels: form.levels,
  }
}

// PATCH body with only what changed, so an edit never overwrites a field someone else just changed.
// The trainer is one choice spread over two API fields, so both are sent whenever either changes.
export function toTrainingUpdate(initial: TrainingForm, form: TrainingForm): TrainingUpdate {
  const before = toTrainingCreate(initial)
  const after = toTrainingCreate(form)
  const changes: TrainingUpdate = {}

  if (after.name !== before.name) changes.name = after.name
  if (after.description !== before.description) changes.description = after.description
  if (after.starts_at !== before.starts_at) changes.starts_at = after.starts_at
  if (after.ends_at !== before.ends_at) changes.ends_at = after.ends_at
  if (after.max_seats !== before.max_seats) changes.max_seats = after.max_seats
  if (after.levels.join() !== before.levels.join()) changes.levels = after.levels
  if (after.trainer_id !== before.trainer_id || after.external_trainer_name !== before.external_trainer_name) {
    changes.trainer_id = after.trainer_id
    changes.external_trainer_name = after.external_trainer_name
  }
  return changes
}

type ValidationError = { loc: (string | number)[]; msg: string }

const API_FIELDS: Record<string, FieldName> = {
  name: 'name',
  description: 'description',
  starts_at: 'starts_at',
  ends_at: 'ends_at',
  trainer_id: 'trainer',
  external_trainer_name: 'external_trainer_name',
  levels: 'levels',
  max_seats: 'max_seats',
}

// "ends_at must be after starts_at" is about ends_at: the field named first is the one to mark.
// Longer names win a tie, so "external_trainer_name" isn't read as "name".
function firstFieldMentioned(message: string): string | undefined {
  const mentioned = Object.keys(API_FIELDS)
    .map((field) => ({ field, index: message.indexOf(field) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index || b.field.length - a.field.length)
  return mentioned[0]?.field
}

// FastAPI's 422 `detail` is a list like [{ loc: ["body", "max_seats"], msg: "Input should be ≥ 1" }].
// Errors from a whole-model validator have loc ["body"] and name the field in the message instead.
// Anything that can't be placed on a field goes in `general`.
export function serverErrorsToFields(detail: unknown): { fields: FieldErrors; general: string[] } {
  const fields: FieldErrors = {}
  const general: string[] = []
  const errors = Array.isArray(detail) ? (detail as ValidationError[]) : []

  for (const { loc, msg } of errors) {
    const message = msg.replace(/^Value error, /, '')
    const apiField = typeof loc[1] === 'string' ? loc[1] : firstFieldMentioned(message)
    const field = apiField ? API_FIELDS[apiField] : undefined
    if (field && !fields[field]) fields[field] = message
    else if (!field) general.push(message)
  }
  if (errors.length === 0) general.push('Something went wrong. Try again.')
  return { fields, general }
}
