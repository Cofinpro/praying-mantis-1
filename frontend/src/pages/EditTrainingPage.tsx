import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { getTraining, updateTraining } from '../api/trainings'
import { Alert } from '../components/Alert'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'
import { TrainingForm } from '../components/TrainingForm'
import { toTrainingUpdate, trainingToForm, type TrainingForm as TrainingFormState } from '../trainings/trainingForm'
import { NotFoundPage } from './NotFoundPage'
import styles from './TrainingFormPage.module.css'

export function EditTrainingPage() {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const validId = Number.isInteger(id) && id > 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // The same query (and cache entry) as the detail page, so coming from there it's already loaded.
  const training = useQuery({
    queryKey: queryKeys.trainingDetail(id),
    queryFn: () => getTraining(id),
    enabled: validId,
  })

  if (!validId || (training.error instanceof ApiError && training.error.status === 404)) {
    return <NotFoundPage title="Training not found" message="It may have been removed." />
  }
  if (training.isPending) {
    return (
      <p role="status" className={styles.loading}>
        Loading training…
      </p>
    )
  }
  if (training.isError) {
    return <Alert title="Couldn't load this training">Check your connection and try again.</Alert>
  }
  if (training.data.cancelled) {
    return (
      <div className={styles.page}>
        <BackLink to={`/trainings/${id}`}>Back to the training</BackLink>
        <Alert title="This training was cancelled">A cancelled training can't be edited.</Alert>
      </div>
    )
  }

  const initial = trainingToForm(training.data)

  async function save(form: TrainingFormState) {
    const changes = toTrainingUpdate(initial, form)
    if (Object.keys(changes).length > 0) {
      const updated = await updateTraining(id, changes)
      // Put the answer straight into the detail cache, and mark every list stale.
      queryClient.setQueryData(queryKeys.trainingDetail(id), updated)
      await queryClient.invalidateQueries({ queryKey: queryKeys.trainings })
    }
    navigate(`/trainings/${id}`)
  }

  return (
    <div className={styles.page}>
      <div>
        <BackLink to={`/trainings/${id}`}>Back to the training</BackLink>
        <PageHeader title="Edit training">{training.data.name}</PageHeader>
      </div>
      {/* key: a different training mounts a fresh form, instead of keeping the old one's state */}
      <TrainingForm
        key={id}
        initial={initial}
        editing
        submitLabel="Save changes"
        submittingLabel="Saving…"
        cancelTo={`/trainings/${id}`}
        onSubmit={save}
      />
    </div>
  )
}
