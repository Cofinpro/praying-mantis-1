import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { withdrawEnrollment } from '../api/enrollments'
import { queryKeys } from '../api/queryClient'
import type { TrainingSummary } from '../api/trainings'
import { canWithdraw } from '../enrollments/joinState'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

// "Withdraw" under the join button, with the same confirm-then-mutate pattern as "Cancel training".
export function WithdrawButton({ training }: { training: TrainingSummary }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const withdraw = useMutation({
    mutationFn: () => withdrawEnrollment(training.my_enrollment_id!),
    onSuccess: () => setConfirming(false),
    // My status and (for an approved seat) seats left change: refresh the detail and every list
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.trainings }),
  })

  if (!canWithdraw(training)) {
    return null
  }

  const status = training.my_enrollment_status
  const approved = status === 'approved'

  return (
    <>
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Withdraw
      </Button>
      <ConfirmDialog
        open={confirming}
        title={approved ? 'Give up your seat?' : status === 'waitlisted' ? 'Leave the waitlist?' : 'Withdraw your request?'}
        confirmLabel="Withdraw"
        busy={withdraw.isPending}
        error={withdraw.isError ? enrollmentErrorMessage(withdraw.error) : null}
        onConfirm={() => withdraw.mutate()}
        onClose={() => {
          setConfirming(false)
          withdraw.reset()
        }}
      >
        {approved
          ? `Your seat in “${training.name}” goes to the next person on the waitlist, if there is one.`
          : status === 'waitlisted'
            ? `You lose your place in line for “${training.name}”.`
            : `Your team lead won't need to decide on “${training.name}” any more.`}
      </ConfirmDialog>
    </>
  )
}
