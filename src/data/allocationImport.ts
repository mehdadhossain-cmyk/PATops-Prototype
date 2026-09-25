// Importing the allocation workbook (one tab per campus, free-text columns) into structured groups.
import { describeSessions, parseDaysOff, parseGroupDays, parseHours, slotsForTimes } from './allocation'
import type { AllocationProfile, Course, DbState, Group, Intake, University, User, Weekday } from './types'
import { WEEKDAYS } from './types'
import { excelDate, type CellValue, type ReadSheet } from '../lib/xlsxRead'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
const str = (v: CellValue) => (v === null || v === undefined ? '' : String(v).trim())

const CAMPUS_ALIASES: Record<string, string> = { newcastel: 'newcastle', ch: 'collegehouse' }
const COURSE_ALIASES: Record<string, string> = {
  bm: 'business management', business: 'business management', dm: 'digital marketing', digitalmarketingmanagement: 'digital marketing',
  hsc: 'health and social care', psy: 'psychology', eventmanagement: 'events management', eventsmanagement: 'events management',
  fashionmanagement: 'fashion management and strategy', fashionmanagementandstrategy: 'fashion management and strategy', publichealth: 'public health',
}

export interface HeaderMap {
  row: number
  col: Record<'uni' | 'course' | 'cohort' | 'year' | 'semester' | 'starting' | 'letter' | 'students' | 'days' | 'campus' | 'room' | 'pat' | 'hours' | 'dayOff', number>
}

/** Finds the header row (the one with "Group Day" and "Campus") and the columns we use. */
export function findHeader(sheet: ReadSheet): HeaderMap | null {
  for (let r = 0; r < Math.min(sheet.rows.length, 15); r++) {
    const h = (sheet.rows[r] ?? []).map((c) => (typeof c === 'string' ? c.trim().toLowerCase() : ''))
    if (!h.includes('group day') || !h.includes('campus')) continue
    const find = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.startsWith(n)))
    return {
      row: r,
      col: {
        uni: find('partner university', 'university'), course: find('course'), cohort: find('cohort'), year: find('year'), semester: find('semester'),
        starting: find('starting from'), letter: h.findIndex((x) => x === 'group' || x === 'group name'), students: find('no. of stu', 'no of stu', 'students'),
        days: find('group day'), campus: find('campus'), room: find('room', 'scm no'), pat: h.indexOf('pat'), hours: find('working hours', 'working time'), dayOff: find('day off'),
      },
    }
  }
  return null
}

export interface SheetRowResult {
  sheet: string
  rowNo: number
  label: string
  days: string
  campus: string
  students: number | null
  patName: string
  patId: string | null
  level: 'ok' | 'warning' | 'error'
  messages: string[]
  groupId: string | null
}

export interface AllocationImportPreview {
  rows: SheetRowResult[]
  groups: Group[]
  newUniversities: University[]
  newCourses: Course[]
  newIntakes: Intake[]
  userPatches: { id: string; patch: Partial<User> }[]
  profiles: AllocationProfile[]
  patternNotes: string[]
}

