import { describe, expect, it } from 'vitest'
import { previewNonSubmissions } from './importer'
import { buildSeed } from './seed'
import { progress, visibleNonSubmissions } from './submissions'
import type { DbState, NonSubmission, SubmissionPeriod } from './types'

const base = buildSeed()
const pat = base.users.find((u) => u.role === 'pat' && u.status === 'active' && base.groups.some((g) => g.patId === u.id))!
const other = base.users.find((u) => u.role === 'pat' && u.id !== pat.id && base.groups.some((g) => g.patId === u.id))!
const group = base.groups.find((g) => g.patId === pat.id)!
const [s1, s2] = base.students.filter((s) => s.groupId === group.id && s.status === 'active')
const period: SubmissionPeriod = { id: 'p', name: 'P', intakeIds: [group.intakeId], deadline: '2026-09-10', followUpBy: '2026-09-20', status: 'open', createdBy: 'a', createdAt: '' }
const item = (p: Partial<NonSubmission>): NonSubmission => ({ id: Math.random().toString(36), periodId: 'p', studentId: s1.id, assessment: 'A1', status: 'not_contacted', note: '', expectedDate: null, updatedAt: null, updatedBy: null, ...p })
const withItems = (nonSubmissions: NonSubmission[]): DbState => ({ ...base, submissionPeriods: [period], nonSubmissions })

describe('progress', () => {
  it('splits items into not contacted, in progress and resolved', () => {
    const p = progress([item({}), item({ status: 'contacted' }), item({ status: 'will_submit' }), item({ status: 'submitted_late' })], period, new Date('2026-09-15'))
    expect(p).toMatchObject({ total: 4, notContacted: 1, inProgress: 2, resolved: 1, followedUpPct: 75, resolvedPct: 25, overdue: 0 })
  })
  it('counts not-contacted items as overdue after the follow-up date', () => {
    expect(progress([item({}), item({ status: 'contacted' })], period, new Date('2026-09-25')).overdue).toBe(1)
    expect(progress([item({})], { ...period, status: 'closed' }, new Date('2026-09-25')).overdue).toBe(0)
  })
})

describe('visibility', () => {
  it("PATs see only their own students' items", () => {
    const db = withItems([item({})])
    expect(visibleNonSubmissions(db, pat, 'p')).toHaveLength(1)
    expect(visibleNonSubmissions(db, other, 'p')).toHaveLength(0)
  })
})

describe('previewNonSubmissions', () => {
  it('accepts new rows, and rejects unknown, duplicate and already-listed ones', () => {
    const db = withItems([item({ studentId: s2.id, assessment: 'Essay' })])
    const csv = [
      'Person Code,Module / Assessment',
      `${s1.ebsPersonCode},Essay`,
      `${s1.ebsPersonCode},Essay`,
      `${s2.ebsPersonCode},essay`,
      '0000000,Essay',
      `${s1.ebsPersonCode},`,
    ].join('\n')
    const rows = previewNonSubmissions(db, 'p', csv).rows
    expect(rows.map((r) => r.action)).toEqual(['create', 'skip', 'skip', 'skip', 'skip'])
    expect(rows[1].errors.join()).toMatch(/twice/)
    expect(rows[2].errors.join()).toMatch(/Already/)
    expect(rows[3].errors.join()).toMatch(/not found/)
    expect(rows[4].errors.join()).toMatch(/Missing assessment/)
  })
  it('warns when the student is outside the period intakes', () => {
    const outsider = base.students.find((s) => base.groups.find((g) => g.id === s.groupId)?.intakeId !== group.intakeId && s.status === 'active')!
    const [r] = previewNonSubmissions(withItems([]), 'p', `EBS Person Code,Assessment\n${outsider.ebsPersonCode},Essay`).rows
    expect(r.warnings.join()).toMatch(/not in an intake/)
  })
})
