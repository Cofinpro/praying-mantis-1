import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found">There's nothing at this address.</PageHeader>
      <Link to="/trainings">Go to Trainings</Link>
    </>
  )
}
