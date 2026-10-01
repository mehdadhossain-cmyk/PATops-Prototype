// PAT allocation: reading the allocation sheet's free text, checking the allocation rules,
// and suggesting an allocation. Pure functions so they're easy to test and move server-side.
import type { AllocationDraft, AllocationProfile, ClassSession, DbState, Group, Slot, User, Weekday } from './types'
import { SLOTS, WEEKDAYS } from './types'

// ---- Time slots -------------------------------------------------------------

const SLOT_WINDOW: Record<Slot, [number, number]> = { Mor: [9 * 60, 13 * 60], Afr: [13 * 60, 17 * 60], Eve: [17 * 60, 21 * 60] }
/** A session occupies a slot when it overlaps it by at least this many minutes (so 09:30–13:30 is morning only). */
const MIN_OVERLAP = 60

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Slots covered by a time range, e.g. 09:00–17:00 → morning and afternoon. */
export function slotsForTimes(start: string, end: string): Slot[] {
  const a = toMin(start)
  const b = toMin(end)
  return SLOTS.filter((s) => Math.min(b, SLOT_WINDOW[s][1]) - Math.max(a, SLOT_WINDOW[s][0]) >= MIN_OVERLAP)
}

// ---- Reading the sheet's free text ------------------------------------------------

const DAY_WORD = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/
const DAY_OF: Record<string, Weekday> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const TYPOS: Record<string, string> = { thurday: 'thursday', wednday: 'wednesday', wendesday: 'wednesday', tueday: 'tuesday' }

export function asDay(word: string): Weekday | null {
  let w = word.toLowerCase()
  w = TYPOS[w] ?? w
  return DAY_WORD.test(w) ? DAY_OF[w.slice(0, 3)] : null
}

function slotsForWord(word: string): Slot[] {
  const w = word.toLowerCase()
  if (w.startsWith('full')) return ['Mor', 'Afr']
  if (w.startsWith('mor')) return ['Mor']
  if (w.startsWith('af')) return ['Afr']
  if (w.startsWith('eve')) return ['Eve']
  return []
}

/** "9am", "12.30", "14:30", "4.30pm" → "HH:MM" (hours below 8 without am/pm are read as pm). */
function clock(h: string, m: string | undefined, ap: string | undefined): string {
  let hour = Number(h)
  if (ap === 'pm' && hour < 12) hour += 12
  if (!ap && hour < 8) hour += 12
  return `${String(hour).padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`
}

const TIME_RANGE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/gi

export interface ParsedDays {
  sessions: ClassSession[]
  /** True when a day had no session words and was taken as a full day. */
  assumedFullDay: boolean
  error: string | null
}

/**
 * Reads the "Group Day" column, e.g. "Mon Eve/Tues Evening", "Monday Full Day/Tuesday Morning",
 * "Wednesday(9am-12.30)/Saturday Full", "Friday (14:30 - 21:00) and Saturday (13:30 - 17:30)".
 * Days without their own session words take the next day's ("Mon/Tues Evening" = both evenings);
 * a day with none at all is a full day.
 */
export function parseGroupDays(raw: string): ParsedDays {
  const text = raw.replace(/([a-z])([A-Z])/g, '$1 $2') // "SundayAft" → "Sunday Aft"
  const tokens: { kind: 'day' | 'slots'; day?: Weekday; slots?: Slot[] }[] = []
  const re = new RegExp(`${TIME_RANGE.source}|[A-Za-z]+`, 'gi')
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      const start = clock(m[1], m[2], m[3]?.toLowerCase())
      const end = clock(m[4], m[5], m[6]?.toLowerCase())
      tokens.push({ kind: 'slots', slots: slotsForTimes(start, end) })
      continue
    }
    const d = asDay(m[0])
    if (d) tokens.push({ kind: 'day', day: d })
    else {
      const s = slotsForWord(m[0])
      if (s.length) tokens.push({ kind: 'slots', slots: s })
    }
  }
  const sessions: { day: Weekday; slots: Set<Slot> }[] = []
  for (const t of tokens) {
    if (t.kind === 'day') sessions.push({ day: t.day!, slots: new Set() })
    else if (sessions.length) t.slots!.forEach((s) => sessions[sessions.length - 1].slots.add(s))
  }
  if (sessions.length === 0) return { sessions: [], assumedFullDay: false, error: `No day found in "${raw}"` }
  let next: Set<Slot> | null = null
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].slots.size) next = sessions[i].slots
    else if (next) sessions[i].slots = new Set(next)
  }
  let assumedFullDay = false
  for (const s of sessions) {
    if (s.slots.size === 0) {
      s.slots = new Set(['Mor', 'Afr'])
      assumedFullDay = true
    }
  }
  // Merge repeated days ("Monday … Monday Eve").
  const merged = new Map<Weekday, Set<Slot>>()
  for (const s of sessions) merged.set(s.day, new Set([...(merged.get(s.day) ?? []), ...s.slots]))
  return {
    sessions: WEEKDAYS.filter((d) => merged.has(d)).map((d) => ({ day: d, slots: SLOTS.filter((s) => merged.get(d)!.has(s)) })),
    assumedFullDay,
    error: null,
  }
}

