export type InternalNavLink = { label: string; to: string }
export type ExternalNavLink = { label: string; href: string | null }

// Order matches the TopBar in Figma. Profile isn't here: it's reached from the user block.
export const internalNavLinks: InternalNavLink[] = [
  { label: 'Trainings', to: '/trainings' },
  { label: 'Seats', to: '/seats' },
  { label: 'Approvals', to: '/approvals' },
]

// Owned by other teams. `href: null` until we know their URLs, which renders a disabled item.
export const externalNavLinks: ExternalNavLink[] = [
  { label: 'Timesheets', href: null },
  { label: 'Vacations', href: null },
]

// Placeholder until login exists (FE-1.1).
export const placeholderUser = { name: 'Bernardo Santos' }
