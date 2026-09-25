// Pure, UI-independent business rules. Easy to unit test and to move
// server-side later.
import type { CommLog, DbState, Group, Role, Student, TrainingModule, TrainingProgress, User } from './types'

const day = 24 * 60 * 60 * 1000

export function isProfileComplete(u: User): boolean {
  return Boolean(
    u.phone.trim() &&
      u.shift &&
      u.workDays.length > 0 &&
      u.emergencyContact?.name.trim() &&
      u.emergencyContact?.phone.trim(),
  )
}

export function needsTraining(u: User): boolean {
  return u.role === 'pat' || u.role === 'lead'
}

export type ModuleStatus = 'locked' | 'not_started' | 'in_progress' | 'completed'

export function moduleStatus(p: TrainingProgress | undefined): Exclude<ModuleStatus, 'locked'> {
  if (!p) return 'not_started'
  if (p.completedAt) return 'completed'
  return 'in_progress'
}

export function moduleDueDate(u: User, m: TrainingModule): Date {
  return new Date(new Date(u.startDate).getTime() + m.dueDays * day)
}

export function activeModules(db: DbState): TrainingModule[] {
  return db.trainingModules.filter((m) => !m.archived).sort((a, b) => a.order - b.order)
}

export function progressFor(db: DbState, userId: string, moduleId: string) {
  return db.trainingProgress.find((p) => p.userId === userId && p.moduleId === moduleId)
}

export interface TrainingSummary {
  required: number
  completed: number
  percent: number
  overdue: TrainingModule[]
  nextDue: { module: TrainingModule; due: Date } | null
  failedAttempts: number
  complete: boolean
}

export function trainingSummary(db: DbState, u: User, now = new Date()): TrainingSummary {
  const mods = activeModules(db).filter((m) => m.required)
  let completed = 0
  let failedAttempts = 0
  const overdue: TrainingModule[] = []
  let nextDue: TrainingSummary['nextDue'] = null
  for (const m of mods) {
    const p = progressFor(db, u.id, m.id)
    failedAttempts += p?.attempts.filter((a) => !a.passed).length ?? 0
    if (p?.completedAt) {
      completed++
      continue
    }
    const due = moduleDueDate(u, m)
    if (due < now) overdue.push(m)
    else if (!nextDue || due < nextDue.due) nextDue = { module: m, due }
  }
  const required = mods.length
  return {
    required,
    completed,
    percent: required ? Math.round((completed / required) * 100) : 100,
    overdue,
    nextDue,
    failedAttempts,
    complete: completed === required,
  }
}

export function scoreQuiz(m: TrainingModule, answers: number[]): number {
  if (m.quiz.length === 0) return 100
  const correct = m.quiz.filter((q, i) => answers[i] === q.answerIndex).length
  return Math.round((correct / m.quiz.length) * 100)
}

// ---- Permissions -----------------------------------------------------------

export const canManageStaff = (r: Role) => r === 'admin' || r === 'manager'
export const canManageTraining = (r: Role) => r === 'admin' || r === 'manager'
export const canViewStaff = (r: Role) => r !== 'pat'

/** Staff a viewer is allowed to see: leads only see their own campus. */
export function visibleStaff(db: DbState, viewer: User): User[] {
  if (viewer.role === 'pat') return [viewer]
  if (viewer.role === 'lead') return db.users.filter((u) => u.campusId === viewer.campusId)
  return db.users
}

