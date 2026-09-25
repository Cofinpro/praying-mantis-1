import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'

export function NotAllowedPage() {
  return (
    <>
      <PageHeader title="Not allowed">
        You don't have access to this page. If you think you should, ask an admin.
      </PageHeader>
      <Link to="/trainings">Go to Trainings</Link>
    </>
  )
}
