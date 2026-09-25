import type { CurrentUser } from '../api/auth'

// Only decide what the UI shows. The backend checks the same rules on every request (BE-1.3).
export type Permission = (user: CurrentUser) => boolean

export const isAdmin: Permission = (user) => user.is_admin

// HR gives the second approval of expenses (admins can too)
export const isHr: Permission = (user) => user.is_hr

// Team leads approve their reports. Admins approve users without a team lead (Q6 in plan.md).
// HR approves expenses, so it sees the Approvals page too.
export const canApprove: Permission = (user) => user.is_team_lead || user.is_admin || user.is_hr
