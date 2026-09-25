// Attendance and at-risk rules.
import type { AttendanceRecord, DbState, RetentionStage, Role, Student, User } from './types'
import { visibleStudents } from './logic'

/** Students below this overall attendance are at risk. */
export const RISK_THRESHOLD = 65
/** An at-risk student with no note or contact for this many days needs attention. */
export const NO_ACTION_DAYS = 14

const day = 24 * 60 * 60 * 1000

export const canDecideRetention = (r: Role) => r === 'admin' || r === 'manager'

const indexCache = new WeakMap<AttendanceRecord[], Map<string, AttendanceRecord[]>>()

/** Attendance history per student, oldest first. Cached per data version. */
export function attendanceIndex(records: AttendanceRecord[]): Map<string, AttendanceRecord[]> {
  const cached = indexCache.get(records)
  if (cached) return cached
  const m = new Map<string, AttendanceRecord[]>()
  for (const r of records) {
    const list = m.get(r.studentId)
    if (list) list.push(r)
    else m.set(r.studentId, [r])
  }
  for (const list of m.values()) list.sort((a, b) => a.weekEnding.localeCompare(b.weekEnding))
  indexCache.set(records, m)
  return m
}

export interface AttendanceSummary {
  current: number | null
  previous: number | null
  change: number | null
  weekEnding: string | null
  history: AttendanceRecord[]
  /** Consecutive most-recent weeks below the threshold. */
  weeksBelow: number
  atRisk: boolean
  /** Below the threshold this week but not last week (or first report). */
  newlyAtRisk: boolean
}

export function attendanceSummary(db: DbState, studentId: string): AttendanceSummary {
  const history = attendanceIndex(db.attendance).get(studentId) ?? []
  const last = history.at(-1) ?? null
  const prev = history.at(-2) ?? null
  let weeksBelow = 0
  for (let i = history.length - 1; i >= 0 && history[i].overall < RISK_THRESHOLD; i--) weeksBelow++
  const atRisk = last !== null && last.overall < RISK_THRESHOLD
  return {
    current: last?.overall ?? null,
    previous: prev?.overall ?? null,
    change: last && prev ? Math.round((last.overall - prev.overall) * 10) / 10 : null,
    weekEnding: last?.weekEnding ?? null,
    history,
    weeksBelow,
    atRisk,
    newlyAtRisk: atRisk && (prev === null || prev.overall >= RISK_THRESHOLD),
  }
}

export function retentionStage(db: DbState, studentId: string): RetentionStage {
  let stage: RetentionStage = 'new'
  let at = ''
  for (const n of db.riskNotes) {
    if (n.studentId === studentId && n.stage && n.at >= at) {
      stage = n.stage
      at = n.at
    }
  }
  return stage
}

/** Latest retention note or direct contact with the student. */
export function lastActionAt(db: DbState, studentId: string): string | null {
  let latest: string | null = null
  for (const n of db.riskNotes) if (n.studentId === studentId && (!latest || n.at > latest)) latest = n.at
  for (const c of db.comms) if (c.studentId === studentId && !c.voidedAt && (!latest || c.at > latest)) latest = c.at
  return latest
}

export interface RiskRow {
  student: Student
  att: AttendanceSummary
  stage: RetentionStage
  lastAction: string | null
  noRecentAction: boolean
}

/**
 * Students the viewer should see in the at-risk list: active students currently below the
 * threshold, plus students back above it whose retention case hasn't been closed yet.
 */
export function riskRows(db: DbState, viewer: User, now = new Date()): { atRisk: RiskRow[]; recovering: RiskRow[] } {
  const cutoff = new Date(now.getTime() - NO_ACTION_DAYS * day).toISOString()
  const noted = new Set(db.riskNotes.map((n) => n.studentId))
  const atRisk: RiskRow[] = []
  const recovering: RiskRow[] = []
  for (const s of visibleStudents(db, viewer)) {
    if (s.status !== 'active') continue
    const att = attendanceSummary(db, s.id)
    if (att.current === null) continue
    if (!att.atRisk && !noted.has(s.id)) continue
    const stage = retentionStage(db, s.id)
    const lastAction = lastActionAt(db, s.id)
    const row = { student: s, att, stage, lastAction, noRecentAction: !lastAction || lastAction < cutoff }
    if (att.atRisk) atRisk.push(row)
    else if (stage !== 'resolved' && stage !== 'withdrawn') recovering.push(row)
  }
  return { atRisk, recovering }
}

/** Teaching week number of a date within an intake (week 1 starts on the intake start date). */
export function teachingWeek(intakeStart: string, date: string): number {
  return Math.floor((new Date(date).getTime() - new Date(intakeStart).getTime()) / (7 * day)) + 1
}

export function latestWeekEnding(db: DbState): string | null {
  return db.attendanceUploads.reduce<string | null>((m, u) => (!m || u.weekEnding > m ? u.weekEnding : m), null)
}
