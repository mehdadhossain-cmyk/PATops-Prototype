// Minimal .xlsx reader: sheet names and cell values (shared strings, inline strings, numbers, booleans).
// Runs entirely in the browser; nothing is uploaded anywhere.
import { strFromU8, unzipSync } from 'fflate'

export type CellValue = string | number | boolean | null

export interface ReadSheet {
  name: string
  rows: CellValue[][]
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&')

/** Text of all <t> elements inside an XML fragment (handles rich-text runs). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('')

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function readXlsx(bytes: Uint8Array): ReadSheet[] {
  const files = unzipSync(bytes)
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '')
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]))
  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1] ?? '', m[0].match(/Target="([^"]+)"/)?.[1] ?? '']))
  const sheets = [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decode(m[0].match(/name="([^"]*)"/)?.[1] ?? ''),
    rid: m[0].match(/r:id="([^"]+)"/)?.[1] ?? '',
  }))
  return sheets.map(({ name, rid }) => {
    let target = rels.get(rid) ?? ''
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = text(target)
    const rows: CellValue[][] = []
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowNum = Number(r[0].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1)
      const row: CellValue[] = []
      for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
        const type = attrs.match(/\bt="([^"]+)"/)?.[1]
        const body = c[2] ?? ''
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let value: CellValue = null
        if (type === 's' && v !== undefined) value = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') value = texts(body)
        else if (type === 'str' && v !== undefined) value = decode(v)
        else if (type === 'b' && v !== undefined) value = v === '1'
        else if (v !== undefined) value = Number(v)
        const idx = ref ? colIndex(ref) : row.length
        row[idx] = value
      }
      rows[rowNum - 1] = Array.from(row, (x) => (x === undefined ? null : x))
    }
    return { name, rows: Array.from(rows, (x) => x ?? []) }
  })
}

/** Excel serial date → ISO date (1900 date system). */
export function excelDate(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10)
}
