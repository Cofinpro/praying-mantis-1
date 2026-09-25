import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import styles from './Button.module.css'

// Figma component "Button", primary variant, size md. Other variants get added when a screen needs them.
export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${styles.button} ${className ?? ''}`} {...props} />
}

// A link that looks like a button, for actions that go to another page ("+ New training").
export function ButtonLink({ className, ...props }: LinkProps) {
  return <Link className={`${styles.button} ${className ?? ''}`} {...props} />
}
