import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type PageHeaderProps = {
  title: string
  children?: ReactNode
  // Page-level buttons on the right, like "+ New training" (a named slot in Vue terms).
  actions?: ReactNode
}

// `children` plays the role of a Vue default slot: whatever goes between the tags shows under the title.
export function PageHeader({ title, children, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        {children && <div className={styles.subtitle}>{children}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
