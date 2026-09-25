// Spreadsheet import for students and groups.
// Accepts CSV files or cells pasted straight from Excel (tab-separated).
import type { DbState, Group, Shift, Student, StudentStatus, Weekday } from './types'
import { WEEKDAYS } from './types'

export function parseTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

interface ColumnSpec<K extends string> {
  key: K
  label: string
  aliases: string[]
  required: boolean
}

function mapColumns<K extends string>(header: string[], specs: ColumnSpec<K>[]) {
  const idx = {} as Record<K, number>
  const missing: string[] = []
  for (const spec of specs) {
    const names = [spec.label, ...spec.aliases].map(norm)
    const i = header.findIndex((h) => names.includes(norm(h)))
    idx[spec.key] = i
    if (i < 0 && spec.required) missing.push(spec.label)
  }
  return { idx, missing }
}

export interface PreviewRow<T> {
  rowNo: number
  data: T | null
  action: 'create' | 'update' | 'skip'
  errors: string[]
  warnings: string[]
  label: string
}

export interface Preview<T> {
  missingColumns: string[]
  rows: PreviewRow<T>[]
}

// ---- Students --------------------------------------------------------------

type StudentKey = 'ebs' | 'uniId' | 'first' | 'last' | 'email' | 'uniEmail' | 'phone' | 'ecName' | 'ecPhone' | 'group' | 'status'

export const studentColumns: ColumnSpec<StudentKey>[] = [
  { key: 'ebs', label: 'EBS Person Code', aliases: ['person code', 'ebs code', 'ebs'], required: true },
  { key: 'uniId', label: 'Uni Student ID', aliases: ['student id', 'university id', 'uni id'], required: true },
  { key: 'first', label: 'First Name', aliases: ['forename', 'firstname', 'given name'], required: true },
  { key: 'last', label: 'Last Name', aliases: ['surname', 'lastname', 'family name'], required: true },
  { key: 'email', label: 'Personal Email', aliases: ['email', 'email address'], required: true },
  { key: 'uniEmail', label: 'Uni Email', aliases: ['university email', 'student email'], required: false },
  { key: 'phone', label: 'Phone', aliases: ['mobile', 'contact number', 'phone number'], required: true },
  { key: 'ecName', label: 'Emergency Contact Name', aliases: ['emergency contact', 'next of kin'], required: false },
  { key: 'ecPhone', label: 'Emergency Contact Phone', aliases: ['emergency contact number', 'emergency number', 'next of kin phone'], required: false },
  { key: 'group', label: 'Group Code', aliases: ['group'], required: true },
  { key: 'status', label: 'Status', aliases: [], required: false },
]

export const studentTemplate =
  studentColumns.map((c) => c.label).join(',') +
  '\n3999001,2512345,Maria,Popescu,maria.popescu@gmail.com,2512345@wlv.ac.uk,07700900111,Ion Popescu,07700900112,BM-S26-SAL-G01,Active'

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function previewStudents(db: DbState, text: string): Preview<Student> {
  const table = parseTable(text)
  if (table.length === 0) return { missingColumns: [], rows: [] }
  const { idx, missing } = mapColumns(table[0], studentColumns)
  if (missing.length) return { missingColumns: missing, rows: [] }

  const groupByCode = new Map(db.groups.map((g) => [g.code.toLowerCase(), g]))
  const byEbs = new Map(db.students.map((s) => [s.ebsPersonCode, s]))
  const byUniId = new Map(db.students.map((s) => [s.uniStudentId.toLowerCase(), s]))
  const seenEbs = new Set<string>()

  const rows = table.slice(1).map((r, i): PreviewRow<Student> => {
    const get = (k: StudentKey) => (idx[k] >= 0 ? (r[idx[k]] ?? '') : '')
    const errors: string[] = []
    const warnings: string[] = []
    const ebs = get('ebs')
    const uniId = get('uniId')
    const label = `${get('first')} ${get('last')}`.trim() || `Row ${i + 2}`

    if (!ebs) errors.push('Missing EBS person code')
    else if (seenEbs.has(ebs)) errors.push('EBS person code appears twice in this file')
    seenEbs.add(ebs)
    if (!uniId) errors.push('Missing uni student ID')
    if (!get('first') || !get('last')) errors.push('Missing name')
    if (!emailRe.test(get('email'))) errors.push('Invalid personal email')
    if (get('uniEmail') && !emailRe.test(get('uniEmail'))) errors.push('Invalid uni email')
    if (!get('phone')) errors.push('Missing phone number')
    if (!get('ecPhone')) warnings.push('No emergency contact number')

    const group = groupByCode.get(get('group').toLowerCase())
    if (!group) errors.push(`Unknown group code "${get('group')}"`)
    else if (!group.patId) warnings.push('Group has no PAT yet')

    const existing = byEbs.get(ebs)
    const clash = byUniId.get(uniId.toLowerCase())
    if (clash && clash.ebsPersonCode !== ebs) errors.push(`Uni student ID already belongs to ${clash.firstName} ${clash.lastName}`)

    const statusRaw = norm(get('status'))
    const status: StudentStatus = statusRaw.startsWith('withdr') ? 'withdrawn' : statusRaw.startsWith('interr') ? 'interrupted' : 'active'

    if (errors.length) return { rowNo: i + 2, data: null, action: 'skip', errors, warnings, label }

    const data: Student = {
      id: existing?.id ?? `s-${crypto.randomUUID().slice(0, 8)}`,
      firstName: get('first'),
      lastName: get('last'),
      personalEmail: get('email').toLowerCase(),
      uniEmail: get('uniEmail').toLowerCase(),
      phone: get('phone'),
      emergencyContactName: get('ecName'),
      emergencyContactPhone: get('ecPhone'),
      ebsPersonCode: ebs,
      uniStudentId: uniId,
      groupId: group!.id,
      status,
    }
    if (existing && existing.groupId !== data.groupId) {
      const from = db.groups.find((g) => g.id === existing.groupId)?.code
      warnings.push(`Moves group ${from} → ${group!.code}`)
    }
    return { rowNo: i + 2, data, action: existing ? 'update' : 'create', errors, warnings, label }
  })
  return { missingColumns: [], rows }
}

