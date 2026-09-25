import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'

type NotFoundPageProps = {
  title?: string
  message?: string
}

// The catch-all route, and the "doesn't exist" state of pages like a training's detail.
export function NotFoundPage({ title = 'Page not found', message = "There's nothing at this address." }: NotFoundPageProps) {
  return (
    <>
      <PageHeader title={title}>{message}</PageHeader>
      <Link to="/trainings">Go to Trainings</Link>
    </>
  )
}
