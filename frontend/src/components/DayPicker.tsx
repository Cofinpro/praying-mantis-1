import { twoWeeks } from '../lib/days'
import styles from './DayPicker.module.css'

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

type DayPickerProps = {
  value: string
  onChange: (day: string) => void
}

// Two weeks as toggle buttons. Weekends and past days are disabled (plan.md → F6).
export function DayPicker({ value, onChange }: DayPickerProps) {
  return (
    <div className={styles.picker} role="group" aria-label="Day">
      {twoWeeks().map(({ day, date, bookable }) => (
        <button
          key={day}
          type="button"
          className={`${styles.day} ${day === value ? styles.selected : ''}`}
          aria-pressed={day === value}
          disabled={!bookable}
          onClick={() => onChange(day)}
        >
          <span className={styles.weekday}>{weekday.format(date)}</span>
          <span>{dayMonth.format(date)}</span>
        </button>
      ))}
    </div>
  )
}