// ---- Groups ----------------------------------------------------------------

type GroupKey = 'code' | 'course' | 'campus' | 'shift' | 'days' | 'start' | 'end'

export const groupColumns: ColumnSpec<GroupKey>[] = [
  { key: 'code', label: 'Group Code', aliases: ['group', 'group name'], required: true },
  { key: 'course', label: 'Course', aliases: ['programme', 'course name'], required: true },
  { key: 'campus', label: 'Campus', aliases: ['site', 'location'], required: true },
  { key: 'shift', label: 'Shift', aliases: ['session'], required: false },
  { key: 'days', label: 'Class Days', aliases: ['days', 'teaching days'], required: true },
  { key: 'start', label: 'Start Time', aliases: ['start'], required: true },
  { key: 'end', label: 'End Time', aliases: ['end', 'finish time'], required: true },
]

export const groupTemplate =
  groupColumns.map((c) => c.label).join(',') +
  '\nBM-J27-SAL-G03,BA (Hons) Business Management,Salford,Morning,Mon & Tue,09:30,13:30'

export function parseDays(s: string): Weekday[] {
  const found = new Set<Weekday>()
  for (const part of s.split(/[^a-zA-Z]+/)) {
    const d = WEEKDAYS.find((w) => part.length >= 3 && w.toLowerCase() === part.slice(0, 3).toLowerCase())
    if (d) found.add(d)
  }
  return WEEKDAYS.filter((w) => found.has(w))
}