/** "09:00-17:00", "9:00-17:00", "13:00 - 21:00 (Thu)", "13:00-21PM" → { start, end }. */
export function parseHours(raw: string): { start: string; end: string; warning: string | null } | null {
  const m = raw.replace(/\(.*?\)/g, '').match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  const start = `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
  let endH = Number(m[3])
  let warning: string | null = null
  if (endH <= Number(m[1])) {
    endH += 12
    warning = `Read "${raw.trim()}" as ${start}-${String(endH).padStart(2, '0')}:${m[4] ?? '00'}`
  }
  return { start, end: `${String(endH).padStart(2, '0')}:${m[4] ?? '00'}`, warning }
}

/** "Saturday/Sunday", "Wed/Thurs", "Saturday/Sunday (Until Jan arrives)" → days off. */
export function parseDaysOff(raw: string): Weekday[] {
  const days = new Set<Weekday>()
  for (const w of raw.replace(/\(.*?\)/g, '').split(/[^A-Za-z]+/)) {
    const d = asDay(w)
    if (d) days.add(d)
  }
  return WEEKDAYS.filter((d) => days.has(d))
}

/** Back to sheet-style text, e.g. "Monday Full / Tuesday Mor". */
export function describeSessions(sessions: ClassSession[]): string {
  const full: Record<Weekday, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
  return sessions
    .map((s) => {
      const has = (x: Slot) => s.slots.includes(x)
      const parts = has('Mor') && has('Afr') ? ['Full', ...(has('Eve') ? ['Eve'] : [])] : s.slots.map((x) => ({ Mor: 'Mor', Afr: 'Afr', Eve: 'Eve' })[x])
      return `${full[s.day]} ${parts.join(', ')}`
    })
    .join(' / ')
}

// ---- Groups and PATs --------------------------------------------------------------

export function groupSessions(g: Group): ClassSession[] {
  if (g.sessions?.length) return g.sessions
  const slots = slotsForTimes(g.startTime, g.endTime)
  return g.classDays.map((day) => ({ day, slots }))
}

export function defaultHours(u: User): string {
  return u.shift === 'evening' ? '13:00-21:00' : '09:00-17:00'
}

export function profileFor(db: DbState, userId: string): AllocationProfile {
  return (
    db.allocationProfiles.find((p) => p.userId === userId) ?? {
      userId, workHours: null, availableFrom: null, maxStudents: null, minStudents: null, targetGroups: null, uniTargets: {}, preferredCampusIds: [], notes: '',
    }
  )
}

export function patHours(db: DbState, u: User): string {
  return profileFor(db, u.id).workHours || defaultHours(u)
}

export function patSlots(db: DbState, u: User): Slot[] {
  const h = parseHours(patHours(db, u))
  return h ? slotsForTimes(h.start, h.end) : ['Mor', 'Afr']
}

export const DEFAULT_MAX_STUDENTS = 200
export const MAX_GROUPS_PER_DAY = 2

export function allocationCandidates(db: DbState): User[] {
  return db.users.filter((u) => u.role === 'pat' && (u.status === 'active' || u.status === 'onboarding'))
}

// ---- Allocation context (current allocation + a draft's changes) ---------------------

export interface AllocContext {
  db: DbState
  draft: AllocationDraft | null
  /** groupId → patId under the draft (or the live allocation). */
  patOf: Map<string, string | null>
  groupsOf: Map<string, Group[]>
  students: Map<string, number | null>
  uniOf: Map<string, string>
  intakeStart: Map<string, string>
}

export function buildContext(db: DbState, draft: AllocationDraft | null): AllocContext {
  const patOf = new Map<string, string | null>()
  for (const g of db.groups) patOf.set(g.id, draft?.assignments[g.id] ? draft.assignments[g.id].patId : g.patId)
  const groupsOf = new Map<string, Group[]>()
  for (const g of db.groups) {
    const p = patOf.get(g.id)
    if (p) groupsOf.set(p, [...(groupsOf.get(p) ?? []), g])
  }
  const counts = new Map<string, number>()
  for (const s of db.students) if (s.status === 'active') counts.set(s.groupId, (counts.get(s.groupId) ?? 0) + 1)
  const students = new Map<string, number | null>()
  for (const g of db.groups) students.set(g.id, counts.get(g.id) || g.expectedStudents || null)
  const uniShort = new Map(db.universities.map((u) => [u.id, u.shortName.toUpperCase()]))
  const intakeUni = new Map(db.intakes.map((i) => [i.id, i.universityId]))
  const uniOf = new Map(db.groups.map((g) => [g.id, (g.sheet?.university || uniShort.get(intakeUni.get(g.intakeId) ?? '') || '').toUpperCase()]))
  const intakeStart = new Map(db.intakes.map((i) => [i.id, i.startDate]))
  return { db, draft, patOf, groupsOf, students, uniOf, intakeStart }
}

export function assign(ctx: AllocContext, groupId: string, patId: string | null) {
  const prev = ctx.patOf.get(groupId)
  const g = ctx.db.groups.find((x) => x.id === groupId)!
  if (prev) ctx.groupsOf.set(prev, (ctx.groupsOf.get(prev) ?? []).filter((x) => x.id !== groupId))
  if (patId) ctx.groupsOf.set(patId, [...(ctx.groupsOf.get(patId) ?? []), g])
  ctx.patOf.set(groupId, patId)
}

export function patStudentLoad(ctx: AllocContext, patId: string): { students: number; unknown: number } {
  let students = 0
  let unknown = 0
  for (const g of ctx.groupsOf.get(patId) ?? []) {
    const n = ctx.students.get(g.id)
    if (n === null || n === undefined) unknown++
    else students += n
  }
  return { students, unknown }
}

// ---- Rules --------------------------------------------------------------------------

export interface Evaluation {
  hard: string[]
  soft: string[]
  score: number
  studentsAfter: number
}

const SLOT_WORD: Record<Slot, string> = { Mor: 'morning', Afr: 'afternoon', Eve: 'evening' }

/** Checks placing `groupId` with `patId`, given everything else the PAT already has. */
export function evaluate(ctx: AllocContext, patId: string, groupId: string): Evaluation {
  const { db } = ctx
  const pat = db.users.find((u) => u.id === patId)!
  const g = db.groups.find((x) => x.id === groupId)!
  const prof = profileFor(db, patId)
  const hard: string[] = []
  const soft: string[] = []
  const others = (ctx.groupsOf.get(patId) ?? []).filter((x) => x.id !== groupId)
  const sessions = groupSessions(g)
  const hours = patHours(db, pat)
  const workSlots = patSlots(db, pat)

  if (pat.status !== 'active' && pat.status !== 'onboarding') hard.push('Not an active PAT')
  const start = ctx.intakeStart.get(g.intakeId)
  if (prof.availableFrom && start && prof.availableFrom > start) hard.push(`Available from ${prof.availableFrom}`)

  for (const s of sessions) {
    if (!pat.workDays.includes(s.day)) {
      hard.push(`${s.day} is a day off`)
      continue
    }
    const outside = s.slots.filter((x) => !workSlots.includes(x))
    if (outside.length) hard.push(`${s.day} ${outside.map((x) => SLOT_WORD[x]).join(' & ')} is outside ${hours}`)
    for (const o of others) {
      const os = groupSessions(o).find((x) => x.day === s.day)
      const overlap = os?.slots.filter((x) => s.slots.includes(x)) ?? []
      if (overlap.length) hard.push(`Clashes with ${o.code} on ${s.day} ${overlap.map((x) => SLOT_WORD[x]).join(' & ')}`)
    }
    const sameDay = others.filter((o) => groupSessions(o).some((x) => x.day === s.day)).length
    if (sameDay + 1 > MAX_GROUPS_PER_DAY) hard.push(`Would have ${sameDay + 1} groups on ${s.day} (max ${MAX_GROUPS_PER_DAY})`)
  }

  const max = prof.maxStudents ?? DEFAULT_MAX_STUDENTS
  let before = 0
  for (const o of others) before += ctx.students.get(o.id) ?? 0
  const mine = ctx.students.get(g.id)
  const after = before + (mine ?? 0)
  if (after > max) hard.push(`Would have ${after} students (max ${max})`)

  // Soft rules.
  if (mine === null || mine === undefined) soft.push('Student count unknown')
  const campusOk = pat.campusId === g.campusId || prof.preferredCampusIds.includes(g.campusId)
  if (!campusOk) soft.push('Different campus')
  if (pat.status === 'onboarding') soft.push('Still completing training')
  const uni = ctx.uniOf.get(g.id) ?? ''
  const targets = prof.uniTargets
  if (Object.keys(targets).length) {
    const t = targets[uni]
    const have = others.filter((o) => ctx.uniOf.get(o.id) === uni).length
    if (t === undefined) soft.push(`${uni || 'This university'} isn't in their target mix`)
    else if (have + 1 > t) soft.push(`Target is ${t} ${uni} group${t === 1 ? '' : 's'}`)
  }
  if (prof.targetGroups !== null && others.length + 1 > prof.targetGroups) soft.push(`Target is ${prof.targetGroups} groups`)

  // Lower is better: few warnings, same campus, spread the load, keep a PAT's groups similar.
  const sameUni = others.some((o) => ctx.uniOf.get(o.id) === uni)
  const sameCourse = others.some((o) => o.courseId === g.courseId)
  const needsMore = prof.minStudents !== null && before < prof.minStudents
  const score =
    soft.length * 15 + (campusOk ? 0 : 30) + (after / max) * 30 + others.length * 4 - (sameUni ? 4 : 0) - (sameCourse ? 3 : 0) - (needsMore ? 12 : 0)
  return { hard: [...new Set(hard)], soft, score, studentsAfter: after }
}

