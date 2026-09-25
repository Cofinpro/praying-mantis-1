import type { Client, Seat as SeatData } from '../api/seats'
import { seatState } from '../seats/seatState'
import { Seat } from './Seat'
import styles from './SeatMap.module.css'

type SeatMapProps = {
  seats: SeatData[]
  myZone: Client
  onSelect?: (seat: SeatData) => void
}

// One card per client zone, mine first. Inside a zone, each seat sits on a CSS Grid cell from its
// pos_x / pos_y, so the layout comes from the data instead of being hard-coded.
export function SeatMap({ seats, myZone, onSelect }: SeatMapProps) {
  const zones = [...new Set(seats.map((s) => s.zone))].sort((a, b) =>
    a === myZone ? -1 : b === myZone ? 1 : a.localeCompare(b),
  )

  return (
    <div className={styles.map}>
      {zones.map((zone) => {
        const zoneSeats = seats.filter((s) => s.zone === zone)
        const columns = Math.max(...zoneSeats.map((s) => s.pos_x)) + 1
        return (
          <section key={zone} className={styles.zone} aria-label={`${zone} zone${zone === myZone ? ' (yours)' : ''}`}>
            <h2 className={styles.zoneName}>
              {zone}
              {zone === myZone && <span className={styles.yours}>Your zone</span>}
            </h2>
            <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, var(--seat-width))` }}>
              {zoneSeats.map((seat) => (
                <Seat key={seat.id} seat={seat} state={seatState(seat, myZone)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// The legend: every state with its icon or pattern and a word.
export function SeatLegend() {
  const items = [
    { state: 'free', label: 'Free' },
    { state: 'taken', label: 'Taken' },
    { state: 'mine', label: 'Yours' },
    { state: 'unavailable', label: "Another client's zone" },
  ] as const
  return (
    <ul className={styles.legend} aria-label="Legend">
      {items.map(({ state, label }) => (
        <li key={state}>
          <span className={`${styles.swatch} ${styles[state]}`} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  )
}
