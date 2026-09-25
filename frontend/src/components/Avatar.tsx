import styles from './Avatar.module.css'

type AvatarProps = {
  name: string
  size?: 'sm' | 'md'
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// Decorative: the name is always shown or announced next to it, so screen readers skip the initials.
export function Avatar({ name, size = 'sm' }: AvatarProps) {
  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}