// ---- Auto-allocation -------------------------------------------------------------------

export interface Suggestion {
  groupId: string
  patId: string | null
  reason: string
}

function explainChoice(ctx: AllocContext, patId: string, groupId: string, e: Evaluation): string {
  const g = ctx.db.groups.find((x) => x.id === groupId)!
  const prof = profileFor(ctx.db, patId)
  const bits = [`Fits ${groupSessions(g).map((s) => `${s.day} ${s.slots.map((x) => SLOT_WORD[x].slice(0, 3)).join('+')}`).join(', ')}`, `${e.studentsAfter}/${prof.maxStudents ?? DEFAULT_MAX_STUDENTS} students`]
  const pat = ctx.db.users.find((u) => u.id === patId)!
  if (pat.campusId === g.campusId) bits.push('same campus')
  if (e.soft.length) bits.push(`note: ${e.soft.join('; ')}`)
  return bits.join(' · ')
}

/**
 * Why nobody can take a group. First: does anyone even work those days and times? If so, what stops
 * those PATs (clashes, 2-groups-a-day, student cap, start date)?
 */
function explainNoFit(ctx: AllocContext, groupId: string, pats: User[]): string {
  const g = ctx.db.groups.find((x) => x.id === groupId)!
  const when = groupSessions(g).map((s) => `${s.day} ${s.slots.map((x) => SLOT_WORD[x]).join(' & ')}`).join(', ')
  const works = pats.filter((p) => {
    const slots = patSlots(ctx.db, p)
    return groupSessions(g).every((s) => p.workDays.includes(s.day) && s.slots.every((x) => slots.includes(x)))
  })
  if (works.length === 0) return `No PAT works ${when}. Change a PAT's working pattern or recruit for these times.`
  const counts = new Map<string, number>()
  for (const p of works) {
    const e = evaluate(ctx, p.id, groupId)
    const key = e.hard[0]?.replace(/Clashes with \S+ on/, 'Already teaching on').replace(/Would have \d+ students.*/, 'Over the student limit').replace(/Would have \d+ groups on (\w+).*/, 'Already has 2 groups on $1') ?? ''
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} (${n})`)
  const local = works.filter((p) => p.campusId === g.campusId).length
  return `${works.length} PAT${works.length === 1 ? ' works' : 's work'} ${when} (${local} at this campus), but none can take it: ${top.join('; ')}.`
}

/**
 * Suggests a PAT for every unassigned, unlocked group in the draft. Hard rules are never broken.
 * Most-constrained groups go first; then pairs of suggestions are swapped when that lowers the total score.
 */
export function autoAllocate(db: DbState, draft: AllocationDraft): Suggestion[] {
  const ctx = buildContext(db, draft)
  const pats = allocationCandidates(db)
  const open = draft.groupIds.filter((id) => !draft.assignments[id]?.patId && !draft.assignments[id]?.locked)
  const feasible = (gid: string) => pats.filter((p) => evaluate(ctx, p.id, gid).hard.length === 0)

  const order = open
    .map((gid) => ({ gid, n: feasible(gid).length, size: ctx.students.get(gid) ?? 0 }))
    .sort((a, b) => a.n - b.n || b.size - a.size)
  const placed: string[] = []
  const unplaced: string[] = []
  for (const { gid } of order) {
    const options = pats.map((p) => ({ p, e: evaluate(ctx, p.id, gid) })).filter((o) => o.e.hard.length === 0).sort((a, b) => a.e.score - b.e.score)
    if (options.length) {
      assign(ctx, gid, options[0].p.id)
      placed.push(gid)
    } else unplaced.push(gid)
  }

  // Improvement pass: swap two suggested groups between their PATs if both still fit and the total improves.
  const scoreOf = (gid: string, pid: string) => evaluate(ctx, pid, gid).score
  for (let pass = 0; pass < 2; pass++) {
    let improved = false
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]
        const b = placed[j]
        const pa = ctx.patOf.get(a)!
        const pb = ctx.patOf.get(b)!
        if (pa === pb) continue
        const before = scoreOf(a, pa) + scoreOf(b, pb)
        assign(ctx, a, pb)
        assign(ctx, b, pa)
        const ea = evaluate(ctx, pb, a)
        const eb = evaluate(ctx, pa, b)
        if (ea.hard.length === 0 && eb.hard.length === 0 && ea.score + eb.score < before - 0.5) improved = true
        else {
          assign(ctx, a, pa)
          assign(ctx, b, pb)
        }
      }
    }
    if (!improved) break
  }

  return [
    ...placed.map((gid) => {
      const pid = ctx.patOf.get(gid)!
      return { groupId: gid, patId: pid, reason: explainChoice(ctx, pid, gid, evaluate(ctx, pid, gid)) }
    }),
    ...unplaced.map((gid) => ({ groupId: gid, patId: null, reason: explainNoFit(ctx, gid, pats) })),
  ]
}

/** Current placements (live or in a draft) that break a hard rule. */
export function currentProblems(ctx: AllocContext, groupIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const gid of groupIds) {
    const p = ctx.patOf.get(gid)
    if (!p) continue
    const e = evaluate(ctx, p, gid)
    if (e.hard.length) out.set(gid, e.hard)
  }
  return out
}

const SLOT_START: Record<Slot, string> = { Mor: '09:00', Afr: '13:00', Eve: '17:00' }
const SLOT_END: Record<Slot, string> = { Mor: '13:00', Afr: '17:00', Eve: '21:00' }

/** Turns the day × session grid into the fields the rest of the app reads (days, times, shift). */
export function scheduleFields(sessions: ClassSession[]): Pick<Group, 'sessions' | 'classDays' | 'startTime' | 'endTime' | 'shift'> {
  const sorted = WEEKDAYS.map((d) => sessions.find((s) => s.day === d)).filter((s): s is ClassSession => !!s && s.slots.length > 0)
  const slots = SLOTS.filter((x) => sorted.some((s) => s.slots.includes(x)))
  return {
    sessions: sorted.map((s) => ({ day: s.day, slots: SLOTS.filter((x) => s.slots.includes(x)) })),
    classDays: sorted.map((s) => s.day),
    startTime: SLOT_START[slots[0] ?? 'Mor'],
    endTime: SLOT_END[slots.at(-1) ?? 'Mor'],
    shift: slots.includes('Eve') ? 'evening' : 'morning',
  }
}
