import type { Level } from '../api/trainings'

// In the backend's order, junior → senior architect.
export const LEVELS: { value: Level; label: string }[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'expert', label: 'Expert' },
  { value: 'senior', label: 'Senior' },
  { value: 'architect', label: 'Architect' },
  { value: 'senior_architect', label: 'Senior architect' },
]

export const levelLabel = (level: Level) => LEVELS.find((l) => l.value === level)?.label ?? level

export const isLevel = (value: string | null): value is Level => LEVELS.some((l) => l.value === value)
