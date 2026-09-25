// LSA (Learning Support Agreement) rules and the sheet's derived columns.
import type { DbState, Lsa, User } from './types'
import { visibleStudents } from './logic'

/** Follow-ups within this many days count as "due soon". */
export const LSA_DUE_SOON_DAYS = 7

export type LsaStatus = 'active' | 'follow_up_overdue' | 'follow_up_due' | 'ended'

const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * 86400000).toISOString().slice(0, 10)

export function lsaStatus(l: Lsa, today = new Date().toISOString().slice(0, 10)): LsaStatus {
  if (l.endDate && l.endDate < today) return 'ended'
  if (l.nextFollowUp && l.nextFollowUp < today) return 'follow_up_overdue'
  if (l.nextFollowUp && l.nextFollowUp <= addDays(today, LSA_DUE_SOON_DAYS)) return 'follow_up_due'
  return 'active'
}

export function visibleLsas(db: DbState, viewer: User): Lsa[] {
  const ids = new Set(visibleStudents(db, viewer).map((s) => s.id))
  return db.lsas.filter((l) => ids.has(l.studentId))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The sheet's two intake formats: "Jan-26" and "UOW JAN 26". */
export function intakeCodes(db: DbState, intakeId: string | undefined): { short: string; standard: string } {
  const i = db.intakes.find((x) => x.id === intakeId)
  if (!i) return { short: '', standard: '' }
  const d = new Date(i.startDate)
  const mon = MONTHS[d.getMonth()]
  const yy = String(d.getFullYear()).slice(2)
  const uni = db.universities.find((u) => u.id === i.universityId)?.shortName.toUpperCase() ?? ''
  return { short: `${mon}-${yy}`, standard: `${uni} ${mon.toUpperCase()} ${yy}` }
}

/** The sheet uses US-style dates (6/16/2026). */
export const toSheetDate = (iso: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}/${y}`
}

/** Accepts the sheet's M/D/YYYY dates as well as ISO YYYY-MM-DD. Returns ISO or null. */
export function parseSheetDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  let y: number, m: number, d: number
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (us) [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3].length === 2 ? `20${us[3]}` : us[3])]
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

/** Header row matching the existing PAT LSA records sheet, for exports. */
export const LSA_SHEET_HEADER = ['Student ID', 'Student Name', 'Campus Name', 'Intake', 'Course Name', 'PAT Name', 'LSA Start Date', 'LSA End Date', 'Next Follow up', 'Intake (Standardised)', 'Comments']
