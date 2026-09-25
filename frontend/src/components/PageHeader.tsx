import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type PageHeaderProps = {
  title: string
  children?: ReactNode
}

// `children` plays the role of a Vue default slot: whatever goes between the tags shows under the title.
export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {children && <div className={styles.subtitle}>{children}</div>}
    </header>
  )
}
