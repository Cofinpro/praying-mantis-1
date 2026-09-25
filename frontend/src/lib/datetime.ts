// <input type="datetime-local"> gives "2026-10-14T09:00": a wall-clock time with no zone.
// `new Date()` reads that format as *local* time, so toISOString() turns it into UTC ("…T07:00:00.000Z"
// in Lisbon summer time). Careful: a date-only string ("2026-10-14") is read as UTC midnight instead.
export function localInputToUtcIso(value: string): string {
  return new Date(value).toISOString()
}

// Intl.DateTimeFormat formats in the browser's time zone, so UTC from the API shows as local time.
// en-GB gives "Tue 14 Oct 2026" and a 24-hour clock, as in Figma. Created once: building one is slow.
const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

// "Tue 14 Oct 2026 · 09:00–12:00", or both days when a training runs past midnight.
export function formatTrainingTime(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const startDay = dayFormat.format(start).replace(',', '')
  const endDay = dayFormat.format(end).replace(',', '')
  if (startDay === endDay) {
    return `${startDay} · ${timeFormat.format(start)}–${timeFormat.format(end)}`
  }
  return `${startDay} · ${timeFormat.format(start)} – ${endDay} · ${timeFormat.format(end)}`
}
