// Wellbeing plan rules: fortnightly meetings, and confirming each was logged in
// the wellbeing team's own system. PATops tracks *that* it happened, not the content.
import type { DbState, User, WellbeingCase, WellbeingMeeting } from './types'
import { seesAllCampuses } from './logic'

export const MEETING_INTERVAL_DAYS = 14
/** A meeting counts as missed if not held within this many days after it was due. */
export const MEETING_GRACE_DAYS = 3
/** Support should be logged in the wellbeing system within this many days of the meeting. */
export const LOG_DEADLINE_DAYS = 2
/** Chase the student if the form hasn't come back after this many days. */
export const FORM_CHASE_DAYS = 7

const day = 24 * 60 * 60 * 1000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export type CycleStatus = 'upcoming' | 'due' | 'overdue' | 'log_pending' | 'log_overdue' | 'complete'

export interface Cycle {
  index: number
  due: Date
  meeting: WellbeingMeeting | null
  status: CycleStatus
}

export function cycleDue(c: WellbeingCase, index: number): Date {
  return new Date(new Date(c.planStart!).getTime() + (index + 1) * MEETING_INTERVAL_DAYS * day)
}

/** All fortnights of a plan up to today (plus the next upcoming one while the plan is open). */
export function planCycles(c: WellbeingCase, meetings: WellbeingMeeting[], now = new Date()): Cycle[] {
  if (!c.planStart || (c.status !== 'approved' && c.status !== 'closed')) return []
  const today = startOfDay(now)
  const end = c.closedAt ? new Date(c.closedAt) : null
  const mine = meetings.filter((m) => m.caseId === c.id)
  const cycles: Cycle[] = []
  for (let i = 0; i < 60; i++) {
    const due = cycleDue(c, i)
    if (end && due > end && !mine.some((m) => m.cycle === i)) break
    const meeting = mine.find((m) => m.cycle === i) ?? null
    let status: CycleStatus
    if (meeting) {
      if (meeting.loggedAt) status = 'complete'
      else status = today.getTime() - startOfDay(new Date(meeting.heldAt)).getTime() > LOG_DEADLINE_DAYS * day ? 'log_overdue' : 'log_pending'
    } else if (today.getTime() > due.getTime() + MEETING_GRACE_DAYS * day) status = 'overdue'
    else if (due.getTime() - today.getTime() <= 7 * day) status = 'due'
    else status = 'upcoming'
    cycles.push({ index: i, due, meeting, status })
    if (due > today) break // stop after the next upcoming fortnight
  }
  return cycles
}

/** The fortnight a newly recorded meeting should count towards: the earliest one without a meeting. */
export function nextOpenCycle(c: WellbeingCase, meetings: WellbeingMeeting[], now = new Date()): number {
  const cycles = planCycles(c, meetings, now)
  return cycles.find((x) => !x.meeting)?.index ?? cycles.length
}

export type ActionKind = 'chase_form' | 'awaiting_decision' | 'meeting_due' | 'meeting_overdue' | 'log_pending' | 'log_overdue'

export interface WellbeingAction {
  kind: ActionKind
  caseId: string
  studentId: string
  date: Date
  urgent: boolean
  label: string
}

export function caseActions(c: WellbeingCase, meetings: WellbeingMeeting[], now = new Date()): WellbeingAction[] {
  const base = { caseId: c.id, studentId: c.studentId }
  if (c.status === 'form_sent') {
    const days = Math.floor((now.getTime() - new Date(c.formSentAt).getTime()) / day)
    return days >= FORM_CHASE_DAYS
      ? [{ ...base, kind: 'chase_form', date: new Date(c.formSentAt), urgent: true, label: `Form sent ${days} days ago and not returned. Chase the student.` }]
      : []
  }
  if (c.status === 'submitted') {
    return [{ ...base, kind: 'awaiting_decision', date: new Date(c.submittedAt!), urgent: false, label: 'Form submitted. Waiting for the wellbeing team to decide.' }]
  }
  if (c.status !== 'approved') return []
  const out: WellbeingAction[] = []
  for (const cy of planCycles(c, meetings, now)) {
    if (cy.status === 'overdue') out.push({ ...base, kind: 'meeting_overdue', date: cy.due, urgent: true, label: `Fortnight ${cy.index + 1} meeting was due and has not been held` })
    if (cy.status === 'due') out.push({ ...base, kind: 'meeting_due', date: cy.due, urgent: false, label: `Fortnight ${cy.index + 1} meeting due` })
    if (cy.status === 'log_overdue') out.push({ ...base, kind: 'log_overdue', date: new Date(cy.meeting!.heldAt), urgent: true, label: 'Meeting held but not yet logged in the wellbeing system (overdue)' })
    if (cy.status === 'log_pending') out.push({ ...base, kind: 'log_pending', date: new Date(cy.meeting!.heldAt), urgent: false, label: 'Log this meeting in the wellbeing system' })
  }
  return out
}

/** PAT responsible for a case: the current PAT of the student's group. */
export function casePatId(db: DbState, c: WellbeingCase): string | null {
  const s = db.students.find((x) => x.id === c.studentId)
  return db.groups.find((g) => g.id === s?.groupId)?.patId ?? null
}

export function visibleCases(db: DbState, viewer: User): WellbeingCase[] {
  if (seesAllCampuses(viewer.role)) return db.wellbeingCases
  const groupIds = new Set(
    (viewer.role === 'pat' ? db.groups.filter((g) => g.patId === viewer.id) : db.groups.filter((g) => g.campusId === viewer.campusId)).map((g) => g.id),
  )
  const studentIds = new Set(db.students.filter((s) => groupIds.has(s.groupId)).map((s) => s.id))
  return db.wellbeingCases.filter((c) => studentIds.has(c.studentId))
}

export interface Compliance {
  activePlans: number
  pastMeetings: number // fortnights whose due date + grace has passed
  complete: number
  percent: number
  overdueMeetings: number
  logsOutstanding: number
}

/** Share of past fortnights where the meeting was held AND logged. */
export function compliance(cases: WellbeingCase[], meetings: WellbeingMeeting[], now = new Date()): Compliance {
  let past = 0
  let complete = 0
  let overdue = 0
  let logs = 0
  for (const c of cases) {
    for (const cy of planCycles(c, meetings, now)) {
      if (cy.status === 'complete') complete++
      if (cy.status === 'overdue') overdue++
      if (cy.status === 'log_pending' || cy.status === 'log_overdue') logs++
      if (cy.status !== 'upcoming' && cy.status !== 'due' && cy.status !== 'log_pending') past++
    }
  }
  return {
    activePlans: cases.filter((c) => c.status === 'approved').length,
    pastMeetings: past,
    complete: complete,
    percent: past ? Math.round((complete / past) * 100) : 100,
    overdueMeetings: overdue,
    logsOutstanding: logs,
  }
}

export function activePlanStudentIds(db: DbState): Set<string> {
  return new Set(db.wellbeingCases.filter((c) => c.status === 'approved').map((c) => c.studentId))
}
