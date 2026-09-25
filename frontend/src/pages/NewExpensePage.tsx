import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { submitExpense } from '../api/expenses'
import { queryKeys } from '../api/queryClient'
import { Alert } from '../components/Alert'
import { BackLink } from '../components/BackLink'
import { Button, ButtonLink } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { SelectField, TextArea, TextField } from '../components/TextField'
import { CATEGORIES, CATEGORY_LABELS } from '../expenses/display'
import {
  emptyExpenseForm,
  MAX_RECEIPTS,
  RECEIPT_ACCEPT,
  toSubmission,
  validateExpense,
  type ExpenseErrors,
  type ExpenseForm,
} from '../expenses/expenseForm'
import { formatBytes } from '../lib/bytes'
import { toDayString } from '../lib/days'
import { apiFieldErrors } from '../users/fieldErrors'
import styles from './NewExpensePage.module.css'

// /expenses/new: what, how much, when, and the receipts. On success, opens the new expense.
export function NewExpensePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ExpenseForm>(() => emptyExpenseForm())
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useMutation({
    mutationFn: () => submitExpense(toSubmission(form), form.receipts),
    onSuccess: async (expense) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.expenses })
      navigate(`/expenses/${expense.id}`)
    },
    // A 422 from the backend goes next to its field (the API's field names are the form's names)
    onError: (error) => setErrors(apiFieldErrors(error).fields as ExpenseErrors),
  })
  const general = submit.isError ? apiFieldErrors(submit.error).general : null

  function set<K extends keyof ExpenseForm>(field: K, value: ExpenseForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    // The message was about the old value: drop it until the next submit checks again
    setErrors(({ [field]: _fixed, ...rest }) => rest)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validateExpense(form)
    setErrors(found)
    if (Object.keys(found).length === 0) submit.mutate()
  }

  return (
    <div className={styles.page}>
      <div>
        <BackLink to="/expenses">All expenses</BackLink>
        <PageHeader title="New expense">Your team lead approves it first, then HR. You're told at each step.</PageHeader>
      </div>

      {general && <Alert title="Could not send the expense">{general}</Alert>}

      <form id="expense-form" className={styles.card} onSubmit={handleSubmit} noValidate>
        <TextField
          label="What was it for?"
          placeholder="Taxi to the client's office"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <div className={styles.row}>
          <SelectField label="Category" value={form.category} onChange={(e) => set('category', e.target.value as ExpenseForm['category'])}>
            <option value="" disabled>
              Choose…
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Amount (€)"
            inputMode="decimal"
            placeholder="12.50"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            error={errors.amount}
          />
          <TextField
            label="Date on the receipt"
            type="date"
            max={toDayString(new Date())}
            value={form.spent_on}
            onChange={(e) => set('spent_on', e.target.value)}
            error={errors.spent_on}
          />
        </div>
        {errors.category && (
          <p className={styles.error} role="alert">
            {errors.category}
          </p>
        )}
        <TextArea
          label="Details (optional)"
          rows={3}
          placeholder="Who you met, why it was needed…"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          error={errors.description}
        />

        <fieldset className={styles.receipts}>
          <legend className={styles.legend}>Receipts</legend>
          <p className={styles.muted}>PDF or a photo (PNG, JPEG, WebP), up to 5 MB each, {MAX_RECEIPTS} at most.</p>
          {form.receipts.length > 0 && (
            <ul className={styles.files} aria-label="Chosen receipts">
              {form.receipts.map((file, index) => (
                // name + size + index: two files can share a name; the list only changes by the buttons below
                <li key={`${file.name}-${file.size}-${index}`} className={styles.file}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.muted}>{formatBytes(file.size)}</span>
                  <Button
                    variant="ghost"
                    onClick={() => set('receipts', form.receipts.filter((_, i) => i !== index))}
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={RECEIPT_ACCEPT}
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="receipt-input"
            onChange={(event) => {
              const chosen = Array.from(event.target.files ?? [])
              set('receipts', [...form.receipts, ...chosen])
              event.target.value = ''
            }}
          />
          <div>
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={form.receipts.length >= MAX_RECEIPTS}>
              + Add receipts
            </Button>
          </div>
          {errors.receipts && (
            <p className={styles.error} role="alert">
              {errors.receipts}
            </p>
          )}
        </fieldset>
      </form>

      <div className={styles.actions}>
        <ButtonLink to="/expenses" variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" form="expense-form" disabled={submit.isPending}>
          {submit.isPending ? 'Sending…' : 'Send for approval'}
        </Button>
      </div>
    </div>
  )
}
