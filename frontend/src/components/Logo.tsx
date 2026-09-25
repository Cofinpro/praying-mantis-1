import styles from './Logo.module.css'

// Mantis mark exported from Figma (Components › Logo). It uses currentColor so CSS sets the colour.
function MantisMark() {
  return (
    <svg className={styles.mark} width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M8 3H20L14 12L8 3Z" fill="currentColor" />
      <path d="M14 12C17 16 17 22 14 26C11 22 11 16 14 12Z" fill="currentColor" />
      <path
        d="M12 14L6 10L8 5M16 14L22 10L20 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo() {
  return (
    <span className={styles.logo}>
      <MantisMark />
      <span className={styles.wordmark}>PreyingMantis</span>
    </span>
  )
}
