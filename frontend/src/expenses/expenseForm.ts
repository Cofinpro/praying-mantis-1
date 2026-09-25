import type { ExpenseCategory, ExpenseSubmission } from '../api/expenses'
import { toDayString } from '../lib/days'

// The form's state: inputs hold strings, and the receipts are File objects from the file picker.
export type ExpenseForm = {
  title: string
  category: ExpenseCategory | ''
  amount: string
  spent_on: string
  description: string
  receipts: File[]
}

export type ExpenseField = keyof ExpenseForm
export type ExpenseErrors = Partial<Record<ExpenseField, string>>

export const MAX_RECEIPTS = 5
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
export const OLDEST_DAYS = 90
export const RECEIPT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp'
const RECEIPT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp']

export const emptyExpenseForm = (today = new Date()): ExpenseForm => ({
  title: '',
  category: '',
  amount: '',
  spent_on: toDayString(today),
  description: '',
  receipts: [],
})

// "12", "12.5" and "12.50" are fine; "12.555", "-3" and "1e3" aren't. Commas are accepted too ("12,50").
const AMOUNT = /^\d{1,5}([.,]\d{1,2})?$/

// The rules of ExpenseCreate and services/expenses.py, for fast feedback. The backend checks them again.
export function validateExpense(form: ExpenseForm, today = new Date()): ExpenseErrors {
  const errors: ExpenseErrors = {}
  const title = form.title.trim()
  if (!title) errors.title = 'Say what it was for'
  else if (title.length > 120) errors.title = 'Use at most 120 characters'

  if (!form.category) errors.category = 'Choose a category'

  const amount = form.amount.trim()
  if (!AMOUNT.test(amount)) errors.amount = 'Enter an amount like 12.50'
  else if (Number(amount.replace(',', '.')) <= 0) errors.amount = 'The amount must be more than 0'
  else if (Number(amount.replace(',', '.')) > 10000) errors.amount = 'The most you can claim at once is €10,000'

  const todayDay = toDayString(today)
  const oldest = new Date(today)
  oldest.setDate(oldest.getDate() - OLDEST_DAYS)
  // YYYY-MM-DD strings compare correctly as text
  if (!form.spent_on) errors.spent_on = 'Choose the day on the receipt'
  else if (form.spent_on > todayDay) errors.spent_on = "The date can't be in the future"
  else if (form.spent_on < toDayString(oldest)) errors.spent_on = `Expenses older than ${OLDEST_DAYS} days can't be claimed`

  if (form.description.trim().length > 1000) errors.description = 'Use at most 1000 characters'

  if (form.receipts.length === 0) errors.receipts = 'Add at least one receipt'
  else if (form.receipts.length > MAX_RECEIPTS) errors.receipts = `Add at most ${MAX_RECEIPTS} receipts`
  else {
    const wrongType = form.receipts.find((f) => !RECEIPT_EXTENSIONS.includes(f.name.split('.').pop()?.toLowerCase() ?? ''))
    const tooLarge = form.receipts.find((f) => f.size > MAX_RECEIPT_BYTES)
    if (wrongType) errors.receipts = `${wrongType.name}: receipts must be PDF, PNG, JPEG or WebP`
    else if (tooLarge) errors.receipts = `${tooLarge.name} is too large (max 5 MB)`
  }
  return errors
}

// Only call with a form that passed validateExpense().
export function toSubmission(form: ExpenseForm): ExpenseSubmission {
  const [whole, cents = ''] = form.amount.trim().replace(',', '.').split('.')
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category as ExpenseCategory,
    amount: `${whole}.${cents.padEnd(2, '0')}`, // "12,5" → "12.50": exact, no float in between
    spent_on: form.spent_on,
  }
}
