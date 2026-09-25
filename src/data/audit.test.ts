import { strFromU8, unzipSync } from 'fflate'
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditReportHtml, auditWorkbook } from '../lib/auditExport'
import { buildAuditPack } from './audit'
import { buildSeed } from './seed'

const db = buildSeed()
const pat = db.users.find((u) => u.name === 'Sofia Rahman')!
const admin = db.users.find((u) => u.role === 'admin')!

describe('buildAuditPack', () => {
  const pack = buildAuditPack(db, pat.id, { from: null, to: null }, admin.id)
  it('covers every area of the PAT’s work', () => {
    expect(pack.sections.map((s) => s.id)).toEqual(['training', 'groups', 'call-log', 'wellbeing', 'retention', 'non-submissions', 'lsa', 'lsa-history', 'leave', 'cover', 'tasks', 'activity'])
    expect(pack.sections.find((s) => s.id === 'call-log')!.rows.length).toBe(db.comms.filter((c) => c.authorId === pat.id).length)
    for (const s of pack.sections) for (const r of s.rows) expect(r).toHaveLength(s.columns.length)
  })
  it('limits dated records to the chosen range', () => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const recent = buildAuditPack(db, pat.id, { from, to: null }, admin.id)
    const all = pack.sections.find((s) => s.id === 'call-log')!.rows.length
    const some = recent.sections.find((s) => s.id === 'call-log')!.rows.length
    expect(some).toBeGreaterThan(0)
    expect(some).toBeLessThan(all)
  })
})

describe('exports', () => {
  const pack = buildAuditPack(db, pat.id, { from: null, to: null }, admin.id)
  it('writes a workbook with a summary tab and one tab per section', () => {
    const bytes = auditWorkbook(db, pack)
    const files = unzipSync(bytes)
    const wb = strFromU8(files['xl/workbook.xml'])
    expect(wb).toContain('name="Summary"')
    expect(wb).toContain('name="Call log"')
    expect(Object.keys(files).filter((f) => f.startsWith('xl/worksheets/')).length).toBe(pack.sections.length + 1)
    if (process.env.AUDIT_XLSX_OUT) writeFileSync(process.env.AUDIT_XLSX_OUT, bytes)
  })
  it('escapes content in the HTML report', () => {
    const evil = { ...pack, facts: [['Name', '<script>alert(1)</script>']] as [string, string][] }
    const html = auditReportHtml(db, evil)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
