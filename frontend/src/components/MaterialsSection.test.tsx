import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { uploadMaterial, type Material } from '../api/materials'
import type { TrainingRead } from '../api/trainings'
import { saveFile } from '../lib/download'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// jsdom has no downloads, and its fetch can't send multipart bodies through MSW: stub both ends
vi.mock('../lib/download', () => ({ saveFile: vi.fn() }))
vi.mock('../api/materials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/materials')>()),
  uploadMaterial: vi.fn(),
}))

const training: TrainingRead = {
  id: 12,
  name: 'React Basics',
  description: 'Hooks, state and effects.',
  starts_at: '2030-10-15T08:00:00Z',
  ends_at: '2030-10-15T11:00:00Z',
  levels: ['junior'],
  trainer: { id: 2, name: 'Sofia Martins' }, // Sofia (id 2) trains it
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 4,
  rating_count: 0,
  cancelled: false,
  my_enrollment_status: null,
}

const slides: Material = {
  id: 1,
  filename: 'Slides.pdf',
  content_type: 'application/pdf',
  size: 2_500_000,
  uploaded_by: { id: 2, name: 'Sofia Martins' },
  created_at: '2030-10-01T10:00:00Z',
}

let files: Material[]

beforeEach(() => {
  files = [slides]
  server.use(
    http.get('*/api/trainings/:id', () => HttpResponse.json(training)),
    http.get('*/api/trainings/:id/materials', () => HttpResponse.json(files)),
    http.get('*/api/trainings/:id/materials/:materialId/file', () =>
      HttpResponse.text('%PDF-1.7 slides', { headers: { 'Content-Type': 'application/pdf' } }),
    ),
    http.delete('*/api/trainings/:id/materials/:materialId', ({ params }) => {
      files = files.filter((f) => f.id !== Number(params.materialId))
      return new HttpResponse(null, { status: 204 })
    }),
  )
})

async function openAs(email: string) {
  await storeLoginToken(email)
  renderRoute('/trainings/12')
  return screen.findByRole('region', { name: 'Materials' })
}

describe('training materials', () => {
  it('lets participants download the files, but not change them', async () => {
    const section = await openAs('joao@cofinpro.pt')

    expect(within(section).getByText('Slides.pdf')).toBeInTheDocument()
    expect(within(section).getByText(/2\.4 MB/)).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: '+ Add file' })).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: 'Delete Slides.pdf' })).not.toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'Download Slides.pdf' }))

    await vi.waitFor(() => expect(saveFile).toHaveBeenCalled())
    const [filename, blob] = vi.mocked(saveFile).mock.calls[0]
    expect(filename).toBe('Slides.pdf')
    expect(await blob.text()).toBe('%PDF-1.7 slides') // the file's bytes, fetched with the login token
  })

  it('shows nothing to participants when there are no files', async () => {
    files = []
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/trainings/12')
    await screen.findByRole('heading', { name: 'React Basics' })

    expect(screen.queryByRole('region', { name: 'Materials' })).not.toBeInTheDocument()
  })

  it('lets the trainer add a file', async () => {
    const added: Material = { ...slides, id: 2, filename: 'Exercises.zip', size: 800 }
    vi.mocked(uploadMaterial).mockResolvedValueOnce(added)
    const section = await openAs('sofia@cofinpro.pt')

    await userEvent.upload(within(section).getByTestId('material-input'), new File(['PK'], 'Exercises.zip'))

    expect(uploadMaterial).toHaveBeenCalledWith(12, expect.objectContaining({ name: 'Exercises.zip' }))
    expect(await within(section).findByText('Exercises.zip')).toBeInTheDocument()
    expect(within(section).getByText(/800 B/)).toBeInTheDocument()
  })

  it("says why a file wasn't accepted", async () => {
    vi.mocked(uploadMaterial).mockRejectedValueOnce(
      new ApiError(422, [{ type: 'material_too_large', loc: ['body', 'file'], msg: 'The file is too large (max 10 MB)' }]),
    )
    const section = await openAs('sofia@cofinpro.pt')

    await userEvent.upload(within(section).getByTestId('material-input'), new File(['x'], 'Recording.pdf'))

    expect(await within(section).findByRole('alert')).toHaveTextContent('The file is too large (max 10 MB)')
  })

  it('lets an admin delete a file after confirming', async () => {
    const section = await openAs('admin@cofinpro.pt')

    await userEvent.click(within(section).getByRole('button', { name: 'Delete Slides.pdf' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this file?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(section).findByText('No files yet.')).toBeInTheDocument()
  })
})
