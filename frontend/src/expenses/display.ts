import type { Expense, ExpenseCategory, ExpenseStatus } from '../api/expenses'

export const CATEGORIES: ExpenseCategory[] = ['travel', 'accommodation', 'meals', 'training', 'equipment', 'other']

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel: 'Travel',
  accommodation: 'Accommodation',
  meals: 'Meals',
  training: 'Training',
  equipment: 'Equipment',
  other: 'Other',
}

export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending_lead: 'Waiting for team lead',
  pending_hr: 'Waiting for HR',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

// The API sends money as a string ("1234.50") so it never passes through a float. Intl formats it for people:
// "€1,234.50". Number() is fine for display; we never do arithmetic on it.
const euros = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' })
export const formatMoney = (amount: string) => euros.format(Number(amount))

export const canWithdrawExpense = (expense: Expense, userId: number) =>
  expense.user.id === userId && (expense.status === 'pending_lead' || expense.status === 'pending_hr')
