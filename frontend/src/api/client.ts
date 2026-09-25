// The only module that knows where the API lives. Everything else calls the functions in src/api/*.ts.
// It also owns the login token: it adds it to every request and drops it when the API answers 401.

// On mocks (the live site until FE-7.1, and `pnpm dev:mock`) calls stay on the page's own origin: MSW's
// handlers match `*/api/...` anywhere. Pointing them at http://localhost:8000 broke phones, where Chrome
// may block a public site from calling localhost before the mock service worker can answer.
const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.VITE_USE_MOCKS === 'true' ? '' : 'http://localhost:8000')

// localStorage survives refreshes and new tabs, but any script on the page can read it (XSS).
// See decisions.md → "Authentication".
const TOKEN_KEY = 'preyingmantis.token'

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

// Called after a 401 has cleared the token. AuthProvider subscribes, so the user is logged out.
let unauthorizedListener: (() => void) | null = null

export function onUnauthorized(listener: () => void) {
  unauthorizedListener = listener
  return () => {
    if (unauthorizedListener === listener) {
      unauthorizedListener = null
    }
  }
}

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

type RequestOptions = {
  // For the login call: no token is sent, and a 401 means "wrong credentials", not "logged out".
  anonymous?: boolean
}

// `T` is what the caller expects back. TypeScript can't check it at runtime: the response is trusted to
// match the contract, which is why the types come from the backend's OpenAPI schema (src/api/schema.d.ts).
async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const token = options.anonymous ? null : authToken.get()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401 && !options.anonymous) {
      authToken.clear()
      unauthorizedListener?.()
    }
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
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
}
