import { describe, expect, it } from 'vitest'
import { previewLsas } from './importer'
import { intakeCodes, LSA_SHEET_HEADER, lsaStatus, parseSheetDate, toSheetDate } from './lsa'
import { buildSeed } from './seed'
import type { DbState, Lsa } from './types'

const base = buildSeed()
const lsa = (p: Partial<Lsa>): Lsa => ({ id: 'l', studentId: 's', startDate: '2026-06-16', endDate: null, nextFollowUp: null, comments: '', createdBy: '', createdAt: '', updatedAt: '', updatedBy: '', ...p })

describe('sheet dates', () => {
  it('reads M/D/YYYY like the LSA sheet, and ISO dates', () => {
    expect(parseSheetDate('6/16/2026')).toBe('2026-06-16')
    expect(parseSheetDate('1/26/2027')).toBe('2027-01-26')
    expect(parseSheetDate('2026-06-09')).toBe('2026-06-09')
    expect(parseSheetDate('16/6/2026')).toBeNull()
    expect(parseSheetDate('2/30/2026')).toBeNull()
    expect(parseSheetDate('')).toBeNull()
  })
  it('writes dates back in the same format', () => {
    expect(toSheetDate('2026-06-09')).toBe('6/9/2026')
    expect(toSheetDate(null)).toBe('')
  })
})

describe('lsaStatus', () => {
  const today = '2026-09-25'
  it('classifies by end date and next follow-up', () => {
    expect(lsaStatus(lsa({ endDate: '2026-09-01' }), today)).toBe('ended')
    expect(lsaStatus(lsa({ nextFollowUp: '2026-09-20' }), today)).toBe('follow_up_overdue')
    expect(lsaStatus(lsa({ nextFollowUp: '2026-09-30' }), today)).toBe('follow_up_due')
    expect(lsaStatus(lsa({ nextFollowUp: '2027-01-26' }), today)).toBe('active')
    expect(lsaStatus(lsa({}), today)).toBe('active')
  })
})

describe('intakeCodes', () => {
  it('produces the sheet formats "Jan-26" and "UOW JAN 26"', () => {
    expect(intakeCodes(base, 'in-wlv-2601')).toEqual({ short: 'Jan-26', standard: 'UOW JAN 26' })
  })
})

describe('previewLsas', () => {
  const s = base.students.find((x) => x.status === 'active' && base.groups.find((g) => g.id === x.groupId)?.patId)!
  const db: DbState = { ...base, lsas: [] }
  it('imports a sheet shaped like PAT_LSA_RecordsSalford.csv, ignoring blank rows', () => {
    const csv = [
      LSA_SHEET_HEADER.join(','),
      `${s.uniStudentId},${s.firstName} ${s.lastName},Salford,Jan-26,Business Management,,6/16/2026,,1/26/2027,UOW JAN 26,`,
      ...Array(50).fill(',,,,,,,,,,'),
      '',
    ].join('\n')
    const p = previewLsas(db, csv)
    expect(p.missingColumns).toEqual([])
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0].data).toMatchObject({ studentId: s.id, startDate: '2026-06-16', endDate: null, nextFollowUp: '2027-01-26', comments: '' })
  })
  it('rejects bad dates and unknown students, and updates an existing LSA with the same start date', () => {
    const withLsa: DbState = { ...base, lsas: [lsa({ id: 'x', studentId: s.id, startDate: '2026-06-16' })] }
    const csv = [
      LSA_SHEET_HEADER.join(','),
      `${s.uniStudentId},,,,,,6/16/2026,,2/1/2027,,This is a new test comment!`,
      `9999999,Nobody,,,,,6/16/2026,,,,`,
      `${s.uniStudentId},,,,,,13/45/2026,,,,`,
      `${s.uniStudentId},,,,,,7/1/2026,6/1/2026,,,`,
    ].join('\n')
    const [upd, unknown, badDate, endBefore] = previewLsas(withLsa, csv).rows
    expect(upd).toMatchObject({ action: 'update' })
    expect(upd.data).toMatchObject({ existingId: 'x', nextFollowUp: '2027-02-01', comments: 'This is a new test comment!' })
    expect(unknown.errors.join()).toMatch(/not found/)
    expect(badDate.errors.join()).toMatch(/start date/)
    expect(endBefore.errors.join()).toMatch(/before the start/)
  })
})
