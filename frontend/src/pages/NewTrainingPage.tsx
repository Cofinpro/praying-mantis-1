import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { queryKeys } from '../api/queryClient'
import { createTraining } from '../api/trainings'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { TrainingForm } from '../components/TrainingForm'
import { emptyTrainingForm, toTrainingCreate, type TrainingForm as TrainingFormState } from '../trainings/trainingForm'
import styles from './TrainingFormPage.module.css'

export function NewTrainingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function create(form: TrainingFormState) {
    const training = await createTraining(toTrainingCreate(form))
    // Every cached training list is now out of date: mark them stale so they refetch when shown.
    await queryClient.invalidateQueries({ queryKey: queryKeys.trainings })
    navigate(`/trainings/${training.id}`)
  }

  return (
    <div className={styles.page}>
      <div>
        <BackLink to="/trainings">All trainings</BackLink>
        <PageHeader title="New training">Only admins can create trainings.</PageHeader>
      </div>
      <TrainingForm
        initial={emptyTrainingForm}
        submitLabel="Create training"
        submittingLabel="Creating…"
        cancelTo="/trainings"
        onSubmit={create}
      />
    </div>
  )
}
