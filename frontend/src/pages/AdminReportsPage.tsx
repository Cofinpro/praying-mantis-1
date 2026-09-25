import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { queryKeys } from '../api/queryClient'
import { getPeopleReport, getTrainingReport, type PersonReportRow, type TrainingReportRow } from '../api/reports'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { SelectField, TextField } from '../components/TextField'
import { downloadCsv, toCsv, type CsvColumn } from '../lib/csv'
import { formatDate, utcIsoToLocalInput } from '../lib/datetime'
import { CLIENTS } from '../users/userForm'
import { levelLabel } from '../trainings/levels'
import styles from './AdminReportsPage.module.css'

// /admin/reports: every training with its requests and ratings, and everyone with what they completed.
export function AdminReportsPage() {
  return (
    <>
      <PageHeader title="Reports">Requests, ratings and completed trainings, with a CSV download for each table</PageHeader>
      <TrainingsReport />
      <PeopleReport />
    </>
  )
}

// "2026-10-14 09:00" in local time: sorts as text and opens in Excel as a date
const csvDateTime = (iso: string | null) => (iso ? utcIsoToLocalInput(iso).replace('T', ' ') : '')

// --- trainings ---

type Totals = { trainings: number; requests: number; approvalRate: number | null; averageRating: number | null }

// Over trainings that weren't cancelled. The approval rate counts decided requests only (approved / approved + rejected),
// and the average rating weighs each training by how many people rated it.
function trainingTotals(rows: TrainingReportRow[]): Totals {
  const held = rows.filter((r) => !r.cancelled)
  const sum = (pick: (r: TrainingReportRow) => number) => held.reduce((total, r) => total + pick(r), 0)
  const approved = sum((r) => r.approved)
  const decided = approved + sum((r) => r.rejected)
  const ratings = sum((r) => r.rating_count)
  return {
    trainings: held.length,
    requests: sum((r) => r.waitlisted + r.pending + r.approved + r.rejected + r.withdrawn),
    approvalRate: decided ? Math.round((approved / decided) * 100) : null,
    averageRating: ratings ? Math.round((sum((r) => (r.average_rating ?? 0) * r.rating_count) / ratings) * 10) / 10 : null,
  }
}

const TRAINING_COLUMNS: CsvColumn<TrainingReportRow>[] = [
  { header: 'Training', value: (r) => r.name },
  { header: 'Starts', value: (r) => csvDateTime(r.starts_at) },
  { header: 'Ends', value: (r) => csvDateTime(r.ends_at) },
  { header: 'Cancelled', value: (r) => (r.cancelled ? 'yes' : 'no') },
  { header: 'Trainer', value: (r) => r.trainer },
  { header: 'Levels', value: (r) => r.levels.map(levelLabel).join(' / ') },
  { header: 'Seats', value: (r) => r.max_seats },
  { header: 'Approved', value: (r) => r.approved },
  { header: 'Pending', value: (r) => r.pending },
  { header: 'Waitlisted', value: (r) => r.waitlisted },
  { header: 'Rejected', value: (r) => r.rejected },
  { header: 'Withdrawn', value: (r) => r.withdrawn },
  { header: 'Average rating', value: (r) => r.average_rating },
  { header: 'Ratings', value: (r) => r.rating_count },
]

