import { describe, expect, it } from 'vitest'
import { lastReachedByStudent, openFollowUps, patCommStats, studentTimeline, visibleComms } from './logic'
import { buildSeed } from './seed'
import type { CommLog, DbState } from './types'

const base = buildSeed()
const pat = base.users.find((u) => u.role === 'pat' && u.status === 'active' && base.groups.some((g) => g.patId === u.id))!
const group = base.groups.find((g) => g.patId === pat.id)!
const [s1, s2] = base.students.filter((s) => s.groupId === group.id && s.status === 'active')
const now = new Date('2026-09-25T12:00:00Z')

const log = (p: Partial<CommLog>): CommLog => ({
  id: Math.random().toString(36), authorId: pat.id, kind: 'individual', studentId: s1.id, groupIds: [],
  channel: 'phone', direction: 'outbound', outcome: 'reached', reason: 'attendance', summary: 'x',
  at: '2026-09-20T10:00:00Z', loggedAt: '2026-09-20T10:00:00Z', followUpDate: null, followUpDoneAt: null,
  voidedAt: null, voidReason: '', ...p,
})
const withComms = (comms: CommLog[]): DbState => ({ ...base, comms })

describe('lastReachedByStudent', () => {
  it('ignores unanswered calls, voided entries and announcements', () => {
    const m = lastReachedByStudent([
      log({ at: '2026-09-01T10:00:00Z' }),
      log({ at: '2026-09-10T10:00:00Z', outcome: 'no_answer' }),
      log({ at: '2026-09-12T10:00:00Z', voidedAt: '2026-09-12T11:00:00Z' }),
      log({ at: '2026-09-15T10:00:00Z', kind: 'announcement', studentId: null, groupIds: [group.id] }),
    ])
    expect(m.get(s1.id)).toBe('2026-09-01T10:00:00Z')
  })
})

describe('openFollowUps', () => {
  it('lists open follow-ups, flags overdue ones, and skips done or voided', () => {
    const f = openFollowUps([
      log({ followUpDate: '2026-09-30' }),
      log({ followUpDate: '2026-09-22' }),
      log({ followUpDate: '2026-09-21', followUpDoneAt: '2026-09-21T09:00:00Z' }),
      log({ followUpDate: '2026-09-20', voidedAt: '2026-09-20T09:00:00Z' }),
    ], now)
    expect(f.map((x) => [x.log.followUpDate, x.overdue])).toEqual([['2026-09-22', true], ['2026-09-30', false]])
  })
})

describe('patCommStats', () => {
  it('counts reach over 30 days against active students', () => {
    const db = withComms([
      log({ studentId: s1.id, at: '2026-09-20T10:00:00Z' }),
      log({ studentId: s2.id, at: '2026-08-01T10:00:00Z' }),
      log({ kind: 'announcement', studentId: null, groupIds: [group.id], at: '2026-09-24T10:00:00Z' }),
    ])
    const st = patCommStats(db, pat.id, now)
    expect(st.reached30).toBe(1)
    expect(st.contacts7).toBe(1)
    expect(st.contacts30).toBe(1)
    expect(st.announcements30).toBe(1)
    expect(st.coverage).toBe(Math.round((1 / st.students) * 100))
  })
})

describe('visibility', () => {
  it("a student's timeline includes their group's announcements", () => {
    const db = withComms([log({}), log({ kind: 'announcement', studentId: null, groupIds: [group.id] }), log({ studentId: s2.id })])
    expect(studentTimeline(db, s1)).toHaveLength(2)
  })
  it('PATs cannot see logs about other PATs’ students', () => {
    const other = base.users.find((u) => u.role === 'pat' && u.id !== pat.id && base.groups.some((g) => g.patId === u.id))!
    const db = withComms([log({})])
    expect(visibleComms(db, pat)).toHaveLength(1)
    expect(visibleComms(db, other)).toHaveLength(0)
  })
})
