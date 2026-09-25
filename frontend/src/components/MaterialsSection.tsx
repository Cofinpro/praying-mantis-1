import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { deleteMaterial, downloadMaterial, listMaterials, uploadMaterial, type Material } from '../api/materials'
import { queryKeys } from '../api/queryClient'
import type { TrainingSummary } from '../api/trainings'
import { isAdmin } from '../auth/permissions'
import { useAuth } from '../auth/useAuth'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { formatDateTime } from '../lib/datetime'
import { saveFile } from '../lib/download'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './MaterialsSection.module.css'

// The same list as FILE_TYPES in backend/app/services/materials.py. `accept` only filters the file picker:
// the backend checks the extension and the file's first bytes again.
const ACCEPT = '.pdf,.pptx,.docx,.xlsx,.zip,.png,.jpg,.jpeg,.txt,.md'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const fileType = (filename: string) => filename.split('.').pop()?.toUpperCase() ?? ''

// A 422 names the problem in its first error's msg ("The file is too large (max 10 MB)"); 409s have a code.
function errorMessage(error: unknown): string {
  if (error instanceof ApiError && Array.isArray(error.detail)) {
    const first = error.detail[0] as { msg?: unknown } | undefined
    if (typeof first?.msg === 'string') return first.msg
  }
  return enrollmentErrorMessage(error)
}

// Slides, exercises… on the training detail page. Admins and the trainer add and remove files.
export function MaterialsSection({ training }: { training: TrainingSummary }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<Material | null>(null)
  const canManage = Boolean(user && (isAdmin(user) || training.trainer?.id === user.id))
  const key = queryKeys.trainingMaterials(training.id)

  const materials = useQuery({ queryKey: key, queryFn: () => listMaterials(training.id) })
  const upload = useMutation({
    mutationFn: (file: File) => uploadMaterial(training.id, file),
    // Add the new file to the cached list: no refetch needed
    onSuccess: (added) => queryClient.setQueryData<Material[]>(key, (list) => [...(list ?? []), added]),
  })
  const download = useMutation({
    mutationFn: async (material: Material) => saveFile(material.filename, await downloadMaterial(training.id, material.id)),
  })
  const remove = useMutation({
    mutationFn: (material: Material) => deleteMaterial(training.id, material.id),
    onSuccess: (_, material) => {
      queryClient.setQueryData<Material[]>(key, (list) => list?.filter((m) => m.id !== material.id))
      setDeleting(null)
    },
  })

  if (!materials.isSuccess) return null
  // Nothing to download and nothing to add: keep the page quiet
  if (materials.data.length === 0 && !canManage) return null

  const error = upload.error ?? download.error

  return (
    <section className={styles.section} aria-labelledby="materials-heading">
      <div className={styles.header}>
        <h2 id="materials-heading" className={styles.title}>
          Materials
        </h2>
        {canManage && !training.cancelled && (
          <>
            {/* A real <input type="file">, hidden, opened by a normal button (like AvatarEditor) */}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="material-input"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) upload.mutate(file)
                event.target.value = '' // so choosing the same file again still fires onChange
              }}
            />
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? 'Uploading…' : '+ Add file'}
            </Button>
          </>
        )}
      </div>

      {canManage && <p className={styles.muted}>PDF, slides, documents, spreadsheets, ZIP, images or text, up to 10 MB each.</p>}

      {error && (
        <p className={styles.error} role="alert">
          {errorMessage(error)}
        </p>
      )}

      {materials.data.length === 0 ? (
        <p className={styles.muted}>No files yet.</p>
      ) : (
        <ul className={styles.list} aria-label="Materials">
          {materials.data.map((material) => (
            <li key={material.id} className={styles.row}>
              <span className={styles.type} aria-hidden="true">
                {fileType(material.filename)}
              </span>
              <div className={styles.file}>
                <span className={styles.name}>{material.filename}</span>
                <span className={styles.muted}>
                  {formatBytes(material.size)} · {formatDateTime(material.created_at)}
                  {material.uploaded_by && ` · ${material.uploaded_by.name}`}
                </span>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => download.mutate(material)}
                  disabled={download.isPending && download.variables?.id === material.id}
                  aria-label={`Download ${material.filename}`}
                >
                  Download
                </Button>
                {canManage && (
                  <Button variant="ghost" onClick={() => setDeleting(material)} aria-label={`Delete ${material.filename}`}>
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this file?"
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : null}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => {
          setDeleting(null)
          remove.reset()
        }}
      >
        {deleting && `“${deleting.filename}” is removed for everyone.`}
      </ConfirmDialog>
    </section>
  )
}
