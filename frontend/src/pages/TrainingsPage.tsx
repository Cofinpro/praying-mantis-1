import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function TrainingsPage() {
  const [message, setMessage] = useState('Contacting backend...')

  // The hello call from the old App.tsx. FE-0.2 moves it into src/api/client.ts.
  useEffect(() => {
    fetch(`${API_URL}/api/`)
      .then((res) => res.json())
      .then((data: { message: string }) => setMessage(data.message))
      .catch(() => setMessage(`Backend unreachable at ${API_URL}`))
  }, [])

  return (
    <>
      <PageHeader title="Trainings">Upcoming trainings for your level</PageHeader>
      <p>The training list comes in FE-2.2.</p>
      <p>Backend: {message}</p>
    </>
  )
}
