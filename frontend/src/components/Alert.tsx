import type { ReactNode } from 'react'
import styles from './Alert.module.css'

type AlertProps = {
  title: string
  children?: ReactNode
}

// Figma component "Alert", error variant. role="alert" makes screen readers announce it when it appears.
export function Alert({ title, children }: AlertProps) {
  return (
    <div role="alert" className={styles.alert}>
      <svg className={styles.icon} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path d="M10 6V10.5M10 13.5V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.message}>{children}</p>}
      </div>
    </div>
  )
}
