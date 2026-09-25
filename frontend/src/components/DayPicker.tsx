import { formatDay, twoWeeks } from '../lib/days'
import styles from './DayPicker.module.css'

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const dayOfMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric' })
const month = new Intl.DateTimeFormat('en-GB', { month: 'short' })

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
          // The three lines would read as "Mon12Oct"; say it properly
          aria-label={formatDay(day)}
          disabled={!bookable}
          onClick={() => onChange(day)}
        >
          {/* Three short lines, so seven days fit side by side on a phone */}
          <span className={styles.weekday}>{weekday.format(date)}</span>
          <span className={styles.date}>{dayOfMonth.format(date)}</span>
          <span className={styles.weekday}>{month.format(date)}</span>
        </button>
      ))}
    </div>
  )
}
