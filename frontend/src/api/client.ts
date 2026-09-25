// The only module that knows where the API lives. Everything else calls the functions in src/api/*.ts.
// Later (FE-1.1) this is also where the auth token is added and 401s are handled.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// A non-2xx response. `detail` is FastAPI's error body: a string, `{ code, message }` for 409 business-rule
// conflicts, or a list of field errors for 422 validation errors.
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  // The `code` of a 409 business-rule conflict (e.g. "seat_taken"), if there is one.
  get code(): string | undefined {
    const { detail } = this
    if (typeof detail === 'object' && detail !== null && 'code' in detail && typeof detail.code === 'string') {
      return detail.code
    }
    return undefined
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// `T` is what the caller expects back. TypeScript can't check it at runtime: the response is trusted to
// match the contract, which is why the types come from the backend's OpenAPI schema (src/api/schema.d.ts).
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody: { detail?: unknown } | null = await response.json().catch(() => null)
    throw new ApiError(response.status, errorBody?.detail)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
}
