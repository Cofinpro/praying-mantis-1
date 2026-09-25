import { useMutation } from '@tanstack/react-query'
import { downloadReceipt, type Receipt } from '../api/expenses'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { formatBytes } from '../lib/bytes'
import { saveFile } from '../lib/download'
import styles from './ReceiptList.module.css'

// An expense's receipts as download buttons (fetched with the login token, like training materials).
export function ReceiptList({ expenseId, receipts }: { expenseId: number; receipts: Receipt[] }) {
  const download = useMutation({
    mutationFn: async (receipt: Receipt) => saveFile(receipt.filename, await downloadReceipt(expenseId, receipt.id)),
  })

  return (
    <div>
      <ul className={styles.list} aria-label="Receipts">
        {receipts.map((receipt) => (
          <li key={receipt.id}>
            <button
              type="button"
              className={styles.receipt}
              onClick={() => download.mutate(receipt)}
              disabled={download.isPending && download.variables?.id === receipt.id}
              aria-label={`Download ${receipt.filename}`}
            >
              <span className={styles.name}>{receipt.filename}</span>
              <span className={styles.size}>{formatBytes(receipt.size)}</span>
            </button>
          </li>
        ))}
      </ul>
      {download.isError && (
        <p className={styles.error} role="alert">
          {enrollmentErrorMessage(download.error)}
        </p>
      )}
    </div>
  )
}
