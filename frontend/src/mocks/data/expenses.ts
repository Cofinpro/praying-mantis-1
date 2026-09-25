import type { Expense, ExpenseCategory, ExpenseStatus } from '../../api/expenses'
import { mockAvatarUrl } from './avatars'
import { findSeedUserByEmail, findSeedUserById } from './users'

// Same rules as backend/app/services/expenses.py: team lead first, then HR (HR users and admins).
type Viewer = { id: number; is_admin: boolean }
type StoredReceipt = { id: number; filename: string; content_type: string; size: number; data: Uint8Array<ArrayBuffer> }
type Stored = Omit<Expense, 'user' | 'waiting_for' | 'lead_decision' | 'hr_decision' | 'receipts'> & {
  userId: number
  lead: { byId: number; at: string } | null
  hr: { byId: number; at: string } | null
  receipts: StoredReceipt[]
}

const store: Stored[] = []
let nextId = 1
let nextReceiptId = 1

const person = (id: number) => {
  const user = findSeedUserById(id)
  return { id, name: user?.name ?? 'Unknown', avatar_url: mockAvatarUrl(id) }
}
const leadOf = (userId: number) => {
  const email = findSeedUserById(userId)?.teamLeadEmail
  return email ? findSeedUserByEmail(email) : undefined
}
const isHrDecider = (viewer: Viewer) => viewer.is_admin || Boolean(findSeedUserById(viewer.id)?.is_hr)

function toExpense(s: Stored): Expense {
  const { userId, lead, hr, receipts, ...fields } = s
  const rejectedByLead = s.status === 'rejected' && !hr
  return {
    ...fields,
    user: person(userId),
    waiting_for: s.status === 'pending_lead' ? (leadOf(userId)?.name ?? 'Team lead') : s.status === 'pending_hr' ? 'HR' : null,
    lead_decision: lead ? { by: person(lead.byId), at: lead.at, approved: !rejectedByLead } : null,
    hr_decision: hr ? { by: person(hr.byId), at: hr.at, approved: s.status === 'approved' } : null,
    receipts: receipts.map(({ data: _data, ...r }) => r),
  }
}

const canSee = (viewer: Viewer, s: Stored) =>
  s.userId === viewer.id || leadOf(s.userId)?.id === viewer.id || s.lead?.byId === viewer.id || isHrDecider(viewer)

export const listMockMyExpenses = (viewerId: number) =>
  store.filter((s) => s.userId === viewerId).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).map(toExpense)

export function getMockExpense(viewer: Viewer, id: number) {
  const found = store.find((s) => s.id === id)
  return found && canSee(viewer, found) ? found : undefined
}

export const mockExpenseRead = toExpense

export function listMockExpenseApprovals(viewer: Viewer) {
  return store
    .filter(
      (s) =>
        (s.status === 'pending_lead' && leadOf(s.userId)?.id === viewer.id) ||
        (s.status === 'pending_hr' && isHrDecider(viewer) && s.userId !== viewer.id && s.lead?.byId !== viewer.id),
    )
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    .map(toExpense)
}

const RECEIPT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

type Fields = { title: string; description: string; category: ExpenseCategory; amount: string; spent_on: string }
type Upload = { filename: string; data: Uint8Array<ArrayBuffer> }

function invalid(field: string, type: string, msg: string) {
  return { status: 422 as const, detail: [{ type, loc: ['body', field], msg }] }
}

// POST /api/expenses (the backend's main checks; the file bytes aren't sniffed here)
export function submitMockExpense(userId: number, fields: Fields, uploads: Upload[]) {
  if (!fields.title?.trim()) return invalid('title', 'string_too_short', 'String should have at least 1 character')
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(fields.amount) || Number(fields.amount) <= 0) {
    return invalid('amount', 'decimal_parsing', 'Enter an amount like 12.50')
  }
  if (uploads.length < 1 || uploads.length > 5) return invalid('receipts', 'receipt_count', 'Add 1 to 5 receipts')
  const receipts: StoredReceipt[] = []
  for (const upload of uploads) {
    const type = RECEIPT_TYPES[upload.filename.split('.').pop()?.toLowerCase() ?? '']
    if (!type) return invalid('receipts', 'receipt_type', 'Receipts must be PDF, PNG, JPEG or WebP files')
    receipts.push({ id: nextReceiptId++, filename: upload.filename, content_type: type, size: upload.data.length, data: upload.data })
  }
  const stored: Stored = {
    id: nextId++,
    userId,
    title: fields.title.trim(),
    description: fields.description?.trim() || null,
    category: fields.category,
    amount: Number(fields.amount).toFixed(2),
    currency: 'EUR',
    spent_on: fields.spent_on,
    status: leadOf(userId) ? 'pending_lead' : 'pending_hr',
    submitted_at: new Date().toISOString(),
    lead: null,
    hr: null,
    rejection_reason: null,
    receipts,
  }
  store.push(stored)
  return { status: 201 as const, expense: toExpense(stored) }
}

