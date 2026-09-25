import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import styles from './Button.module.css'

// Figma component "Button", size md. Primary is the main action; ghost is a quiet one like "Cancel";
// danger is for destructive actions like "Cancel training".
type Variant = 'primary' | 'ghost' | 'danger'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return <button className={`${styles.button} ${styles[variant]} ${className ?? ''}`} {...props} />
}

// A link that looks like a button, for actions that go to another page ("+ New training").
export function ButtonLink({ variant = 'primary', className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${styles.button} ${styles[variant]} ${className ?? ''}`} {...props} />
}
