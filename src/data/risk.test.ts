import { describe, expect, it } from 'vitest'
import { parsePercent, previewAttendance } from './importer'
import { attendanceSummary, retentionStage, riskRows, teachingWeek } from './risk'
import { buildSeed } from './seed'
import type { AttendanceRecord, DbState } from './types'

const base = buildSeed()
const pat = base.users.find((u) => u.role === 'pat' && u.status === 'active' && base.groups.some((g) => g.patId === u.id))!
const group = base.groups.find((g) => g.patId === pat.id)!
const [s1, s2] = base.students.filter((s) => s.groupId === group.id && s.status === 'active')
const rec = (studentId: string, weekEnding: string, overall: number): AttendanceRecord => ({ studentId, weekEnding, overall })
const withAtt = (attendance: AttendanceRecord[], extra: Partial<DbState> = {}): DbState => ({ ...base, attendance, riskNotes: [], comms: [], ...extra })

describe('attendanceSummary', () => {
  it('reports current, change, weeks below and newly at risk', () => {
    const db = withAtt([rec(s1.id, '2026-09-04', 70), rec(s1.id, '2026-09-11', 64), rec(s1.id, '2026-09-18', 60)])
    expect(attendanceSummary(db, s1.id)).toMatchObject({ current: 60, previous: 64, change: -4, weeksBelow: 2, atRisk: true, newlyAtRisk: false })
    const db2 = withAtt([rec(s1.id, '2026-09-11', 66), rec(s1.id, '2026-09-18', 64.9)])
    expect(attendanceSummary(db2, s1.id)).toMatchObject({ atRisk: true, newlyAtRisk: true, weeksBelow: 1 })
  })
  it('treats exactly 65% as not at risk', () => {
    expect(attendanceSummary(withAtt([rec(s1.id, '2026-09-18', 65)]), s1.id).atRisk).toBe(false)
  })
})

describe('riskRows', () => {
  it('lists students below threshold, and open cases that recovered', () => {
    const db = withAtt([rec(s1.id, '2026-09-18', 50), rec(s2.id, '2026-09-18', 80)], {
      riskNotes: [{ id: 'n', studentId: s2.id, authorId: pat.id, at: '2026-09-10T10:00:00Z', text: 'x', stage: 'action_plan' }],
    })
    const { atRisk, recovering } = riskRows(db, pat, new Date('2026-09-25T12:00:00Z'))
    expect(atRisk.map((r) => r.student.id)).toEqual([s1.id])
    expect(atRisk[0].noRecentAction).toBe(true)
    expect(recovering.map((r) => r.student.id)).toEqual([s2.id])
  })
  it('uses the latest stage change', () => {
    const db = withAtt([], {
      riskNotes: [
        { id: 'a', studentId: s1.id, authorId: pat.id, at: '2026-09-01T10:00:00Z', text: 'x', stage: 'pat_contacted' },
        { id: 'b', studentId: s1.id, authorId: pat.id, at: '2026-09-05T10:00:00Z', text: 'y', stage: 'admin_review' },
        { id: 'c', studentId: s1.id, authorId: pat.id, at: '2026-09-06T10:00:00Z', text: 'z', stage: null },
      ],
    })
    expect(retentionStage(db, s1.id)).toBe('admin_review')
  })
})

describe('attendance import', () => {
  it('parses percentages in common formats', () => {
    expect(parsePercent('72')).toBe(72)
    expect(parsePercent('72.46%')).toBe(72.5)
    expect(parsePercent('0.72')).toBe(72)
    expect(parsePercent('120')).toBeNull()
    expect(parsePercent('n/a')).toBeNull()
  })
  it('flags students crossing the threshold versus the previous week', () => {
    const db = withAtt([rec(s1.id, '2026-09-18', 70), rec(s2.id, '2026-09-18', 60)])
    const csv = `EBS Person Code,Attendance %\n${s1.ebsPersonCode},62%\n${s2.ebsPersonCode},66%\n0000,50%`
    const [a, b, c] = previewAttendance(db, csv, 65, '2026-09-25').rows
    expect(a.warnings.join()).toMatch(/Falls below 65%/)
    expect(b.warnings.join()).toMatch(/Back above 65%/)
    expect(c.errors.join()).toMatch(/not found/)
  })
  it('compares a re-upload with the week before, not itself', () => {
    const db = withAtt([rec(s1.id, '2026-09-18', 70), rec(s1.id, '2026-09-25', 62)])
    const [a] = previewAttendance(db, `EBS Person Code,Attendance %\n${s1.ebsPersonCode},60`, 65, '2026-09-25').rows
    expect(a.action).toBe('update')
    expect(a.warnings.join()).toMatch(/Falls below 65% \(was 70%\)/)
  })
})

describe('teachingWeek', () => {
  it('counts from the intake start', () => {
    expect(teachingWeek('2026-09-21', '2026-09-25')).toBe(1)
    expect(teachingWeek('2026-09-21', '2026-10-02')).toBe(2)
  })
})
