import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { reserveSeat, type Seat } from '../api/seats'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { formatDay } from '../lib/days'
import { ConfirmDialog } from './ConfirmDialog'

type ReserveSeatDialogProps = {
  // The seat being reserved, or null when the dialog is closed
  seat: Seat | null
  day: string
  // My current seat that day, if any: then this is a move
  mySeat: Seat | undefined
  onClose: () => void
}

// "Reserve DKB-03 for Tue 14 Oct?" or "Move your reservation from DKB-01 to DKB-03?", then POST.
// The mutation takes its inputs as variables (seat and day), so one mutation serves every seat click.
export function ReserveSeatDialog({ seat, day, mySeat, onClose }: ReserveSeatDialogProps) {
  const queryClient = useQueryClient()
  const reserve = useMutation({
    mutationFn: (vars: { seatId: number; day: string }) => reserveSeat(vars.seatId, vars.day),
    onSuccess: () => close(),
    onError: (error) => {
      // Someone was faster: the map is out of date, so refresh it behind the message
      if (error instanceof ApiError && error.code === 'seat_taken') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.seats(day) })
      }
    },
    // The map for that day and my reservations list both change
    onSettled: (_data, _error, vars) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.seats(vars.day) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myReservations }),
      ]),
  })

  function close() {
    reserve.reset()
    onClose()
  }

  const moving = mySeat && seat && mySeat.id !== seat.id

  return (
    <ConfirmDialog
      open={seat !== null}
      title={
        moving ? `Move your reservation from ${mySeat.label} to ${seat.label}?` : `Reserve ${seat?.label} for ${formatDay(day)}?`
      }
      confirmLabel={moving ? 'Move' : 'Reserve'}
      cancelLabel="Not now"
      confirmVariant="primary"
      busy={reserve.isPending}
      error={reserve.isError ? enrollmentErrorMessage(reserve.error) : null}
      onConfirm={() => seat && reserve.mutate({ seatId: seat.id, day })}
      onClose={close}
    >
      {moving ? `You can only have one seat per day, so ${mySeat.label} is freed for someone else.` : `In the ${seat?.zone} zone.`}
    </ConfirmDialog>
  )
}
