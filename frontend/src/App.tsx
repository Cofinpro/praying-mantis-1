import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [message, setMessage] = useState('Contacting backend...')

  useEffect(() => {
    fetch(`${API_URL}/api/`)
      .then((res) => res.json())
      .then((data: { message: string }) => setMessage(data.message))
      .catch(() => setMessage(`Backend unreachable at ${API_URL}`))
  }, [])

  return (
    <main>
      <h1>Hello World</h1>
      <p>{message}</p>
    </main>
  )
}

export default App
