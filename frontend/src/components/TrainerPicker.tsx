import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { searchUsers, type UserSummary } from '../api/users'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { TrainerChoice } from '../trainings/trainingForm'
import fieldStyles from './TextField.module.css'
import styles from './TrainerPicker.module.css'

type TrainerPickerProps = {
  value: TrainerChoice
  onChange: (value: TrainerChoice) => void
  help?: string
  error?: string
}

type Option = { key: string; label: string; detail?: string; choice: TrainerChoice }

const EXTERNAL: Option = { key: 'external', label: 'External', detail: 'Someone outside the company', choice: { kind: 'external' } }

function labelOf(value: TrainerChoice) {
  if (value.kind === 'user') return value.name
  if (value.kind === 'external') return EXTERNAL.label
  return ''
}

// A searchable select (ARIA "combobox" pattern): type to search users, pick one with the mouse or the
// arrow keys + Enter, or pick "External". Looks like Figma's Trainer select.
export function TrainerPicker({ value, onChange, help, error }: TrainerPickerProps) {
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const hint = error ?? help

  const [query, setQuery] = useState(() => labelOf(value))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [searchFailed, setSearchFailed] = useState(false)

  // Only search once typing pauses. While a choice is shown, list everyone instead of searching for its label.
  const search = useDebouncedValue(value.kind === 'none' ? query.trim() : '')

  useEffect(() => {
    if (!open) {
      return
    }
    let ignore = false
    searchUsers(search)
      .then((found) => {
        if (!ignore) {
          setUsers(found)
          setSearchFailed(false)
        }
      })
      .catch(() => !ignore && setSearchFailed(true))
    return () => {
      ignore = true
    }
  }, [open, search])

  const options: Option[] = [
    EXTERNAL,
    ...users.map((user) => ({
      key: `user-${user.id}`,
      label: user.name,
      detail: user.email,
      choice: { kind: 'user' as const, id: user.id, name: user.name },
    })),
  ]

  function choose(option: Option) {
    onChange(option.choice)
    setQuery(option.label)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setOpen(true)
      setActiveIndex((index) => (index + step + options.length) % options.length)
    } else if (event.key === 'Enter' && open) {
      // Enter picks the highlighted option instead of submitting the form.
      event.preventDefault()
      const option = options[activeIndex]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        Trainer
      </label>
      <div className={styles.wrapper}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[activeIndex] ? `${id}-${options[activeIndex].key}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          autoComplete="off"
          placeholder="Search by name or email"
          className={`${fieldStyles.input} ${styles.input} ${error ? fieldStyles.invalid : ''}`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
            // Typing changes the answer: nothing is picked until an option is chosen.
            if (value.kind !== 'none') onChange({ kind: 'none' })
          }}
          onFocus={() => setOpen(true)}
          // Closing on blur waits a moment, so a click on an option still lands.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
        <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open && (
          <ul id={listId} role="listbox" aria-label="Trainers" className={styles.list}>
            {options.map((option, index) => (
              <li
                key={option.key}
                id={`${id}-${option.key}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`${styles.option} ${index === activeIndex ? styles.active : ''}`}
                // mousedown, not click: it fires before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(option)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{option.label}</span>
                {option.detail && <span className={styles.detail}>{option.detail}</span>}
              </li>
            ))}
            {searchFailed && <li className={styles.message}>Couldn't load users</li>}
          </ul>
        )}
      </div>
      {hint && (
        <p id={hintId} className={`${fieldStyles.hint} ${error ? fieldStyles.hintError : ''}`}>
          {hint}
        </p>
      )}
    </div>
  )
}
