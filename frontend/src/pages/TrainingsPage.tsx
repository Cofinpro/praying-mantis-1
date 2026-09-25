import { useEffect, useState } from 'react'
import { getHello } from '../api/health'
import { PageHeader } from '../components/PageHeader'

export function TrainingsPage() {
  const [message, setMessage] = useState('Contacting backend...')

  // Temporary: shows that the API client works, with mocks or the real backend. TanStack Query replaces
  // this kind of effect from FE-2.2.
  useEffect(() => {
    // StrictMode runs effects twice in dev, and a slow first response could land after the second one.
    // The flag makes the cleanup ignore a response that arrives after unmount.
    let ignore = false
    getHello()
      .then((data) => !ignore && setMessage(data.message))
      .catch(() => !ignore && setMessage('Backend unreachable'))
    return () => {
      ignore = true
    }
  }, [])

  return (
    <>
      <PageHeader title="Trainings">Upcoming trainings for your level</PageHeader>
      <p>The training list comes in FE-2.2.</p>
      <p>Backend: {message}</p>
    </>
  )
}
