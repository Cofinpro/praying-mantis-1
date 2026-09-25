import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { createTraining } from '../api/trainings'
import { Alert } from '../components/Alert'
import { BackLink } from '../components/BackLink'
import { Button, ButtonLink } from '../components/Button'
import { CheckboxGroup } from '../components/CheckboxGroup'
import { PageHeader } from '../components/PageHeader'
import { TextArea, TextField } from '../components/TextField'
import { TrainerPicker } from '../components/TrainerPicker'
import { LEVELS } from '../trainings/levels'
import {
  emptyTrainingForm,
  serverErrorsToFields,
  toTrainingCreate,
  validateTrainingForm,
  type FieldErrors,
  type TrainingForm,
} from '../trainings/trainingForm'
import styles from './NewTrainingPage.module.css'

export function NewTrainingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // One state object for the whole form, updated through `set`. With 8 fields this beats 8 useStates.
  const [form, setForm] = useState<TrainingForm>(emptyTrainingForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [generalErrors, setGeneralErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // A typed setter: set('name', 'x') compiles, set('name', 42) doesn't. The spread copies the old object,
  // because React only re-renders when it gets a *new* object (no deep reactivity like Vue's ref()).
  function set<K extends keyof TrainingForm>(field: K, value: TrainingForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const clientErrors = validateTrainingForm(form)
    setErrors(clientErrors)
    setGeneralErrors([])
    if (Object.keys(clientErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      const training = await createTraining(toTrainingCreate(form))
      // Every cached training list is now out of date: mark them stale so they refetch when shown.
      await queryClient.invalidateQueries({ queryKey: queryKeys.trainings })
      navigate(`/trainings/${training.id}`)
    } catch (err) {
      setSubmitting(false)
      if (err instanceof ApiError && err.status === 422) {
        const { fields, general } = serverErrorsToFields(err.detail)
        setErrors(fields)
        setGeneralErrors(general)
      } else {
        setGeneralErrors(['Could not create the training. Try again.'])
      }
    }
  }

  const fieldMessages = Object.values(errors)
  const problemCount = fieldMessages.length + generalErrors.length
  const external = form.trainer.kind === 'external'
  // Without a max, Chrome's year segment takes up to 6 digits, so typing "2026" then "09" lands in the year.
  const maxDateTime = '9999-12-31T23:59'

  return (
    <div className={styles.page}>
      <div>
        <BackLink to="/trainings">All trainings</BackLink>
        <PageHeader title="New training">Only admins can create trainings.</PageHeader>
      </div>

      {problemCount > 0 && (
        <Alert title={fieldMessages.length > 0 ? `Please fix ${plural(fieldMessages.length, 'field')}` : 'Could not create the training'}>
          {[...fieldMessages, ...generalErrors].join(' · ')}
        </Alert>
      )}

      {/* noValidate: our own messages replace the browser's pop-ups, so both rule sets don't compete */}
      <form id="new-training" className={styles.card} onSubmit={handleSubmit} noValidate>
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
        <ButtonLink to="/trainings" variant="ghost">
          Cancel
        </ButtonLink>
        {/* form="new-training" submits the form above, although the button sits outside it (as in Figma) */}
        <Button type="submit" form="new-training" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create training'}
        </Button>
      </div>
    </div>
  )
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
