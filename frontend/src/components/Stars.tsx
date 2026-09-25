import { useId } from 'react'
import styles from './Stars.module.css'

// "★★★★☆ 4.5 (6)". The stars are decoration; the label says it in words.
export function StarRating({ average, count }: { average: number; count: number }) {
  const rounded = Math.round(average)
  return (
    <span className={styles.rating} aria-label={`Rated ${average} out of 5 by ${count} ${count === 1 ? 'person' : 'people'}`}>
      <span aria-hidden="true" className={styles.stars}>
        {'★'.repeat(rounded)}
        <span className={styles.off}>{'★'.repeat(5 - rounded)}</span>
      </span>
      <span aria-hidden="true">
        {average.toFixed(1)} ({count})
      </span>
    </span>
  )
}

type StarInputProps = {
  value: number | null
  onChange: (value: number) => void
  legend?: string
}

// Five radio buttons that look like stars: arrow keys move between them, like any radio group.
// Each radio is named "3 stars", so screen readers don't just hear "★".
export function StarInput({ value, onChange, legend = 'Your rating' }: StarInputProps) {
  const name = useId()
  return (
    <fieldset className={styles.input}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.choices}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`${styles.choice} ${value !== null && n <= value ? styles.on : ''}`}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="visually-hidden"
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