// POST …/approve | reject | withdraw
export function decideMockExpense(viewer: Viewer, id: number, action: 'approve' | 'reject' | 'withdraw', reason?: string) {
  const s = getMockExpense(viewer, id)
  if (!s) return { status: 404 as const, detail: 'Expense not found' }
  const refuse = (code: string, message: string) => ({ status: 409 as const, detail: { code, message } })
  const forbid = (detail: string) => ({ status: 403 as const, detail })
  const pending = s.status === 'pending_lead' || s.status === 'pending_hr'
  const now = new Date().toISOString()

  if (action === 'withdraw') {
    if (s.userId !== viewer.id) return forbid('You can only withdraw your own expenses')
    if (!pending) return refuse('not_withdrawable', `This expense is already ${s.status}`)
    s.status = 'withdrawn'
    return { status: 200 as const, expense: toExpense(s) }
  }
  if (!pending) return refuse('not_pending', `This expense is already ${s.status}`)
  if (s.userId === viewer.id) return forbid("You can't decide your own expense")
  if (s.status === 'pending_lead' && leadOf(s.userId)?.id !== viewer.id) return forbid('Only the team lead can decide this step')
  if (s.status === 'pending_hr') {
    if (!isHrDecider(viewer)) return forbid('Only HR can decide this step')
    if (s.lead?.byId === viewer.id) {
      return refuse('second_approver_needed', 'You approved this as team lead: someone else in HR gives the second approval')
    }
  }
  if (action === 'reject') {
    if (!reason?.trim()) return invalid('reason', 'string_too_short', 'String should have at least 1 character')
    if (s.status === 'pending_lead') s.lead = { byId: viewer.id, at: now }
    else s.hr = { byId: viewer.id, at: now }
    s.status = 'rejected'
    s.rejection_reason = reason.trim()
  } else if (s.status === 'pending_lead') {
    s.lead = { byId: viewer.id, at: now }
    s.status = 'pending_hr'
  } else {
    s.hr = { byId: viewer.id, at: now }
    s.status = 'approved'
  }
  return { status: 200 as const, expense: toExpense(s) }
}

// Demo data: one expense in every state. Sofia (2) leads João (5) and Marta (6); Helena (18) is HR; Rafael (15) has no lead.
const encode = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
const day = (days: number) => daysAgo(days).toISOString().slice(0, 10)
function seed(userId: number, title: string, category: ExpenseCategory, amount: string, ago: number, status: ExpenseStatus, extra: Partial<Stored> = {}) {
  store.push({
    id: nextId++,
    userId,
    title,
    description: null,
    category,
    amount,
    currency: 'EUR',
    spent_on: day(ago + 1),
    status,
    submitted_at: daysAgo(ago).toISOString(),
    lead: null,
    hr: null,
    rejection_reason: null,
    receipts: [{ id: nextReceiptId++, filename: 'receipt.pdf', content_type: 'application/pdf', size: 24, data: encode('%PDF-1.7\nmock receipt\n') }],
    ...extra,
  })
}
seed(5, "Taxi to DKB's office", 'travel', '18.40', 1, 'pending_lead', { description: 'Client workshop, the metro was closed.' })
seed(6, 'Hotel in Frankfurt', 'accommodation', '245.00', 3, 'pending_hr', { lead: { byId: 2, at: daysAgo(2).toISOString() } })
seed(15, 'Conference ticket', 'training', '399.00', 2, 'pending_hr')
seed(5, 'Lunch with the client', 'meals', '36.50', 12, 'approved', {
  lead: { byId: 2, at: daysAgo(11).toISOString() },
  hr: { byId: 18, at: daysAgo(10).toISOString() },
})
seed(5, 'USB-C dock', 'equipment', '89.99', 20, 'rejected', {
  lead: { byId: 2, at: daysAgo(19).toISOString() },
  hr: { byId: 18, at: daysAgo(18).toISOString() },
  rejection_reason: 'Please order equipment through IT.',
})
