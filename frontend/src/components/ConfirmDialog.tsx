import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import styles from './ConfirmDialog.module.css'

type ConfirmDialogProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  // Shown inside the dialog, e.g. a 409 from the API
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

// A native <dialog> opened with showModal(): the browser traps focus inside it, closes it on Esc,
// makes the rest of the page inert and returns focus to the button that opened it. No library needed.
export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, error, onConfirm, onClose }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // `open` is React state; the dialog's open/closed state lives in the DOM. This effect keeps them in sync,
  // which is exactly what effects are for: syncing React with something outside it.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // onClose fires on Esc too, so the parent's state follows the browser.
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Keep it
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