function TrainingsReport() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const report = useQuery({
    queryKey: queryKeys.trainingReport(from, to),
    queryFn: () => getTrainingReport({ from, to }),
    placeholderData: (previous) => previous, // keep the table while a new range loads
  })
  const totals = report.data ? trainingTotals(report.data) : null

  return (
    <section className={styles.section} aria-labelledby="trainings-report">
      <div className={styles.sectionHeader}>
        <h2 id="trainings-report" className={styles.title}>
          Trainings
        </h2>
        <div className={styles.filters}>
          <TextField label="Starts from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Until" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!report.data?.length}
            onClick={() => downloadCsv('trainings-report.csv', toCsv(TRAINING_COLUMNS, report.data ?? []))}
          >
            Download CSV
          </Button>
        </div>
      </div>

      {totals && (
        <dl className={styles.tiles}>
          <Tile label="Trainings held or planned" value={totals.trainings} />
          <Tile label="Requests" value={totals.requests} />
          <Tile label="Approval rate" value={totals.approvalRate === null ? '–' : `${totals.approvalRate}%`} />
          <Tile label="Average rating" value={totals.averageRating === null ? '–' : `★ ${totals.averageRating}`} />
        </dl>
      )}

      {report.isPending ? (
        <p className={styles.muted} role="status">
          Loading trainings…
        </p>
      ) : report.isError ? (
        <Alert title="Couldn't load the report">Check your connection and try again.</Alert>
      ) : report.data.length === 0 ? (
        <p className={styles.muted}>No trainings start in this range.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Training</th>
                <th scope="col">Starts</th>
                <th scope="col" className={styles.number}>Seats</th>
                <th scope="col" className={styles.number}>Approved</th>
                <th scope="col" className={styles.number}>Pending</th>
                <th scope="col" className={styles.number}>Waitlisted</th>
                <th scope="col" className={styles.number}>Rejected</th>
                <th scope="col" className={styles.number}>Withdrawn</th>
                <th scope="col" className={styles.number}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {report.data.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <Link to={`/trainings/${row.id}`}>{row.name}</Link>
                    <span className={styles.muted}>
                      {row.trainer}
                      {row.cancelled && ' · Cancelled'}
                    </span>
                  </th>
                  <td>{formatDate(row.starts_at)}</td>
                  <td className={styles.number}>{row.max_seats}</td>
                  <td className={styles.number}>{row.approved}</td>
                  <td className={styles.number}>{row.pending}</td>
                  <td className={styles.number}>{row.waitlisted}</td>
                  <td className={styles.number}>{row.rejected}</td>
                  <td className={styles.number}>{row.withdrawn}</td>
                  <td className={styles.number}>
                    {row.average_rating === null ? '–' : `★ ${row.average_rating} (${row.rating_count})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.tile}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// --- people ---

const PEOPLE_COLUMNS: CsvColumn<PersonReportRow>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Email', value: (r) => r.email },
  { header: 'Client', value: (r) => r.client },
  { header: 'Level', value: (r) => levelLabel(r.level) },
  { header: 'Team lead', value: (r) => r.team_lead },
  { header: 'Completed trainings', value: (r) => r.completed },
  { header: 'Hours', value: (r) => r.completed_hours },
  { header: 'Last completed', value: (r) => csvDateTime(r.last_completed_at ?? null) },
  { header: 'Upcoming', value: (r) => r.upcoming },
]

function PeopleReport() {
  const [client, setClient] = useState('')
  const report = useQuery({ queryKey: queryKeys.peopleReport, queryFn: getPeopleReport })
  // Filtering in the browser: the whole company is a few hundred rows at most
  const rows = report.data?.filter((r) => !client || r.client === client) ?? []

  return (
    <section className={styles.section} aria-labelledby="people-report">
      <div className={styles.sectionHeader}>
        <h2 id="people-report" className={styles.title}>
          People
        </h2>
        <div className={styles.filters}>
          <SelectField label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>
            {CLIENTS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <Button
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(`people-report${client ? `-${client}` : ''}.csv`, toCsv(PEOPLE_COLUMNS, rows))}
          >
            Download CSV
          </Button>
        </div>
      </div>

      {report.isPending ? (
        <p className={styles.muted} role="status">
          Loading people…
        </p>
      ) : report.isError ? (
        <Alert title="Couldn't load the report">Check your connection and try again.</Alert>
      ) : rows.length === 0 ? (
        <p className={styles.muted}>{client ? `No one works for ${client}.` : "No one here yet."}</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Client · level</th>
                <th scope="col">Team lead</th>
                <th scope="col" className={styles.number}>Completed</th>
                <th scope="col" className={styles.number}>Hours</th>
                <th scope="col">Last completed</th>
                <th scope="col" className={styles.number}>Upcoming</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.name}
                    <span className={styles.muted}>{row.email}</span>
                  </th>
                  <td>
                    {row.client} · {levelLabel(row.level)}
                  </td>
                  <td>{row.team_lead ?? '–'}</td>
                  <td className={styles.number}>{row.completed}</td>
                  <td className={styles.number}>{row.completed_hours}</td>
                  <td>{row.last_completed_at ? formatDate(row.last_completed_at) : '–'}</td>
                  <td className={styles.number}>{row.upcoming}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
