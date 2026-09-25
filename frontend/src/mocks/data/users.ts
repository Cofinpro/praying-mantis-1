import type { CurrentUser } from '../../api/auth'
import type { UserSummary } from '../../api/users'

// Mirrors backend/app/seed.py, so the same logins work with and without the backend.
export const SEED_PASSWORD = 'password123'

type SeedUser = Omit<CurrentUser, 'is_team_lead' | 'team_lead'> & { teamLeadEmail: string | null }

const seedUsers: SeedUser[] = [
  { id: 1, name: 'Alex Admin', email: 'admin@preyingmantis.test', client: 'DBIS', level: 'senior_architect', is_admin: true, teamLeadEmail: null },
  { id: 2, name: 'Sofia Martins', email: 'sofia@preyingmantis.test', client: 'DKB', level: 'architect', is_admin: false, teamLeadEmail: null },
  { id: 3, name: 'Tiago Costa', email: 'tiago@preyingmantis.test', client: 'Deka', level: 'senior_architect', is_admin: false, teamLeadEmail: null },
  { id: 4, name: 'Inês Rocha', email: 'ines@preyingmantis.test', client: 'UNION', level: 'senior', is_admin: false, teamLeadEmail: 'tiago@preyingmantis.test' },
  { id: 5, name: 'João Silva', email: 'joao@preyingmantis.test', client: 'DKB', level: 'junior', is_admin: false, teamLeadEmail: 'sofia@preyingmantis.test' },
  { id: 6, name: 'Marta Lopes', email: 'marta@preyingmantis.test', client: 'DKB', level: 'expert', is_admin: false, teamLeadEmail: 'sofia@preyingmantis.test' },
  { id: 7, name: 'Pedro Alves', email: 'pedro@preyingmantis.test', client: 'VV', level: 'senior', is_admin: false, teamLeadEmail: 'sofia@preyingmantis.test' },
  { id: 8, name: 'Rita Gomes', email: 'rita@preyingmantis.test', client: 'DBIS', level: 'junior', is_admin: false, teamLeadEmail: 'sofia@preyingmantis.test' },
  { id: 9, name: 'Miguel Sousa', email: 'miguel@preyingmantis.test', client: 'Deka', level: 'expert', is_admin: false, teamLeadEmail: 'tiago@preyingmantis.test' },
  { id: 10, name: 'Carolina Dias', email: 'carolina@preyingmantis.test', client: 'Deka', level: 'junior', is_admin: false, teamLeadEmail: 'tiago@preyingmantis.test' },
  { id: 11, name: 'Bruno Pinto', email: 'bruno@preyingmantis.test', client: 'VV', level: 'architect', is_admin: false, teamLeadEmail: 'tiago@preyingmantis.test' },
  { id: 12, name: 'Beatriz Reis', email: 'beatriz@preyingmantis.test', client: 'UNION', level: 'expert', is_admin: false, teamLeadEmail: 'ines@preyingmantis.test' },
  { id: 13, name: 'Hugo Ferreira', email: 'hugo@preyingmantis.test', client: 'UNION', level: 'junior', is_admin: false, teamLeadEmail: 'ines@preyingmantis.test' },
  { id: 14, name: 'Laura Mendes', email: 'laura@preyingmantis.test', client: 'DBIS', level: 'senior', is_admin: false, teamLeadEmail: 'ines@preyingmantis.test' },
  { id: 15, name: 'Rafael Nunes', email: 'rafael@preyingmantis.test', client: 'VV', level: 'expert', is_admin: false, teamLeadEmail: null },
]

// Shaped like GET /api/auth/me, with is_team_lead derived the same way as on the backend.
export function toCurrentUser({ teamLeadEmail, ...user }: SeedUser): CurrentUser {
  const lead = seedUsers.find((u) => u.email === teamLeadEmail)
  return {
    ...user,
    is_team_lead: seedUsers.some((u) => u.teamLeadEmail === user.email),
    team_lead: lead ? { id: lead.id, name: lead.name } : null,
  }
}

// Case-insensitive, like MySQL's default collation on the real `users.email` column.
export const findSeedUserByEmail = (email: string) => seedUsers.find((u) => u.email === email.toLowerCase())

export const findSeedUserById = (id: number) => seedUsers.find((u) => u.id === id)

// Like GET /api/users?search=: part of a name or email, case-insensitive, at most `limit` users.
export function searchSeedUsers(search: string, limit = 20): UserSummary[] {
  const term = search.trim().toLowerCase()
  return seedUsers
    .filter((u) => u.name.toLowerCase().includes(term) || u.email.includes(term))
    .slice(0, limit)
    .map(({ id, name, email, level }) => ({ id, name, email, level }))
}
