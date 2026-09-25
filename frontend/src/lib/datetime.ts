// <input type="datetime-local"> gives "2026-10-14T09:00": a wall-clock time with no zone.
// `new Date()` reads that format as *local* time, so toISOString() turns it into UTC ("…T07:00:00.000Z"
// in Lisbon summer time). Careful: a date-only string ("2026-10-14") is read as UTC midnight instead.
export function localInputToUtcIso(value: string): string {
  return new Date(value).toISOString()
}