const timeRe = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/
const fmtTime = (t: string) => {
  const m = t.match(timeRe)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

export function previewGroups(db: DbState, intakeId: string, text: string): Preview<Group> {
  const table = parseTable(text)
  if (table.length === 0) return { missingColumns: [], rows: [] }
  const { idx, missing } = mapColumns(table[0], groupColumns)
  if (missing.length) return { missingColumns: missing, rows: [] }
  const intake = db.intakes.find((i) => i.id === intakeId)
  const courses = db.courses.filter((c) => c.universityId === intake?.universityId)
  const byCode = new Map(db.groups.map((g) => [g.code.toLowerCase(), g]))
  const seen = new Set<string>()

  const rows = table.slice(1).map((r, i): PreviewRow<Group> => {
    const get = (k: GroupKey) => (idx[k] >= 0 ? (r[idx[k]] ?? '') : '')
    const errors: string[] = []
    const warnings: string[] = []
    const code = get('code').toUpperCase()
    if (!code) errors.push('Missing group code')
    else if (seen.has(code)) errors.push('Group code appears twice in this file')
    seen.add(code)
    const existing = byCode.get(code.toLowerCase())
    if (existing && existing.intakeId !== intakeId) errors.push('Group code already used in another intake')

    const course = courses.find((c) => norm(c.name) === norm(get('course')) || norm(c.name).includes(norm(get('course'))))
    if (!course) errors.push(`Course "${get('course')}" not found for this university`)
    const campus = db.campuses.find((c) => norm(c.name) === norm(get('campus')))
    if (!campus) errors.push(`Unknown campus "${get('campus')}"`)
    const days = parseDays(get('days'))
    if (days.length === 0) errors.push('No valid class days')
    const start = fmtTime(get('start'))
    const end = fmtTime(get('end'))
    if (!start || !end) errors.push('Times must look like 09:30')
    else if (end <= start) errors.push('End time is before start time')

    const shiftRaw = norm(get('shift'))
    let shift: Shift = shiftRaw.startsWith('eve') ? 'evening' : 'morning'
    if (!shiftRaw && start) {
      shift = start >= '15:00' ? 'evening' : 'morning'
      warnings.push(`Shift inferred as ${shift}`)
    }
    const label = code || `Row ${i + 2}`
    if (errors.length) return { rowNo: i + 2, data: null, action: 'skip', errors, warnings, label }
    const data: Group = {
      id: existing?.id ?? `g-${crypto.randomUUID().slice(0, 8)}`,
      code,
      intakeId,
      courseId: course!.id,
      campusId: campus!.id,
      shift,
      classDays: days,
      startTime: start,
      endTime: end,
      patId: existing?.patId ?? null,
    }
    return { rowNo: i + 2, data, action: existing ? 'update' : 'create', errors, warnings, label }
  })
  return { missingColumns: [], rows }
}

// ---- Weekly attendance ----------------------------------------------------------

type AttKey = 'ebs' | 'uniId' | 'pct'

export const attendanceColumns: ColumnSpec<AttKey>[] = [
  { key: 'ebs', label: 'EBS Person Code', aliases: ['person code', 'ebs code', 'ebs'], required: false },
  { key: 'uniId', label: 'Uni Student ID', aliases: ['student id', 'university id', 'uni id'], required: false },
  { key: 'pct', label: 'Attendance %', aliases: ['attendance', 'overall attendance', 'overall', 'attendance percentage', '%'], required: true },
]

export const attendanceTemplate = 'EBS Person Code,Attendance %\n3000011,82%\n3000022,61.5%'

/** Accepts "72", "72%", "72.5 %" or an Excel fraction like "0.72". */
export function parsePercent(raw: string): number | null {
  const t = raw.replace('%', '').trim()
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null
  let n = Number(t)
  if (n <= 1 && t.includes('.') && !raw.includes('%')) n = n * 100
  if (n < 0 || n > 100) return null
  return Math.round(n * 10) / 10
}

export interface AttendanceRow {
  studentId: string
  overall: number
}

export function previewAttendance(db: DbState, text: string, threshold: number, weekEnding: string): Preview<AttendanceRow> {
  const table = parseTable(text)
  if (table.length === 0) return { missingColumns: [], rows: [] }
  const { idx, missing } = mapColumns(table[0], attendanceColumns)
  if (idx.ebs < 0 && idx.uniId < 0) missing.push('EBS Person Code or Uni Student ID')
  if (missing.length) return { missingColumns: missing, rows: [] }

  const byEbs = new Map(db.students.map((s) => [s.ebsPersonCode, s]))
  const byUni = new Map(db.students.map((s) => [s.uniStudentId.toLowerCase(), s]))
  // Compare with each student's most recent figure *before* this week (so re-uploads compare correctly).
  const latest = new Map<string, { week: string; overall: number }>()
  for (const r of db.attendance) {
    if (r.weekEnding >= weekEnding) continue
    const prev = latest.get(r.studentId)
    if (!prev || r.weekEnding > prev.week) latest.set(r.studentId, { week: r.weekEnding, overall: r.overall })
  }
  const thisWeek = new Set(db.attendance.filter((r) => r.weekEnding === weekEnding).map((r) => r.studentId))
  const seen = new Set<string>()

  const rows = table.slice(1).map((r, i): PreviewRow<AttendanceRow> => {
    const get = (k: AttKey) => (idx[k] >= 0 ? (r[idx[k]] ?? '') : '')
    const errors: string[] = []
    const warnings: string[] = []
    const s = (get('ebs') && byEbs.get(get('ebs'))) || (get('uniId') && byUni.get(get('uniId').toLowerCase())) || null
    const label = s ? `${s.firstName} ${s.lastName}` : get('ebs') || get('uniId') || `Row ${i + 2}`
    if (!s) errors.push('Student not found (check the EBS person code / uni ID)')
    else if (seen.has(s.id)) errors.push('Student appears twice in this file')
    const pct = parsePercent(get('pct'))
    if (pct === null) errors.push(`"${get('pct')}" is not a valid percentage`)
    if (s) seen.add(s.id)
    if (errors.length) return { rowNo: i + 2, data: null, action: 'skip', errors, warnings, label }

    if (s!.status !== 'active') warnings.push(`Student is ${s!.status}`)
    const before = latest.get(s!.id)?.overall
    if (before !== undefined) {
      if (before >= threshold && pct! < threshold) warnings.push(`Falls below ${threshold}% (was ${before}%)`)
      else if (before < threshold && pct! >= threshold) warnings.push(`Back above ${threshold}% (was ${before}%)`)
      else if (Math.abs(pct! - before) >= 15) warnings.push(`Large change from ${before}%`)
    } else if (pct! < threshold) warnings.push(`Below ${threshold}% in first report`)
    if (thisWeek.has(s!.id)) warnings.push('Replaces the figure already uploaded for this week')
    return { rowNo: i + 2, data: { studentId: s!.id, overall: pct! }, action: thisWeek.has(s!.id) ? 'update' : 'create', errors, warnings, label }
  })
  return { missingColumns: [], rows }
}

// ---- Non-submission lists -------------------------------------------------------

type NsKey = 'ebs' | 'uniId' | 'assessment'

export const nonSubmissionColumns: ColumnSpec<NsKey>[] = [
  { key: 'ebs', label: 'EBS Person Code', aliases: ['person code', 'ebs code', 'ebs'], required: false },
  { key: 'uniId', label: 'Uni Student ID', aliases: ['student id', 'university id', 'uni id'], required: false },
  { key: 'assessment', label: 'Assessment', aliases: ['module', 'module / assessment', 'assessment name', 'module code', 'component'], required: true },
]

export const nonSubmissionTemplate = 'EBS Person Code,Assessment\n3000011,4BM001 Principles of Management: Essay'

export interface NonSubmissionRow {
  studentId: string
  assessment: string
}

export function previewNonSubmissions(db: DbState, periodId: string, text: string): Preview<NonSubmissionRow> {
  const table = parseTable(text)
  if (table.length === 0) return { missingColumns: [], rows: [] }
  const { idx, missing } = mapColumns(table[0], nonSubmissionColumns)
  if (idx.ebs < 0 && idx.uniId < 0) missing.push('EBS Person Code or Uni Student ID')
  if (missing.length) return { missingColumns: missing, rows: [] }

  const period = db.submissionPeriods.find((p) => p.id === periodId)
  const byEbs = new Map(db.students.map((s) => [s.ebsPersonCode, s]))
  const byUni = new Map(db.students.map((s) => [s.uniStudentId.toLowerCase(), s]))
  const groupIntake = new Map(db.groups.map((g) => [g.id, g.intakeId]))
  const existing = new Set(db.nonSubmissions.filter((n) => n.periodId === periodId).map((n) => `${n.studentId}|${n.assessment.toLowerCase()}`))
  const seen = new Set<string>()

  const rows = table.slice(1).map((r, i): PreviewRow<NonSubmissionRow> => {
    const get = (k: NsKey) => (idx[k] >= 0 ? (r[idx[k]] ?? '') : '')
    const errors: string[] = []
    const warnings: string[] = []
    const s = (get('ebs') && byEbs.get(get('ebs'))) || (get('uniId') && byUni.get(get('uniId').toLowerCase())) || null
    const assessment = get('assessment')
    const label = s ? `${s.firstName} ${s.lastName}` : get('ebs') || get('uniId') || `Row ${i + 2}`
    if (!s) errors.push('Student not found (check the EBS person code / uni ID)')
    if (!assessment) errors.push('Missing assessment')
    const key = s ? `${s.id}|${assessment.toLowerCase()}` : ''
    if (s && assessment) {
      if (seen.has(key)) errors.push('Same student and assessment twice in this file')
      else if (existing.has(key)) errors.push('Already on this period’s list')
      seen.add(key)
    }
    if (errors.length) return { rowNo: i + 2, data: null, action: 'skip', errors, warnings, label }
    if (period && !period.intakeIds.includes(groupIntake.get(s!.groupId) ?? '')) warnings.push('Student is not in an intake covered by this period')
    if (s!.status !== 'active') warnings.push(`Student is ${s!.status}`)
    return { rowNo: i + 2, data: { studentId: s!.id, assessment }, action: 'create', errors, warnings, label: `${label} · ${assessment}` }
  })
  return { missingColumns: [], rows }
}
