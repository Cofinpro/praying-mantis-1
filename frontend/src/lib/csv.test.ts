import { describe, expect, it } from 'vitest'
import { toCsv, type CsvColumn } from './csv'

type Row = { name: string; seats: number | null }
const columns: CsvColumn<Row>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Seats', value: (r) => r.seats },
]

describe('toCsv', () => {
  it('writes a header and one line per row, with CRLF line ends', () => {
    expect(toCsv(columns, [{ name: 'Git basics', seats: 2 }, { name: 'Docker', seats: null }])).toBe(
      'Name,Seats\r\nGit basics,2\r\nDocker,',
    )
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv(columns, [{ name: 'Silva, João "JS"\nDKB', seats: 1 }])).toBe('Name,Seats\r\n"Silva, João ""JS""\nDKB",1')
  })

  it('turns text that a spreadsheet would run as a formula into plain text', () => {
    const csv = toCsv(columns, [{ name: '=HYPERLINK("http://evil")', seats: -1 }, { name: '@SUM(A1)', seats: 0 }])

    expect(csv).toBe(`Name,Seats\r\n"'=HYPERLINK(""http://evil"")",-1\r\n'@SUM(A1),0`)
  })
})
