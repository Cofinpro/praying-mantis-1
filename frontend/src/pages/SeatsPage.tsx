import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { queryKeys } from '../api/queryClient'
import { listSeats, type Seat } from '../api/seats'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { DayPicker } from '../components/DayPicker'
import { PageHeader } from '../components/PageHeader'
import { ReserveSeatDialog } from '../components/ReserveSeatDialog'
import { SeatLegend, SeatMap } from '../components/SeatMap'
import { defaultDay, formatDay, twoWeeks } from '../lib/days'
import styles from './SeatsPage.module.css'

export function SeatsPage() {
  const { user } = useAuth()
  // The day lives in the URL (?date=2026-10-14), like the admin's level filter: shareable and refresh-proof.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('date')
  const day = requested && twoWeeks().some((d) => d.day === requested && d.bookable) ? requested : defaultDay()

  // Keyed by day: each day is cached on its own, so going back to a day you've seen shows it at once.
  const seats = useQuery({ queryKey: queryKeys.seats(day), queryFn: () => listSeats(day) })
  const mySeat = seats.data?.find((s) => s.status === 'mine')
  const [selected, setSelected] = useState<Seat | null>(null)

  if (!user) return null

  return (
    <>
      <PageHeader title="Seats">Reserve a seat in your client's zone</PageHeader>

      <div className={styles.controls}>
        <DayPicker value={day} onChange={(next) => setSearchParams({ date: next })} />
        <SeatLegend />
      </div>

      <p className={styles.summary} aria-live="polite">
        {seats.isSuccess &&
          (mySeat ? (
            <>
              Your seat on {formatDay(day)}: <strong>{mySeat.label}</strong>
            </>
          ) : (
            <>You have no seat on {formatDay(day)} yet.</>
          ))}
      </p>

      {seats.isPending ? (
        <p className={styles.muted} role="status">
          Loading seats…
        </p>
      ) : seats.isError ? (
        <div className={styles.error}>
          <Alert title="Couldn't load the seats">Check your connection and try again.</Alert>
          <Button onClick={() => seats.refetch()}>Try again</Button>
        </div>
      ) : (
        <SeatMap seats={seats.data} myZone={user.client} onSelect={setSelected} />
      )}

      <ReserveSeatDialog seat={selected} day={day} mySeat={mySeat} onClose={() => setSelected(null)} />
    </>
  )
}
