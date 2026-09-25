// Calendar days as "YYYY-MM-DD" strings in *local* time. The seat map is about office days, not instants,
// so there's no UTC here: 14 Oct is 14 Oct wherever you are. (toISOString() would shift it near midnight.)

export function toDayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// "2026-10-14" → a Date at local midnight. new Date("2026-10-14") would be UTC midnight instead.
export function fromDayString(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6

export type PickerDay = { day: string; date: Date; bookable: boolean }

// Two weeks, Monday to Sunday, starting this week. Bookable: today up to 14 days ahead, no weekends
// (plan.md → F6, Q14).
export function twoWeeks(today = new Date()): PickerDay[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const monday = new Date(start)
  monday.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const last = new Date(start)
  last.setDate(start.getDate() + 14)

  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return { day: toDayString(date), date, bookable: date >= start && date <= last && !isWeekend(date) }
  })
}

// Today, or the next weekday when today is a weekend.
export function defaultDay(today = new Date()): string {
  return twoWeeks(today).find((d) => d.bookable)?.day ?? toDayString(today)
}

const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// "Tue 14 Oct"
export const formatDay = (day: string) => longDay.format(fromDayString(day)).replace(',', '')
