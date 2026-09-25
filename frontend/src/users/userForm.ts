import type { UserAdmin } from '../api/adminUsers'
import type { components } from '../api/schema'

export type Client = components['schemas']['Client']
export const CLIENTS: Client[] = ['DKB', 'Deka', 'VV', 'DBIS', 'UNION']

export type UserFormValues = {
  name: string
  email: string
  client: Client
  level: UserAdmin['level']
  is_admin: boolean
  is_hr: boolean
  team_lead_id: number | null
  password: string // create only
}

export const emptyUser: UserFormValues = {
  name: '',
  email: '',
  client: 'DKB',
  level: 'junior',
  is_admin: false,
  is_hr: false,
  team_lead_id: null,
  password: '',
}

export const userToForm = (u: UserAdmin): UserFormValues => ({
  name: u.name,
  email: u.email,
  client: u.client,
  level: u.level,
  is_admin: u.is_admin,
  is_hr: u.is_hr,
  team_lead_id: u.team_lead?.id ?? null,
  password: '',
})

