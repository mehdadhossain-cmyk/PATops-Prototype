import { describe, expect, it } from 'vitest'
import { canDecide, coverCandidates, datesBetween, needsLeadApproval, sessionsToCover, weekdayOf, workingDays } from './leave'
import { buildSeed } from './seed'
import type { DbState, Group, LeaveRequest, User } from './types'

const base: DbState = { ...buildSeed(), leaveRequests: [], coverSlots: [] }
const pat = base.users.find((u) => u.role === 'pat' && u.status === 'active' && base.groups.some((g) => g.patId === u.id))!
const group = base.groups.find((g) => g.patId === pat.id)!
const lead = base.users.find((u) => u.role === 'lead' && u.campusId === pat.campusId)!
const manager = base.users.find((u) => u.role === 'manager')!

/** Next date on or after 2026-10-05 (a Monday) that falls on the given weekday. */
const nextDay = (wd: string) => datesBetween('2026-10-05', '2026-10-11').find((d) => weekdayOf(d) === wd)!

describe('dates', () => {
  it('lists every date in a range and names weekdays', () => {
    expect(datesBetween('2026-09-28', '2026-10-02')).toHaveLength(5)
    expect(weekdayOf('2026-09-25')).toBe('Fri')
    expect(datesBetween('2026-10-02', '2026-09-28')).toEqual([])
  })
  it('counts only the PAT’s working days', () => {
    const u = { ...pat, workDays: ['Mon', 'Tue'] } as User
    expect(workingDays(u, '2026-09-28', '2026-10-04')).toEqual(['2026-09-28', '2026-09-29'])
  })
})

describe('sessionsToCover', () => {
  it('finds the PAT’s classes that fall inside the leave', () => {
    const day = nextDay(group.classDays[0])
    const sessions = sessionsToCover(base, pat.id, day, day)
    expect(sessions.some((s) => s.group.id === group.id && s.date === day)).toBe(true)
    const off = datesBetween('2026-10-05', '2026-10-11').find((d) => !base.groups.some((g) => g.patId === pat.id && g.classDays.includes(weekdayOf(d))))
    if (off) expect(sessionsToCover(base, pat.id, off, off)).toEqual([])
  })
})

describe('coverCandidates', () => {
  const day = nextDay(group.classDays[0])
  const session = { date: day, group }
  it('never offers the requester, and blocks PATs teaching at the same time', () => {
    const cands = coverCandidates(base, session, pat.id)
    expect(cands.some((c) => c.user.id === pat.id)).toBe(false)
    const clash = cands.find((c) => base.groups.some((g) => g.patId === c.user.id && g.classDays.includes(weekdayOf(day)) && g.startTime < group.endTime && group.startTime < g.endTime))
    if (clash) expect(clash.blocked).toBe(true)
    // Unblocked candidates come first.
    const firstBlocked = cands.findIndex((c) => c.blocked)
    if (firstBlocked >= 0) expect(cands.slice(firstBlocked).every((c) => c.blocked)).toBe(true)
  })
  it('blocks PATs who are on leave that day', () => {
    const other = coverCandidates(base, session, pat.id).find((c) => !c.blocked)!.user
    const leave: LeaveRequest = { id: 'l', requesterId: other.id, type: 'annual', startDate: day, endDate: day, reason: '', status: 'approved', createdAt: '', leadDecision: null, managerDecision: null, cancelledAt: null }
    const c = coverCandidates({ ...base, leaveRequests: [leave] }, session, pat.id).find((x) => x.user.id === other.id)!
    expect(c.blocked).toBe(true)
    expect(c.warnings).toContain('On leave that day')
  })
  it('warns when a cover would exceed two groups in a day', () => {
    const g2: Group = { ...group, id: 'gx', code: 'X', startTime: '14:00', endTime: '16:00' }
    const g3: Group = { ...group, id: 'gy', code: 'Y', startTime: '16:30', endTime: '18:00' }
    const other = coverCandidates(base, session, pat.id).find((c) => !c.blocked && c.user.campusId === group.campusId)!.user
    const db = { ...base, groups: [...base.groups.filter((g) => g.patId !== other.id), { ...g2, patId: other.id }, { ...g3, patId: other.id }] }
    const c = coverCandidates(db, session, pat.id).find((x) => x.user.id === other.id)!
    expect(c.warnings.join()).toMatch(/max 2/)
  })
})

describe('approvals', () => {
  const req = (status: LeaveRequest['status']): LeaveRequest => ({ id: 'r', requesterId: pat.id, type: 'annual', startDate: '2026-10-05', endDate: '2026-10-05', reason: '', status, createdAt: '', leadDecision: null, managerDecision: null, cancelledAt: null })
  it('PATs go to their campus lead, then the manager', () => {
    expect(needsLeadApproval(base, pat)).toBe(true)
    expect(canDecide(base, lead, req('awaiting_lead'))).toBe(true)
    expect(canDecide(base, manager, req('awaiting_lead'))).toBe(false)
    expect(canDecide(base, manager, req('awaiting_manager'))).toBe(true)
    expect(canDecide(base, lead, req('awaiting_manager'))).toBe(false)
  })
  it('leads from another campus cannot decide', () => {
    const otherLead = base.users.find((u) => u.role === 'lead' && u.campusId !== pat.campusId)!
    expect(canDecide(base, otherLead, req('awaiting_lead'))).toBe(false)
  })
  it('leads’ own leave goes straight to the manager', () => {
    expect(needsLeadApproval(base, lead)).toBe(false)
  })
})
