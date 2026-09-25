import { useId, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.css'

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  help?: string
  // Shown instead of `help`, in red, and marks the input as invalid.
  error?: string
  // Marks the input as invalid without a message of its own, e.g. when an alert above the form explains it.
  invalid?: boolean
}

// Figma component "TextField": label, box, and help or error text under it.
export function TextField({ label, help, error, invalid = Boolean(error), ...inputProps }: TextFieldProps) {
  // useId gives a stable, unique id per instance, so the label and help text can point at the input.
  const id = useId()
  const hint = error ?? help
  const hintId = `${id}-hint`

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={`${styles.input} ${invalid ? styles.invalid : ''}`}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className={`${styles.hint} ${error ? styles.hintError : ''}`}>
          {hint}
        </p>
      )}
    </div>
  )
}
