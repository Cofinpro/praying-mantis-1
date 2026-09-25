import { useParams } from 'react-router'
import { BackLink } from '../components/BackLink'
import { PageHeader } from '../components/PageHeader'

export function TrainingDetailPage() {
  // Like `useRoute().params` in Vue. Params are always strings (or undefined), never numbers.
  const { id } = useParams()

  return (
    <>
      <BackLink to="/trainings">All trainings</BackLink>
      <PageHeader title={`Training ${id}`} />
      <p>The training detail comes in FE-2.3.</p>
    </>
  )
}
