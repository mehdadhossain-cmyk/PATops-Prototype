// Leave and cover rules.
import type { CoverSlot, DbState, Group, LeaveRequest, LeaveStatus, User, Weekday } from './types'
import { isTop } from './logic'

const DAY_NAMES: Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as Weekday[]
export const weekdayOf = (iso: string): Weekday => DAY_NAMES[new Date(`${iso}T12:00:00Z`).getUTCDay()]

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  if (!start || !end || end < start) return out
  for (let t = new Date(`${start}T12:00:00Z`).getTime(); ; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10)
    if (d > end) break
    out.push(d)
    if (out.length > 366) break
  }
  return out
}

/** Days in the range the person normally works (these are the leave days that count). */
export function workingDays(u: User, start: string, end: string): string[] {
  return datesBetween(start, end).filter((d) => u.workDays.includes(weekdayOf(d)))
}

export interface Session {
  date: string
  group: Group
}

/** The requester's class sessions that fall inside the leave: each needs a cover. */
export function sessionsToCover(db: DbState, userId: string, start: string, end: string): Session[] {
  const groups = db.groups.filter((g) => g.patId === userId)
  const out: Session[] = []
  for (const date of datesBetween(start, end)) {
    const wd = weekdayOf(date)
    for (const group of groups) if (group.classDays.includes(wd)) out.push({ date, group })
  }
  return out
}

const ACTIVE: LeaveStatus[] = ['awaiting_cover', 'awaiting_lead', 'awaiting_manager', 'approved']

/** Leave (approved or still in progress) that includes this date. */
export function leaveOn(db: DbState, userId: string, date: string): LeaveRequest | undefined {
  return db.leaveRequests.find((r) => r.requesterId === userId && ACTIVE.includes(r.status) && r.startDate <= date && r.endDate >= date)
}

const overlaps = (a: Group, b: Group) => a.startTime < b.endTime && b.startTime < a.endTime

export interface CoverCandidate {
  user: User
  warnings: string[]
  blocked: boolean
  score: number
}

/**
 * Ranks PATs who could cover a session. Hard blocks: on leave, or already teaching at the same time.
 * Warnings follow the allocation rules (campus, shift, work days, max 2 groups a day).
 */
export function coverCandidates(db: DbState, session: Session, requesterId: string, draft: { date: string; groupId: string; coverPatId: string }[] = []): CoverCandidate[] {
  const wd = weekdayOf(session.date)
  const activeCovers = db.coverSlots.filter((c) => c.status !== 'declined' && ACTIVE.includes(db.leaveRequests.find((r) => r.id === c.leaveId)?.status ?? 'cancelled'))
  return db.users
    .filter((u) => u.role === 'pat' && u.status === 'active' && u.id !== requesterId)
    .map((u) => {
      const warnings: string[] = []
      let blocked = false
      if (leaveOn(db, u.id, session.date)) {
        warnings.push('On leave that day')
        blocked = true
      }
      const own = db.groups.filter((g) => g.patId === u.id && g.classDays.includes(wd))
      const covering = [
        ...activeCovers.filter((c) => c.coverPatId === u.id && c.date === session.date).map((c) => db.groups.find((g) => g.id === c.groupId)!),
        ...draft.filter((d) => d.coverPatId === u.id && d.date === session.date && d.groupId !== session.group.id).map((d) => db.groups.find((g) => g.id === d.groupId)!),
      ].filter(Boolean)
      const clash = [...own, ...covering].find((g) => overlaps(g, session.group))
      if (clash) {
        warnings.push(`Teaching ${clash.code} at the same time`)
        blocked = true
      }
      // Weighted so the best practical cover comes first: same campus matters most.
      let score = blocked ? 1000 : 0
      if (u.campusId !== session.group.campusId) {
        warnings.push('Different campus')
        score += 40
      }
      if (u.shift && u.shift !== session.group.shift) {
        warnings.push(`Works the ${u.shift} shift`)
        score += 10
      }
      if (!u.workDays.includes(wd)) {
        warnings.push(`Doesn't normally work on ${wd}`)
        score += 10
      }
      if (own.length + covering.length >= 2) {
        warnings.push(`Would have ${own.length + covering.length + 1} groups that day (max 2)`)
        score += 20
      }
      score += covering.length * 2 + own.length
      return { user: u, warnings, blocked, score }
    })
    .sort((a, b) => a.score - b.score || a.user.name.localeCompare(b.user.name))
}

/** Which approval steps a request goes through. Leads and admins go straight to the manager. */
export function needsLeadApproval(db: DbState, requester: User): boolean {
  return requester.role === 'pat' && db.users.some((u) => u.role === 'lead' && u.status === 'active' && u.campusId === requester.campusId)
}

export function statusAfterCover(db: DbState, requester: User): LeaveStatus {
  return needsLeadApproval(db, requester) ? 'awaiting_lead' : 'awaiting_manager'
}

export function canDecide(db: DbState, viewer: User, r: LeaveRequest): boolean {
  const requester = db.users.find((u) => u.id === r.requesterId)
  if (r.status === 'awaiting_lead') return viewer.role === 'lead' && viewer.campusId === requester?.campusId && viewer.id !== r.requesterId
  if (r.status === 'awaiting_manager') return isTop(viewer.role) && viewer.id !== r.requesterId
  return false
}

export function slotsFor(db: DbState, leaveId: string): CoverSlot[] {
  return db.coverSlots.filter((c) => c.leaveId === leaveId).sort((a, b) => a.date.localeCompare(b.date))
}

/** Approved leave days (working days) in a calendar year. */
export function leaveDaysTaken(db: DbState, u: User, year: number): number {
  return db.leaveRequests
    .filter((r) => r.requesterId === u.id && r.status === 'approved' && r.type === 'annual')
    .reduce((n, r) => n + workingDays(u, r.startDate, r.endDate).filter((d) => d.startsWith(String(year))).length, 0)
}

