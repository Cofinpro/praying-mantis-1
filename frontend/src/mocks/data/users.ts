import type { CurrentUser } from '../../api/auth'
import type { UserSummary } from '../../api/users'
import { mockAvatarUrl } from './avatars'

// Mirrors backend/app/seed.py, so the same logins work with and without the backend.
export const SEED_PASSWORD = 'password123'

type SeedUser = Omit<CurrentUser, 'is_team_lead' | 'team_lead' | 'avatar_url'> & { teamLeadEmail: string | null }

const seedUsers: SeedUser[] = [
  { id: 1, name: 'Alex Admin', email: 'admin@cofinpro.pt', client: 'DBIS', level: 'senior_architect', is_admin: true, teamLeadEmail: null },
  { id: 2, name: 'Sofia Martins', email: 'sofia@cofinpro.pt', client: 'DKB', level: 'architect', is_admin: false, teamLeadEmail: null },
  { id: 3, name: 'Tiago Costa', email: 'tiago@cofinpro.pt', client: 'Deka', level: 'senior_architect', is_admin: false, teamLeadEmail: null },
  { id: 4, name: 'Inês Rocha', email: 'ines@cofinpro.pt', client: 'UNION', level: 'senior', is_admin: false, teamLeadEmail: 'tiago@cofinpro.pt' },
  { id: 5, name: 'João Silva', email: 'joao@cofinpro.pt', client: 'DKB', level: 'junior', is_admin: false, teamLeadEmail: 'sofia@cofinpro.pt' },
  { id: 6, name: 'Marta Lopes', email: 'marta@cofinpro.pt', client: 'DKB', level: 'expert', is_admin: false, teamLeadEmail: 'sofia@cofinpro.pt' },
  { id: 7, name: 'Pedro Alves', email: 'pedro@cofinpro.pt', client: 'VV', level: 'senior', is_admin: false, teamLeadEmail: 'sofia@cofinpro.pt' },
  { id: 8, name: 'Rita Gomes', email: 'rita@cofinpro.pt', client: 'DBIS', level: 'junior', is_admin: false, teamLeadEmail: 'sofia@cofinpro.pt' },
  { id: 9, name: 'Miguel Sousa', email: 'miguel@cofinpro.pt', client: 'Deka', level: 'expert', is_admin: false, teamLeadEmail: 'tiago@cofinpro.pt' },
  { id: 10, name: 'Carolina Dias', email: 'carolina@cofinpro.pt', client: 'Deka', level: 'junior', is_admin: false, teamLeadEmail: 'tiago@cofinpro.pt' },
  { id: 11, name: 'Bruno Pinto', email: 'bruno@cofinpro.pt', client: 'VV', level: 'architect', is_admin: false, teamLeadEmail: 'tiago@cofinpro.pt' },
  { id: 12, name: 'Beatriz Reis', email: 'beatriz@cofinpro.pt', client: 'UNION', level: 'expert', is_admin: false, teamLeadEmail: 'ines@cofinpro.pt' },
  { id: 13, name: 'Hugo Ferreira', email: 'hugo@cofinpro.pt', client: 'UNION', level: 'junior', is_admin: false, teamLeadEmail: 'ines@cofinpro.pt' },
  { id: 14, name: 'Laura Mendes', email: 'laura@cofinpro.pt', client: 'DBIS', level: 'senior', is_admin: false, teamLeadEmail: 'ines@cofinpro.pt' },
  { id: 15, name: 'Rafael Nunes', email: 'rafael@cofinpro.pt', client: 'VV', level: 'expert', is_admin: false, teamLeadEmail: null },
  { id: 16, name: 'Bernardo Santos', email: 'bernardo.santos@cofinpro.pt', client: 'DBIS', level: 'senior_architect', is_admin: true, teamLeadEmail: null },
  { id: 17, name: 'Diogo Santos', email: 'diogo.santos@cofinpro.pt', client: 'DBIS', level: 'senior_architect', is_admin: true, teamLeadEmail: null },
]

// Shaped like GET /api/auth/me, with is_team_lead derived the same way as on the backend.
export function toCurrentUser({ teamLeadEmail, ...user }: SeedUser): CurrentUser {
  const lead = seedUsers.find((u) => u.email === teamLeadEmail)
  return {
    ...user,
    is_team_lead: seedUsers.some((u) => u.teamLeadEmail === user.email),
    team_lead: lead ? { id: lead.id, name: lead.name } : null,
    avatar_url: mockAvatarUrl(user.id),
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

// Who decides this user's requests: their team lead, or any admin when they have none (Q6).
export function canDecideFor(decider: { id: number; email: string; is_admin: boolean }, userId: number) {
  const user = findSeedUserById(userId)
  if (!user) return false
  return user.teamLeadEmail === decider.email || (user.teamLeadEmail === null && decider.is_admin)
}
