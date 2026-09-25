import { api } from './client'

// Written by hand: the health routes have no `response_model` yet, so the generated schema.d.ts types
// their responses as `unknown`. Once they do, use `components['schemas'][...]` from './schema' instead.
export type HelloResponse = { message: string }
export type DbHealthResponse = { database: string }

export const getHello = () => api.get<HelloResponse>('/api/')

export const getDbHealth = () => api.get<DbHealthResponse>('/api/health/db')
