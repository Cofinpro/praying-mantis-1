import { ApiError } from '../api/client'

// Turns a 422 (FastAPI's [{loc: [..., field], msg}]) or a 409 ({code, message}) into field messages.
// `fieldFor409` says which field a business-rule code belongs to, e.g. email_taken → email.
export function apiFieldErrors(
  error: unknown,
  fieldFor409: Record<string, string> = {},
): { fields: Record<string, string>; general: string | null } {
  if (error instanceof ApiError && error.status === 422 && Array.isArray(error.detail)) {
    const fields: Record<string, string> = {}
    for (const item of error.detail as { loc?: (string | number)[]; msg?: string }[]) {
      const field = String(item.loc?.at(-1) ?? '')
      if (field && !fields[field]) fields[field] = (item.msg ?? 'Invalid').replace(/^Value error, /, '')
    }
    return { fields, general: null }
  }
  if (error instanceof ApiError && error.status === 409) {
    const detail = error.detail as { code?: string; message?: string } | undefined
    const message = detail?.message ?? 'That conflicts with the current data.'
    const field = detail?.code ? fieldFor409[detail.code] : undefined
    return field ? { fields: { [field]: message }, general: null } : { fields: {}, general: message }
  }
  return { fields: {}, general: 'Something went wrong. Try again.' }
}
