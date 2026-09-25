import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import { deleteAvatar, uploadAvatar, type CurrentUser } from '../api/auth'
import { ApiError } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { toSquareJpeg } from '../lib/image'
import { Avatar } from './Avatar'
import styles from './AvatarEditor.module.css'

// The profile header's picture, with "Change photo" and "Remove". The file is shrunk to a 256 px JPEG in
// the browser first, so a 5 MB phone photo uploads as ~20 KB.
export function AvatarEditor({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  const upload = useMutation({
    mutationFn: async (file: File) => uploadAvatar(await toSquareJpeg(file)),
    // The API answers with the updated me: put it in the cache, and the TopBar's avatar changes too
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
  })
  const remove = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: () => queryClient.setQueryData<CurrentUser>(queryKeys.me, (me) => me && { ...me, avatar_url: null }),
  })

  const busy = upload.isPending || remove.isPending
  const error = upload.error ?? remove.error

  return (
    <div className={styles.editor}>
      <Avatar name={user.name} src={user.avatar_url} size="md" />
      <div className={styles.actions}>
        {/* A real <input type="file">, hidden, opened by a normal button: keyboard and screen readers work */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) upload.mutate(file)
            // Reset, so choosing the same file again still fires onChange
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className={styles.link}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-describedby={error ? errorId : undefined}
        >
          {upload.isPending ? 'Uploading…' : user.avatar_url ? 'Change photo' : 'Add photo'}
        </button>
        {user.avatar_url && (
          <button type="button" className={styles.link} onClick={() => remove.mutate()} disabled={busy}>
            {remove.isPending ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {avatarErrorMessage(error)}
        </p>
      )}
    </div>
  )
}

function avatarErrorMessage(error: Error) {
  if (error instanceof ApiError && Array.isArray(error.detail)) {
    const msg = (error.detail[0] as { msg?: unknown } | undefined)?.msg
    if (typeof msg === 'string') return msg
  }
  if (!(error instanceof ApiError)) return "Couldn't read that image. Try a JPEG or PNG."
  return "Couldn't save the photo. Try again."
}
