import { useId } from 'react'
import type { Seat as SeatData } from '../api/seats'
import type { SeatState } from '../seats/seatState'
import { Avatar } from './Avatar'
import styles from './Seat.module.css'
import { CheckIcon, LockIcon } from './SeatIcons'

type SeatProps = {
  seat: SeatData
  state: SeatState
  // Called for a bookable seat (FE-6.2 opens the reserve dialog)
  onSelect?: (seat: SeatData) => void
}

// A <button> per seat: focusable and announced for free. Seats that can't be clicked use aria-disabled
// rather than `disabled`, so Tab still reaches them and the "Taken by …" tooltip can be read.
export function Seat({ seat, state, onSelect }: SeatProps) {
  const tooltipId = useId()
  const clickable = state === 'free' && seat.bookable && onSelect !== undefined
  const takenBy = seat.taken_by?.name ?? 'someone'
  const label = {
    free: seat.bookable ? `${seat.label}, free` : `${seat.label}, free, can't be booked on this day`,
    taken: `${seat.label}, taken by ${takenBy}`,
    mine: `${seat.label}, your seat`,
    unavailable: `${seat.label}, another client's zone`,
  }[state]

  return (
    <span className={styles.wrapper} style={{ gridColumn: seat.pos_x + 1, gridRow: seat.pos_y + 1 }}>
      <button
        type="button"
        className={`${styles.seat} ${styles[state]}`}
        aria-label={label}
        aria-disabled={!clickable || undefined}
        // aria-pressed: "this one is selected", i.e. my seat for the day
        aria-pressed={state === 'mine'}
        aria-describedby={state === 'taken' ? tooltipId : undefined}
        onClick={() => clickable && onSelect(seat)}
      >
        {state === 'taken' && <LockIcon />}
        {state === 'mine' && <CheckIcon />}
        <span className={styles.label}>{seat.label}</span>
      </button>
      {state === 'taken' && (
        <span id={tooltipId} role="tooltip" className={styles.tooltip}>
          {seat.taken_by && <Avatar name={seat.taken_by.name} src={seat.taken_by.avatar_url} size="xs" />}
          Taken by {takenBy}
        </span>
      )}
    </span>
  )
}
