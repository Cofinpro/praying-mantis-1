import { api } from './client'
import type { components } from './schema'

export type Expense = components['schemas']['ExpenseRead']
export type ExpenseStatus = components['schemas']['ExpenseStatus']
export type ExpenseCategory = components['schemas']['ExpenseCategory']
export type Receipt = components['schemas']['ReceiptRead']

// The form fields of POST /api/expenses. Amount is text ("12.50"), like everything in a form body.
export type ExpenseSubmission = {
  title: string
  description: string
  category: ExpenseCategory
  amount: string
  spent_on: string // YYYY-MM-DD
}

// multipart/form-data: the fields, plus one `receipts` part per file (1-5).
// 422 types besides field errors: spent_in_future | spent_too_long_ago | receipt_count | receipt_type | …
export function submitExpense(fields: ExpenseSubmission, receipts: File[]) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  for (const file of receipts) form.append('receipts', file, file.name)
  return api.post<Expense>('/api/expenses', form)
}

// Mine, newest first
export const listMyExpenses = () => api.get<Expense[]>('/api/me/expenses')

// The submitter, their team lead, whoever decided it, HR and admins. Anyone else gets a 404.
export const getExpense = (id: number) => api.get<Expense>(`/api/expenses/${id}`)

// Waiting for me: my reports' expenses (as team lead) and, for HR and admins, the HR step. Oldest first.
export const listExpenseApprovals = () => api.get<Expense[]>('/api/expense-approvals')

// As team lead: on to HR. As HR: approved for good. 409 not_pending | second_approver_needed.
export const approveExpense = (id: number) => api.post<Expense>(`/api/expenses/${id}/approve`)

export const rejectExpense = (id: number, reason: string) => api.post<Expense>(`/api/expenses/${id}/reject`, { reason })

// Only mine, only while it's waiting for the team lead or HR (409 not_withdrawable)
export const withdrawExpense = (id: number) => api.post<Expense>(`/api/expenses/${id}/withdraw`)

export const downloadReceipt = (expenseId: number, receiptId: number) =>
  api.blob(`/api/expenses/${expenseId}/receipts/${receiptId}/file`)
