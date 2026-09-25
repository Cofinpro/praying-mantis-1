import { apiUrl } from '../api/client'
import styles from './Avatar.module.css'

type AvatarProps = {
  name: string
  // avatar_url from the API (relative), or null/undefined for the initials
  src?: string | null
  size?: 'xs' | 'sm' | 'md'
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// Decorative: the name is always shown or announced next to it, so screen readers skip the initials.
// The picture uses alt="" for the same reason.
export function Avatar({ name, src, size = 'sm' }: AvatarProps) {
  if (src) {
    return <img className={`${styles.avatar} ${styles.photo} ${styles[size]}`} src={apiUrl(src)} alt="" />
  }
  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}