/** Cohort cell → first day of the cohort month (Excel dates, "Sep-25", "Jan 2026", ISO). */
export function parseCohort(v: CellValue): string | null {
  if (typeof v === 'number' && v > 20000) return excelDate(v).slice(0, 8) + '01'
  const s = str(v)
  const iso = s.match(/^(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-01`
  const m = s.match(/([A-Za-z]{3})[a-z]*[\s-/]*'?(\d{2,4})/)
  if (!m) return null
  const mi = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase()))
  if (mi < 0) return null
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return `${y}-${String(mi + 1).padStart(2, '0')}-01`
}

/** Matches a PAT as written on the sheet (a first name only, a full name, or in capitals) to a staff record. */
export function matchPat(users: User[], name: string, campusId: string | null): { user: User | null; note: string | null } {
  const n = norm(name)
  if (!n) return { user: null, note: null }
  const pats = users.filter((u) => u.role === 'pat' || u.role === 'lead')
  const exact = pats.filter((u) => norm(u.name) === n)
  if (exact.length === 1) return { user: exact[0], note: null }
  const first = pats.filter((u) => norm(u.name.split(' ')[0]) === norm(name.split(/\s+/)[0]) && (name.trim().split(/\s+/).length === 1 || norm(u.name).startsWith(n)))
  const pick = (list: User[]) => (list.length === 1 ? list[0] : list.filter((u) => u.campusId === campusId).length === 1 ? list.find((u) => u.campusId === campusId)! : null)
  const byFirst = pick(first)
  if (byFirst) return { user: byFirst, note: norm(byFirst.name) === n ? null : `Matched "${name.trim()}" to ${byFirst.name}` }
  if (first.length > 1) return { user: null, note: `"${name.trim()}" matches ${first.length} PATs; choose one on the board` }
  return { user: null, note: `PAT "${name.trim()}" not found; the group is left unallocated` }
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const MON_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function previewAllocationImport(db: DbState, sheets: ReadSheet[], sheetNames: string[], opts: { updatePatterns: boolean }): AllocationImportPreview {
  const rows: SheetRowResult[] = []
  const groups: Group[] = []
  const newUniversities: University[] = []
  const newCourses: Course[] = []
  const newIntakes: Intake[] = []
  const universities = [...db.universities]
  const courses = [...db.courses]
  const intakes = [...db.intakes]
  const seenKeys = new Map<string, { sheet: string; rowNo: number; pat: string }>()
  const patterns = new Map<string, { hours: Map<string, number>; off: Map<string, number> }>()
  const today = new Date().toISOString().slice(0, 10)

  const campusFor = (raw: string) => {
    const n = CAMPUS_ALIASES[norm(raw)] ?? norm(raw)
    return db.campuses.find((c) => norm(c.name) === n) ?? null
  }
  const uniFor = (raw: string) => {
    const n = norm(raw)
    let u = universities.find((x) => norm(x.shortName) === n || norm(x.name) === n)
    if (!u && n) {
      u = { id: uid('uni'), name: raw.trim().toUpperCase(), shortName: raw.trim().toUpperCase() }
      universities.push(u)
      newUniversities.push(u)
    }
    return u ?? null
  }
  const courseFor = (uni: University, raw: string) => {
    const cleaned = raw.replace(/\((hons)\)|-fy|\bfy\b|\(rwa\)|\brwa\b|year \d/gi, '').replace(/^(ba|bsc)\s+/i, '').trim()
    const full = COURSE_ALIASES[norm(cleaned)] ?? cleaned
    const want = norm(full)
    let c = courses.find((x) => x.universityId === uni.id && (norm(x.name).includes(want) || want.includes(norm(x.name).replace(/^(bahons|bschons|ba|bsc)/, ''))))
    if (!c && want) {
      c = { id: uid('crs'), name: full.replace(/\b(?!and\b)\w/g, (m) => m.toUpperCase()), universityId: uni.id }
      courses.push(c)
      newCourses.push(c)
    }
    return c ?? null
  }
  const intakeFor = (uni: University, cohort: string) => {
    let i = intakes.find((x) => x.universityId === uni.id && x.startDate.slice(0, 7) === cohort.slice(0, 7))
    if (!i) {
      const d = new Date(`${cohort}T12:00:00Z`)
      const name = `${MONTHS[d.getUTCMonth()].replace(/^./, (m) => m.toUpperCase())} ${d.getUTCFullYear()}`
      const end = new Date(d.getTime() + 3 * 365 * 86400000).toISOString().slice(0, 10)
      i = { id: uid('in'), universityId: uni.id, name, startDate: cohort, endDate: end, status: cohort > today ? 'planning' : 'active' }
      intakes.push(i)
      newIntakes.push(i)
    }
    return i
  }

  for (const sheet of sheets.filter((s) => sheetNames.includes(s.name))) {
    const h = findHeader(sheet)
    if (!h) continue
    const get = (r: CellValue[], k: keyof HeaderMap['col']) => (h.col[k] >= 0 ? r[h.col[k]] ?? null : null)
    sheet.rows.slice(h.row + 1).forEach((r, i) => {
      const rowNo = h.row + i + 2
      const daysRaw = str(get(r, 'days'))
      const courseRaw = str(get(r, 'course'))
      if (!daysRaw && !courseRaw) return
      const messages: string[] = []
      let level: SheetRowResult['level'] = 'ok'
      const err = (m: string) => { messages.push(m); level = 'error' }
      const warn = (m: string) => { messages.push(m); if (level === 'ok') level = 'warning' }

      const campus = campusFor(str(get(r, 'campus')))
      if (!campus) err(`Unknown campus "${str(get(r, 'campus'))}"`)
      const uni = uniFor(str(get(r, 'uni')))
      if (!uni) err('Missing partner university')
      else if (newUniversities.includes(uni) && !messages.some((m) => m.includes(uni.shortName))) warn(`New partner university ${uni.shortName} will be added`)
      const course = uni ? courseFor(uni, courseRaw) : null
      if (!course) err('Missing course')
      else if (newCourses.includes(course)) warn(`New course "${course.name}" will be added`)
      const cohort = parseCohort(get(r, 'cohort'))
      if (!cohort) err(`Can't read cohort "${str(get(r, 'cohort'))}"`)
      const parsed = parseGroupDays(daysRaw)
      if (parsed.error) err(parsed.error)
      else if (parsed.assumedFullDay) warn('A day without Mor/Afr/Eve was taken as a full day')
      const studentsRaw = get(r, 'students')
      const students = typeof studentsRaw === 'number' ? studentsRaw : Number(str(studentsRaw)) || null
      const letter = str(get(r, 'letter')) || '?'
      const patName = str(get(r, 'pat'))
      const { user, note } = matchPat(db.users, patName, campus?.id ?? null)
      if (note) warn(note)

      // Working pattern for the PAT, from this row.
      if (user) {
        const hrs = str(get(r, 'hours'))
        const off = str(get(r, 'dayOff'))
        const hp = hrs ? parseHours(hrs) : null
        if (hrs && !hp) warn(`Can't read working hours "${hrs}"`)
        if (hp?.warning) warn(hp.warning)
        const offDays = off ? parseDaysOff(off) : []
        if (off && offDays.length === 0) warn(`Can't read day off "${off}"`)
        const pat = patterns.get(user.id) ?? { hours: new Map(), off: new Map() }
        if (hp) pat.hours.set(`${hp.start}-${hp.end}`, (pat.hours.get(`${hp.start}-${hp.end}`) ?? 0) + 1)
        if (offDays.length) pat.off.set(offDays.join('/'), (pat.off.get(offDays.join('/')) ?? 0) + 1)
        patterns.set(user.id, pat)
      }

      let groupId: string | null = null
      if ((level as SheetRowResult['level']) !== 'error' && campus && uni && course && cohort) {
        const intake = intakeFor(uni, cohort)
        const year = norm(str(get(r, 'year')))
        const d = new Date(`${cohort}T12:00:00Z`)
        const courseCode = course.name.split(/\s+/).filter((w) => !/^(ba|bsc|\(hons\)|and|of|&)$/i.test(w)).map((w) => w[0]).join('').toUpperCase().slice(0, 4)
        const yearTag = /^y(ear)?\d$/i.test(year) ? `-Y${year.slice(-1)}` : ''
        const code = `${uni.shortName.toUpperCase()}-${courseCode}-${MON_ABBR[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}-${campus.name.replace(/\s/g, '').slice(0, 3).toUpperCase()}${yearTag}-${letter.toUpperCase()}`
        const key = `${intake.id}|${course.id}|${campus.id}|${year}|${letter.toLowerCase()}`
        const seen = seenKeys.get(key)
        if (seen) {
          // The same group listed on two tabs (e.g. a cohort tab and a campus tab): keep the first.
          warn(`Also listed on "${seen.sheet}" row ${seen.rowNo}; that row is used${norm(seen.pat) !== norm(patName) ? `. The PAT differs there ("${seen.pat}")` : ''}`)
        } else {
          seenKeys.set(key, { sheet: sheet.name, rowNo, pat: patName })
          const existing = db.groups.find((g) => g.code === code || (g.sheet && `${g.intakeId}|${g.courseId}|${g.campusId}|${norm(g.sheet.year)}|${g.sheet.letter.toLowerCase()}` === key))
          const sessions = parsed.sessions
          const all = sessions.flatMap((s) => s.slots)
          const evening = all.includes('Eve') && !all.includes('Mor')
          const start = all.includes('Mor') ? '09:00' : all.includes('Afr') ? '13:00' : '17:00'
          const end = all.includes('Eve') ? '21:00' : all.includes('Afr') ? '17:00' : '13:00'
          const g: Group = {
            id: existing?.id ?? uid('g'),
            code: existing?.code ?? code,
            intakeId: intake.id,
            courseId: course.id,
            campusId: campus.id,
            shift: evening ? 'evening' : 'morning',
            classDays: sessions.map((s) => s.day),
            startTime: start,
            endTime: end,
            patId: user?.id ?? null,
            sessions,
            rawDays: daysRaw,
            room: str(get(r, 'room')),
            expectedStudents: students,
            sheet: { university: str(get(r, 'uni')).toUpperCase(), course: courseRaw, cohort: `${MON_ABBR[d.getUTCMonth()].slice(0, 1)}${MON_ABBR[d.getUTCMonth()].slice(1).toLowerCase()}-${String(d.getUTCFullYear()).slice(2)}`, year: str(get(r, 'year')), semester: str(get(r, 'semester')), startingFrom: str(get(r, 'starting')), letter },
          }
          if (slotsForTimes(start, end).length === 0) warn('Unusual class times')
          groups.push(g)
          groupId = g.id
          if (existing) warn(`Updates existing group ${existing.code}`)
        }
      }
      rows.push({ sheet: sheet.name, rowNo, label: `${str(get(r, 'uni'))} ${courseRaw} ${letter}`.trim(), days: parsed.error ? daysRaw : describeSessions(parsed.sessions), campus: campus?.name ?? str(get(r, 'campus')), students, patName, patId: user?.id ?? null, level, messages, groupId })
    })
  }

  // One working pattern per PAT: the most common hours / days off across their rows.
  const userPatches: { id: string; patch: Partial<User> }[] = []
  const profiles: AllocationProfile[] = []
  const patternNotes: string[] = []
  if (opts.updatePatterns) {
    for (const [id, p] of patterns) {
      const u = db.users.find((x) => x.id === id)!
      const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      const hours = top(p.hours)
      const off = top(p.off)
      if (p.hours.size > 1 || p.off.size > 1) patternNotes.push(`${u.name}: the sheet has different working patterns on different rows; using ${hours ?? 'existing hours'}, days off ${off ?? 'unchanged'}`)
      const patch: Partial<User> = {}
      if (off) patch.workDays = WEEKDAYS.filter((d) => !(off.split('/') as Weekday[]).includes(d))
      if (hours) patch.shift = Number(hours.slice(0, 2)) >= 12 ? 'evening' : 'morning'
      userPatches.push({ id, patch })
      const existing = db.allocationProfiles.find((x) => x.userId === id)
      profiles.push({
        ...(existing ?? { userId: id, availableFrom: null, maxStudents: null, minStudents: null, targetGroups: null, uniTargets: {}, preferredCampusIds: [], notes: '' }),
        workHours: hours ?? existing?.workHours ?? null,
      })
    }
  }
  return { rows, groups, newUniversities, newCourses, newIntakes, userPatches, profiles, patternNotes }
}
