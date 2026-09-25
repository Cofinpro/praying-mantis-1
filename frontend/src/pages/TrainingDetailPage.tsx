import { Link, useParams } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import styles from './TrainingDetailPage.module.css'

export function TrainingDetailPage() {
  // Like `useRoute().params` in Vue. Params are always strings (or undefined), never numbers.
  const { id } = useParams()

  return (
    <>
      <Link to="/trainings" className={styles.back}>← All trainings</Link>
      <PageHeader title={`Training ${id}`} />
      <p>The training detail comes in FE-2.3.</p>
    </>
  )
}
