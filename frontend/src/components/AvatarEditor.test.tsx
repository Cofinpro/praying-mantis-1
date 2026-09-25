import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderRoute, storeLoginToken } from '../test/render'

// jsdom has no createImageBitmap or canvas encoding, so the resize step is replaced by a stand-in
// that records what it got and returns a small "JPEG".
const calls = vi.hoisted(() => ({ resized: [] as File[], uploaded: [] as Blob[] }))
vi.mock('../lib/image', () => ({
  toSquareJpeg: async (file: File) => {
    calls.resized.push(file)
    return new Blob(['tiny-jpeg'], { type: 'image/jpeg' })
  },
}))

// The upload itself is replaced too: Vitest's jsdom fetch shim and MSW can't pass a multipart body
// between them (it crashes inside the test environment, not in our code). The backend tests cover the
// multipart request; here the stand-in answers like the API does: me, with a versioned avatar_url.
const upload = vi.hoisted(() => ({ reject: null as unknown }))
vi.mock('../api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auth')>()
  return {
    ...actual,
    uploadAvatar: async (image: Blob) => {
      calls.uploaded.push(image)
      if (upload.reject) throw upload.reject
      const me = await actual.getMe()
      return { ...me, avatar_url: `/api/users/${me.id}/avatar?v=1` }
    },
  }
})

afterEach(() => {
  upload.reject = null
})

const photo = new File(['a big phone photo'], 'me.png', { type: 'image/png' })

async function openProfile() {
  await storeLoginToken('bernardo.santos@cofinpro.pt')
  renderRoute('/profile')
  await screen.findByRole('heading', { name: 'Profile' })
  return userEvent.setup()
}

const details = () => within(screen.getByRole('region', { name: 'Your details' }))
// The file input is hidden; its button opens it, so tests upload into the input directly
const fileInput = () => document.querySelector<HTMLInputElement>('input[type=file]')!

describe('profile picture', () => {
  it('shows the initials and "Add photo" when there is no picture', async () => {
    await openProfile()

    expect(details().getByText('BS')).toBeInTheDocument()
    expect(details().getByRole('button', { name: 'Add photo' })).toBeInTheDocument()
    expect(details().queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('uploads a resized JPEG, then shows it on the profile and in the top bar', async () => {
    const user = await openProfile()

    await user.upload(fileInput(), photo)

    expect(await details().findByRole('button', { name: 'Change photo' })).toBeInTheDocument()
    expect(calls.resized.at(-1)).toBe(photo)
    expect(calls.uploaded.at(-1)?.type).toBe('image/jpeg')
    const pictures = document.querySelectorAll<HTMLImageElement>('img[src*="/api/users/16/avatar?v="]')
    expect(pictures).toHaveLength(2) // profile header + top bar
  })

  it('removes the picture, back to the initials', async () => {
    const user = await openProfile()
    await user.upload(fileInput(), photo)
    await details().findByRole('button', { name: 'Change photo' })

    await user.click(details().getByRole('button', { name: 'Remove' }))

    expect(await details().findByRole('button', { name: 'Add photo' })).toBeInTheDocument()
    expect(details().getByText('BS')).toBeInTheDocument()
    expect(document.querySelector('img[src*="/avatar"]')).toBeNull()
  })

  it("shows the API's reason when it refuses the file", async () => {
    upload.reject = new ApiError(422, [
      { type: 'avatar_too_large', loc: ['body', 'file'], msg: 'The image is too large (max 512 KB)' },
    ])
    const user = await openProfile()

    await user.upload(fileInput(), photo)

    expect(await details().findByRole('alert')).toHaveTextContent('The image is too large (max 512 KB)')
  })
})
