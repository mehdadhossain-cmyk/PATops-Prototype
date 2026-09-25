// Allocation workbooks in the same layout as the PAT allocation sheet: an example to try the importer
// (demo staff only), and the export of a draft (one tab per campus).
import { buildContext, describeSessions, groupSessions, patHours } from './allocation'
import { campusName, courseName, userName } from './logic'
import type { AllocationDraft, DbState } from './types'
import { WEEKDAYS } from './types'
import type { Sheet } from '../lib/xlsx'

export const SHEET_COLUMNS = ['Partner University', 'Course', 'Cohort', 'Year', 'Semester ', 'Starting From', 'Group', 'No. of Stu', 'Group Day', 'Campus', 'Room No. ', 'PAT', 'No. of Grps', 'Working Hours ', 'Day Off']

const dayOff = (workDays: string[]) => {
  const long: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
  return WEEKDAYS.filter((d) => !workDays.includes(d)).map((d) => long[d]).join('/')
}

/** Draft (or live allocation) → one tab per campus, in the original sheet's columns. */
export function allocationWorkbook(db: DbState, draft: AllocationDraft | null, groupIds: string[]): Sheet[] {
  const ctx = buildContext(db, draft)
  const groups = db.groups.filter((g) => groupIds.includes(g.id))
  const campuses = db.campuses.filter((c) => groups.some((g) => g.campusId === c.id))
  return campuses.map((c) => ({
    name: c.name,
    columns: SHEET_COLUMNS,
    rows: groups
      .filter((g) => g.campusId === c.id)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((g) => {
        const patId = ctx.patOf.get(g.id) ?? null
        const pat = db.users.find((u) => u.id === patId)
        const intake = db.intakes.find((i) => i.id === g.intakeId)
        const uni = db.universities.find((u) => u.id === intake?.universityId)
        return [
          g.sheet?.university ?? uni?.shortName ?? '', g.sheet?.course ?? courseName(db, g.courseId), g.sheet?.cohort ?? intake?.name ?? '', g.sheet?.year ?? '', g.sheet?.semester ?? '',
          g.sheet?.startingFrom ?? '', g.sheet?.letter ?? g.code, ctx.students.get(g.id) ?? null, g.rawDays ?? describeSessions(groupSessions(g)), campusName(db, g.campusId), g.room ?? '',
          pat ? pat.name : '', pat ? (ctx.groupsOf.get(pat.id) ?? []).length : null, pat ? patHours(db, pat) : '', pat ? dayOff(pat.workDays) : '',
        ]
      }),
  }))
}

/**
 * An example allocation sheet for a new May 2027 intake, built from demo staff and the planned groups' timetables, with the same messiness as the real one:
 * abbreviations, first names only, "Newcastel", an unknown PAT and one unreadable row.
 */
export function exampleAllocationWorkbook(db: DbState): Sheet[] {
  const planned = db.groups.filter((g) => g.intakeId === 'in-wlv-2701')
  const pats = db.users.filter((u) => u.role === 'pat' && u.status === 'active')
  const short: Record<string, string> = { 'BA (Hons) Business Management': 'BM', 'BSc (Hons) Health and Social Care': 'HSC', 'BSc (Hons) Computing': 'Computing' }
  const rowsFor = (campusId: string) =>
    planned
      .filter((g) => g.campusId === campusId)
      .map((g, i) => {
        const local = pats.filter((u) => u.campusId === campusId)
        const pat = i % 3 === 2 ? null : local[i % Math.max(1, local.length)] ?? null
        const letter = String.fromCharCode(65 + i)
        return [
          i % 2 ? 'UoW' : 'UOW', short[courseName(db, g.courseId)] ?? courseName(db, g.courseId), 'May-27', 'FY', 'Semester 1', 'Week from 24th May', letter,
          g.expectedStudents ?? null, g.rawDays ?? describeSessions(groupSessions(g)), campusName(db, campusId), `R${100 + i}`,
          pat ? (i % 2 ? pat.name.split(' ')[0] : pat.name) : '', null, pat ? patHours(db, pat) : '', pat ? dayOff(pat.workDays) : '',
        ]
      })
  const salford = rowsFor('c-salford')
  const derby = rowsFor('c-derby')
  const newcastle = rowsFor('c-newcastle').map((r) => r.map((c, i) => (i === 9 ? 'Newcastel' : c)))
  const extra = [
    ['UOW', 'BM', 'May-27', 'FY', 'Semester 1', 'Week from 24th May', 'Z', 30, 'Thurday Eve / Saturday Afr', 'Salford', 'R199', 'Someone New', null, '13:00-21:00', 'Sunday/Monday'],
    ['UOW', 'BM', 'May-27', 'FY', 'Semester 1', 'Week from 24th May', 'Y', 28, 'TBC', 'Salford', '', '', null, '', ''],
  ]
  return [
    { name: 'Salford', columns: SHEET_COLUMNS, rows: [...salford, ...extra] },
    { name: 'Derby', columns: SHEET_COLUMNS, rows: derby },
    { name: 'NewCastle', columns: SHEET_COLUMNS, rows: newcastle },
  ]
}

export const describeDraftChange = (db: DbState, from: string | null, to: string | null) => `${userName(db, from)} → ${userName(db, to)}`
