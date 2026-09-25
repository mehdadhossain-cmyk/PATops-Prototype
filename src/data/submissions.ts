// Non-submission follow-up rules.
import type { DbState, FollowUpStatus, NonSubmission, SubmissionPeriod, User } from './types'
import { RESOLVED_STATUSES } from './types'
import { visibleStudents } from './logic'

export const isResolved = (s: FollowUpStatus) => RESOLVED_STATUSES.includes(s)

/** Non-submissions the viewer can see: PATs their students, leads their campus, admins all. */
export function visibleNonSubmissions(db: DbState, viewer: User, periodId?: string): NonSubmission[] {
  const ids = new Set(visibleStudents(db, viewer).map((s) => s.id))
  return db.nonSubmissions.filter((n) => ids.has(n.studentId) && (!periodId || n.periodId === periodId))
}

export interface FollowUpProgress {
  total: number
  notContacted: number
  inProgress: number
  resolved: number
  /** Share of items that have been actioned at all (anything but "not contacted"). */
  followedUpPct: number
  resolvedPct: number
  /** Past the follow-up date and still not contacted. */
  overdue: number
}

export function progress(items: NonSubmission[], period: SubmissionPeriod | undefined, now = new Date()): FollowUpProgress {
  const today = now.toISOString().slice(0, 10)
  const late = !!period && period.status === 'open' && period.followUpBy < today
  const notContacted = items.filter((n) => n.status === 'not_contacted').length
  const resolved = items.filter((n) => isResolved(n.status)).length
  const total = items.length
  return {
    total,
    notContacted,
    inProgress: total - notContacted - resolved,
    resolved,
    followedUpPct: total ? Math.round(((total - notContacted) / total) * 100) : 100,
    resolvedPct: total ? Math.round((resolved / total) * 100) : 100,
    overdue: late ? notContacted : 0,
  }
}

/** Which PAT an item belongs to: the current PAT of the student's group. */
export function itemPatId(db: DbState, n: NonSubmission): string | null {
  const s = db.students.find((x) => x.id === n.studentId)
  return db.groups.find((g) => g.id === s?.groupId)?.patId ?? null
}

export function openPeriods(db: DbState): SubmissionPeriod[] {
  return db.submissionPeriods.filter((p) => p.status === 'open').sort((a, b) => b.deadline.localeCompare(a.deadline))
}
