import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

// Figma component "Button", primary variant, size md. Other variants get added when a screen needs them.
export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${styles.button} ${className ?? ''}`} {...props} />
}
