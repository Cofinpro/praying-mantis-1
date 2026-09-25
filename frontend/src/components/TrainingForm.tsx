import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { LEVELS } from '../trainings/levels'
import { serverErrorsToFields, validateTrainingForm, type FieldErrors, type TrainingForm as TrainingFormState } from '../trainings/trainingForm'
import { Alert } from './Alert'
import { Button, ButtonLink } from './Button'
import { CheckboxGroup } from './CheckboxGroup'
import { TextArea, TextField } from './TextField'
import { TrainerPicker } from './TrainerPicker'
import styles from './TrainingForm.module.css'

type TrainingFormProps = {
  // The starting values: empty for "New training", the training's own values for "Edit".
  initial: TrainingFormState
  // Edit only: an unchanged start may already be in the past.
  editing?: boolean
  submitLabel: string
  submittingLabel: string
  cancelTo: string
  // Sends the form. Throw the ApiError on failure: 422s land on fields, 409s in the alert.
  onSubmit: (form: TrainingFormState) => Promise<void>
}

// One form for creating and editing a training (FE-2.1 and FE-2.4). The pages only decide the heading
// and what "submit" means. Like a Vue component with props and an emit, where the emit is a prop too.
export function TrainingForm({ initial, editing = false, submitLabel, submittingLabel, cancelTo, onSubmit }: TrainingFormProps) {
  // One state object for the whole form, updated through `set`. With 8 fields this beats 8 useStates.
  const [form, setForm] = useState<TrainingFormState>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [generalErrors, setGeneralErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // A typed setter: set('name', 'x') compiles, set('name', 42) doesn't. The spread copies the old object,
  // because React only re-renders when it gets a *new* object (no deep reactivity like Vue's ref()).
  function set<K extends keyof TrainingFormState>(field: K, value: TrainingFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const clientErrors = validateTrainingForm(form, new Date(), editing ? initial : undefined)
    setErrors(clientErrors)
    setGeneralErrors([])
    if (Object.keys(clientErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setSubmitting(false)
      if (err instanceof ApiError && err.status === 422) {
        const { fields, general } = serverErrorsToFields(err.detail)
        setErrors(fields)
        setGeneralErrors(general)
      } else if (err instanceof ApiError && err.status === 409) {
        setGeneralErrors([conflictMessage(err)])
      } else {
        setGeneralErrors(['Could not save the training. Try again.'])
      }
    }
  }

  const fieldMessages = Object.values(errors)
  const problemCount = fieldMessages.length + generalErrors.length
  const external = form.trainer.kind === 'external'
  // Without a max, Chrome's year segment takes up to 6 digits, so typing "2026" then "09" lands in the year.
  const maxDateTime = '9999-12-31T23:59'

  return (
    <>
      {problemCount > 0 && (
        <Alert title={fieldMessages.length > 0 ? `Please fix ${plural(fieldMessages.length, 'field')}` : 'Could not save the training'}>
          {[...fieldMessages, ...generalErrors].join(' · ')}
        </Alert>
      )}

      {/* noValidate: our own messages replace the browser's pop-ups, so both rule sets don't compete */}
      <form id="training-form" className={styles.card} onSubmit={handleSubmit} noValidate>
        <TextField label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <TextArea
          label="Description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          error={errors.description}
        />
        <div className={styles.when}>
          <TextField
            label="Starts"
            type="datetime-local"
            max={maxDateTime}
            value={form.starts_at}
            onChange={(e) => set('starts_at', e.target.value)}
            help="Times are in your local time"
            error={errors.starts_at}
          />
          <TextField
            label="Ends"
            type="datetime-local"
            max={maxDateTime}
            value={form.ends_at}
            onChange={(e) => set('ends_at', e.target.value)}
            help="Stored in UTC"
            error={errors.ends_at}
          />
        </div>
        <TrainerPicker
          value={form.trainer}
          onChange={(trainer) => set('trainer', trainer)}
          help="Pick a user, or External for someone outside the company"
          error={errors.trainer}
        />
        <TextField
          label="External trainer name (optional)"
          value={external ? form.external_trainer_name : ''}
          onChange={(e) => set('external_trainer_name', e.target.value)}
          disabled={!external}
          placeholder={external ? 'e.g. Acme Academy' : 'Only when trainer is External'}
          error={errors.external_trainer_name}
        />
        <CheckboxGroup
          legend="Levels"
          options={LEVELS}
          value={form.levels}
          onChange={(levels) => set('levels', levels)}
          help="Employees only see trainings for their own level"
          error={errors.levels}
        />
        <div className={styles.seats}>
          <TextField
            label="Max seats"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={form.max_seats}
            onChange={(e) => set('max_seats', e.target.value)}
            error={errors.max_seats}
          />
        </div>
      </form>

      <div className={styles.actions}>
        <ButtonLink to={cancelTo} variant="ghost">
          Cancel
        </ButtonLink>
        {/* form="training-form" submits the form above, although the button sits outside it (as in Figma) */}
        <Button type="submit" form="training-form" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </>
  )
}

// 409s carry {code, message} (see API conventions). Show the backend's message for people.
function conflictMessage(error: ApiError) {
  const detail = error.detail as { message?: unknown } | undefined
  return typeof detail?.message === 'string' ? detail.message : 'This change conflicts with the training as it is now.'
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
