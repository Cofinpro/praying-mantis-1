import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { queryKeys } from '../api/queryClient'
import { cancelReservation, listMyReservations, type ReservationRead } from '../api/seats'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { formatDay } from '../lib/days'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './MyReservations.module.css'

// "My reservations" under the map: upcoming days, soonest first, each with Cancel (confirmed first).
export function MyReservations() {
  const queryClient = useQueryClient()
  const reservations = useQuery({ queryKey: queryKeys.myReservations, queryFn: listMyReservations })
  const [cancelling, setCancelling] = useState<ReservationRead | null>(null)

  const cancel = useMutation({
    mutationFn: (reservation: ReservationRead) => cancelReservation(reservation.id),
    onSuccess: () => setCancelling(null),
    // Two views of the same data: the list, and the map for that reservation's day (the seat turns white)
    onSettled: (_data, _error, reservation) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myReservations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seats(reservation.date) }),
      ]),
  })

  // Sorted here too, so the list is right whatever order it arrives in
  const sorted = [...(reservations.data ?? [])].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <section className={styles.section} aria-labelledby="my-reservations">
      <h2 id="my-reservations" className={styles.title}>
        My reservations
      </h2>
      {reservations.isPending ? (
        <p className={styles.muted}>Loading…</p>
      ) : reservations.isError ? (
        <p className={styles.muted}>Couldn't load your reservations.</p>
      ) : sorted.length === 0 ? (
        <p className={styles.muted}>No upcoming reservations. Pick a free seat on the map.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((reservation) => (
            <li key={reservation.id} className={styles.item}>
              <span>
                <strong>{formatDay(reservation.date)}</strong> · {reservation.seat.label}
              </span>
              <Button
                variant="ghost"
                aria-label={`Cancel ${reservation.seat.label} on ${formatDay(reservation.date)}`}
                onClick={() => setCancelling(reservation)}
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title={cancelling ? `Cancel ${cancelling.seat.label} on ${formatDay(cancelling.date)}?` : ''}
        confirmLabel="Cancel reservation"
        busy={cancel.isPending}
        error={cancel.isError ? enrollmentErrorMessage(cancel.error) : null}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
        onClose={() => {
          setCancelling(null)
          cancel.reset()
        }}
      >
        The seat becomes free for someone else.
      </ConfirmDialog>
    </section>
  )
}
