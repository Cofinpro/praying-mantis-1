import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { PersonReportRow, TrainingReportRow } from '../api/reports'
import { downloadCsv } from '../lib/csv'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// The real toCsv, but no file is saved: jsdom has no downloads
vi.mock('../lib/csv', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/csv')>()), downloadCsv: vi.fn() }))

const training = (fields: Partial<TrainingReportRow>): TrainingReportRow => ({
  id: 1,
  name: 'Docker',
  starts_at: '2026-09-10T08:00:00Z',
  ends_at: '2026-09-10T11:00:00Z',
  cancelled: false,
  trainer: 'Tiago Rocha',
  levels: ['junior'],
  max_seats: 10,
  waitlisted: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  withdrawn: 0,
  average_rating: null,
  rating_count: 0,
  ...fields,
})

const trainings = [
  training({ id: 1, name: 'Docker', approved: 3, rejected: 1, average_rating: 5, rating_count: 1 }),
  training({ id: 2, name: 'Agile', approved: 3, pending: 2, waitlisted: 1, withdrawn: 1, average_rating: 3, rating_count: 3 }),
  training({ id: 3, name: 'Kubernetes', cancelled: true, approved: 4, rejected: 4 }),
]

const person = (fields: Partial<PersonReportRow>): PersonReportRow => ({
  id: 5,
  name: 'João Silva',
  email: 'joao@cofinpro.pt',
  client: 'DKB',
  level: 'junior',
  team_lead: 'Sofia Martins',
  completed: 2,
  completed_hours: 4.5,
  last_completed_at: '2026-09-10T11:00:00Z',
  upcoming: 1,
  ...fields,
})

const people = [person({}), person({ id: 10, name: 'Carolina Dias', email: 'carolina@cofinpro.pt', client: 'Deka', team_lead: 'Tiago Rocha', completed: 0, completed_hours: 0, last_completed_at: null, upcoming: 0 })]

async function openReports() {
  const ranges: string[] = []
  server.use(
    http.get('*/api/admin/reports/trainings', ({ request }) => {
      ranges.push(new URL(request.url).search)
      return HttpResponse.json(trainings)
    }),
    http.get('*/api/admin/reports/people', () => HttpResponse.json(people)),
  )
  await storeLoginToken('admin@cofinpro.pt')
  renderRoute('/admin/reports')
  await screen.findByRole('cell', { name: '★ 5 (1)' })
  return ranges
}

describe('admin reports', () => {
  it('sums up the trainings that were not cancelled', async () => {
    await openReports()

    const tile = (label: string) => screen.getByText(label).nextElementSibling
    expect(tile('Trainings held or planned')).toHaveTextContent('2')
    expect(tile('Requests')).toHaveTextContent('11') // 4 for Docker, 7 for Agile
    expect(tile('Approval rate')).toHaveTextContent('86%') // 6 approved of 7 decided
    expect(tile('Average rating')).toHaveTextContent('★ 3.5') // (5×1 + 3×3) / 4 ratings
  })

  it('lists each training with its requests by status', async () => {
    await openReports()
    const table = screen.getByRole('region', { name: 'Trainings' })

    const agile = within(table).getByRole('row', { name: /Agile/ })
    expect(within(agile).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Thu 10 Sept 2026', '10', '3', '2', '1', '0', '1', '★ 3 (3)'])
    expect(within(table).getByRole('row', { name: /Kubernetes/ })).toHaveTextContent('Cancelled')
  })

  it('asks the API for the chosen start days', async () => {
    const ranges = await openReports()

    await userEvent.type(screen.getByLabelText('Starts from'), '2026-09-01')
    await userEvent.type(screen.getByLabelText('Until'), '2026-09-30')

    await vi.waitFor(() => expect(ranges.at(-1)).toBe('?from=2026-09-01&to=2026-09-30'))
  })

  it('filters people by client and downloads what is shown', async () => {
    await openReports()
    const section = screen.getByRole('region', { name: 'People' })

    await userEvent.selectOptions(within(section).getByLabelText('Client'), 'DKB')
    await userEvent.click(within(section).getByRole('button', { name: 'Download CSV' }))

    expect(within(section).queryByText('Carolina Dias')).not.toBeInTheDocument()
    expect(downloadCsv).toHaveBeenCalledWith(
      'people-report-DKB.csv',
      'Name,Email,Client,Level,Team lead,Completed trainings,Hours,Last completed,Upcoming\r\n' +
        'João Silva,joao@cofinpro.pt,DKB,Junior,Sofia Martins,2,4.5,2026-09-10 12:00,1',
    )
  })
})