export function campusName(db: DbState, id: string | null): string {
  if (!id) return 'All campuses'
  return db.campuses.find((c) => c.id === id)?.name ?? 'Unknown'
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** Full timestamp including the year, for audit records. */
export const fmtStamp = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

// ---- Academic structure ----------------------------------------------------

/** Maximum students a PAT may hold (allocation rule from the PAT team). */
export const PAT_STUDENT_CAP = 200

export const canManageStudents = (r: Role) => r === 'admin' || r === 'manager'

export function intakeLabel(db: DbState, intakeId: string): string {
  const i = db.intakes.find((x) => x.id === intakeId)
  if (!i) return 'Unknown intake'
  const uni = db.universities.find((u) => u.id === i.universityId)
  return `${uni?.shortName ?? '?'} ${i.name}`
}

export const courseName = (db: DbState, id: string) => db.courses.find((c) => c.id === id)?.name ?? 'Unknown course'
export const userName = (db: DbState, id: string | null) => (id ? (db.users.find((u) => u.id === id)?.name ?? 'Unknown') : '—')

export function groupStudents(db: DbState, groupId: string, includeInactive = false): Student[] {
  return db.students.filter((s) => s.groupId === groupId && (includeInactive || s.status === 'active'))
}

export function patGroups(db: DbState, patId: string): Group[] {
  return db.groups.filter((g) => g.patId === patId)
}

export function patStudentCount(db: DbState, patId: string): number {
  const ids = new Set(patGroups(db, patId).map((g) => g.id))
  return db.students.filter((s) => ids.has(s.groupId) && s.status === 'active').length
}

/** Groups a viewer may see: PATs their own, leads their campus, admins/manager everything. */
export function visibleGroups(db: DbState, viewer: User): Group[] {
  if (viewer.role === 'pat') return patGroups(db, viewer.id)
  if (viewer.role === 'lead') return db.groups.filter((g) => g.campusId === viewer.campusId)
  return db.groups
}

export function visibleStudents(db: DbState, viewer: User): Student[] {
  if (viewer.role === 'admin' || viewer.role === 'manager') return db.students
  const ids = new Set(visibleGroups(db, viewer).map((g) => g.id))
  return db.students.filter((s) => ids.has(s.groupId))
}

export const studentName = (s: Student) => `${s.firstName} ${s.lastName}`

export const fmtSchedule = (g: Group) => `${g.classDays.join(' & ')} · ${g.startTime}–${g.endTime}`

// ---- Call log ---------------------------------------------------------------

/** A student counts as "not contacted recently" after this many days without a successful contact. */
export const CONTACT_GAP_DAYS = 30

const isLive = (c: CommLog) => !c.voidedAt

/** Logs a viewer may see: PATs see their own entries and anything about their students; leads their campus; admins all. */
export function visibleComms(db: DbState, viewer: User): CommLog[] {
  if (viewer.role === 'admin' || viewer.role === 'manager') return db.comms
  const groupIds = new Set(visibleGroups(db, viewer).map((g) => g.id))
  const studentIds = new Set(db.students.filter((s) => groupIds.has(s.groupId)).map((s) => s.id))
  const campusStaff = viewer.role === 'lead' ? new Set(db.users.filter((u) => u.campusId === viewer.campusId).map((u) => u.id)) : new Set([viewer.id])
  return db.comms.filter(
    (c) => campusStaff.has(c.authorId) || (c.studentId && studentIds.has(c.studentId)) || c.groupIds.some((g) => groupIds.has(g)),
  )
}

/** Timeline for one student: their individual contacts plus announcements sent to their group. */
export function studentTimeline(db: DbState, s: Student): CommLog[] {
  return db.comms.filter((c) => c.studentId === s.id || c.groupIds.includes(s.groupId)).sort((a, b) => b.at.localeCompare(a.at))
}

/** Most recent successful individual contact per student (one pass over the log). */
export function lastReachedByStudent(comms: CommLog[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of comms) {
    if (!isLive(c) || c.kind !== 'individual' || !c.studentId || c.outcome !== 'reached') continue
    const prev = m.get(c.studentId)
    if (!prev || c.at > prev) m.set(c.studentId, c.at)
  }
  return m
}

export interface FollowUp {
  log: CommLog
  due: Date
  overdue: boolean
}

export function openFollowUps(comms: CommLog[], now = new Date()): FollowUp[] {
  const today = now.toISOString().slice(0, 10)
  return comms
    .filter((c) => isLive(c) && c.followUpDate && !c.followUpDoneAt)
    .map((c) => ({ log: c, due: new Date(c.followUpDate!), overdue: c.followUpDate! < today }))
    .sort((a, b) => +a.due - +b.due)
}

export interface PatCommStats {
  students: number
  contacts7: number
  contacts30: number
  reached30: number
  coverage: number // % of active students successfully contacted in CONTACT_GAP_DAYS
  announcements30: number
  overdueFollowUps: number
  lastLogAt: string | null
}

export function patCommStats(db: DbState, patId: string, now = new Date()): PatCommStats {
  const since7 = new Date(now.getTime() - 7 * day).toISOString()
  const since30 = new Date(now.getTime() - CONTACT_GAP_DAYS * day).toISOString()
  const mine = db.comms.filter((c) => c.authorId === patId && isLive(c))
  const groupIds = new Set(patGroups(db, patId).map((g) => g.id))
  const students = db.students.filter((s) => s.status === 'active' && groupIds.has(s.groupId))
  const last = lastReachedByStudent(mine)
  const reached30 = students.filter((s) => (last.get(s.id) ?? '') >= since30).length
  const individual = mine.filter((c) => c.kind === 'individual')
  return {
    students: students.length,
    contacts7: individual.filter((c) => c.at >= since7).length,
    contacts30: individual.filter((c) => c.at >= since30).length,
    reached30,
    coverage: students.length ? Math.round((reached30 / students.length) * 100) : 100,
    announcements30: mine.filter((c) => c.kind === 'announcement' && c.at >= since30).length,
    overdueFollowUps: openFollowUps(mine, now).filter((f) => f.overdue).length,
    lastLogAt: mine.reduce<string | null>((m, c) => (!m || c.loggedAt > m ? c.loggedAt : m), null),
  }
}

export const daysSince = (iso: string | null | undefined, now = new Date()) =>
  iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / day) : null
