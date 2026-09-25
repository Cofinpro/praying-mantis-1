import { canApprove, isAdmin, type Permission } from '../auth/permissions'

// `visibleTo` hides a link from users who can't use the page. Without it, everyone sees the link.
export type InternalNavLink = { label: string; to: string; visibleTo?: Permission }
export type ExternalNavLink = { label: string; href: string | null }

// Order matches the TopBar in Figma. Profile isn't here: it's reached from the user block.
export const internalNavLinks: InternalNavLink[] = [
  { label: 'Trainings', to: '/trainings' },
  { label: 'Seats', to: '/seats' },
  { label: 'Approvals', to: '/approvals', visibleTo: canApprove },
  { label: 'Users', to: '/admin/users', visibleTo: isAdmin },
  { label: 'Reports', to: '/admin/reports', visibleTo: isAdmin },
]

// Owned by other teams. `href: null` until we know their URLs, which renders a disabled item.
export const externalNavLinks: ExternalNavLink[] = [
  { label: 'Timesheets', href: null },
  { label: 'Vacations', href: null },
]
