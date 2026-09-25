import { useId } from 'react'
import styles from './CheckboxGroup.module.css'

type CheckboxGroupProps<T extends string> = {
  legend: string
  options: { value: T; label: string }[]
  value: T[]
  onChange: (value: T[]) => void
  help?: string
  error?: string
}

// Figma "Checkbox", as a group with one label. A <fieldset> + <legend> is how HTML names a group of inputs,
// so screen readers announce "Levels, group" before each box.
// The <T extends string> makes it generic: with Level options, onChange hands back Level[].
export function CheckboxGroup<T extends string>({ legend, options, value, onChange, help, error }: CheckboxGroupProps<T>) {
  const hintId = useId()
  const hint = error ?? help

  function toggle(option: T, checked: boolean) {
    // Keep the options' order, whatever order they were clicked in.
    onChange(options.map((o) => o.value).filter((v) => (v === option ? checked : value.includes(v))))
  }

  return (
    <fieldset className={styles.group} aria-describedby={hint ? hintId : undefined} aria-invalid={error ? true : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="checkbox"
              className={styles.box}
              checked={value.includes(option.value)}
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className={`${styles.hint} ${error ? styles.hintError : ''}`}>
          {hint}
        </p>
      )}
    </fieldset>
  )
}
