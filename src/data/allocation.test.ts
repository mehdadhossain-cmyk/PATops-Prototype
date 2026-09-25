import { describe, expect, it } from 'vitest'
import { autoAllocate, buildContext, evaluate, parseDaysOff, parseGroupDays, parseHours, slotsForTimes } from './allocation'
import { previewAllocationImport, parseCohort } from './allocationImport'
import { exampleAllocationWorkbook } from './allocationSheets'
import { buildSeed } from './seed'
import type { AllocationDraft, DbState, Group, User } from './types'
import { buildXlsx } from '../lib/xlsx'
import { readXlsx } from '../lib/xlsxRead'

const days = (raw: string) => parseGroupDays(raw).sessions.map((s) => `${s.day}:${s.slots.join('+')}`).join(' ')

describe('parseGroupDays (formats taken from the real allocation sheet)', () => {
  it.each([
    ['Monday Full', 'Mon:Mor+Afr'],
    ['Tuesday', 'Tue:Mor+Afr'],
    ['Mon Eve/Tues Evening', 'Mon:Eve Tue:Eve'],
    ['Monday Full Day/Tuesday Morning', 'Mon:Mor+Afr Tue:Mor'],
    ['Friday Mor/Saturday Afternoon', 'Fri:Mor Sat:Afr'],
    ['Tuesday/Wednesday Mor', 'Tue:Mor Wed:Mor'],
    ['Monday / Tuesday / Wednesday Evenings', 'Mon:Eve Tue:Eve Wed:Eve'],
    ['WED Morning & Afternoon/ THU Morning & Afternoon', 'Wed:Mor+Afr Thu:Mor+Afr'],
    ['Monday Full, Eve & Tuesday Full, Eve', 'Mon:Mor+Afr+Eve Tue:Mor+Afr+Eve'],
    ['Thursday morning & afternoon, Friday full day', 'Thu:Mor+Afr Fri:Mor+Afr'],
    ['Wednesday(9am-12.30)/Saturday Full', 'Wed:Mor Sat:Mor+Afr'],
    ['Friday (1pm to 4.30pm) Saturday Full', 'Fri:Afr Sat:Mor+Afr'],
    ['Tuesday  (09:00 - 15:30) and Wednesday (09:00 - 13:00)', 'Tue:Mor+Afr Wed:Mor'],
    ['Friday (14:30 - 21:00) and Saturday (13:30 - 17:30)', 'Fri:Afr+Eve Sat:Afr'],
    ['SundayAft/Monday After', 'Mon:Afr Sun:Afr'],
    ['Thurday Eve/Sunday Mor', 'Thu:Eve Sun:Mor'],
    ['Wednday After/Thursday Full day', 'Wed:Afr Thu:Mor+Afr'],
    ['Tuesday Afteroon / Wednesday FullDay', 'Tue:Afr Wed:Mor+Afr'],
    ['Wed Eve / Thu Eve / Sat Afr', 'Wed:Eve Thu:Eve Sat:Afr'],
    ['Monday Evening & Sunday Full', 'Mon:Eve Sun:Mor+Afr'],
  ])('%s', (raw, expected) => {
    expect(days(raw)).toBe(expected)
  })
  it('flags text with no day', () => {
    expect(parseGroupDays('TBC').error).toBeTruthy()
  })
  it('notes when a bare day was taken as a full day', () => {
    expect(parseGroupDays('Thursday').assumedFullDay).toBe(true)
    expect(parseGroupDays('Thursday Eve').assumedFullDay).toBe(false)
  })
})

describe('hours, days off and slots', () => {
  it('reads working hours in the sheet’s formats', () => {
    expect(parseHours('09:00-17:00')).toMatchObject({ start: '09:00', end: '17:00', warning: null })
    expect(parseHours('9:00-17:00')).toMatchObject({ start: '09:00', end: '17:00' })
    expect(parseHours('13:00 - 21:00')).toMatchObject({ start: '13:00', end: '21:00' })
    expect(parseHours('13:00-21:00 (Thu)')).toMatchObject({ start: '13:00', end: '21:00' })
    expect(parseHours('13:00-21PM')).toMatchObject({ start: '13:00', end: '21:00' })
    expect(parseHours('09:00-05:00')?.end).toBe('17:00')
    expect(parseHours('09:00-05:00')?.warning).toBeTruthy()
    expect(parseHours('3')).toBeNull()
  })
  it('reads days off', () => {
    expect(parseDaysOff('Saturday/Sunday')).toEqual(['Sat', 'Sun'])
    expect(parseDaysOff('Wed/Thurs')).toEqual(['Wed', 'Thu'])
    expect(parseDaysOff('Saturday/Sunday (Until Jan arrives)')).toEqual(['Sat', 'Sun'])
  })
  it('maps times to slots with a one-hour overlap', () => {
    expect(slotsForTimes('09:00', '17:00')).toEqual(['Mor', 'Afr'])
    expect(slotsForTimes('13:00', '21:00')).toEqual(['Afr', 'Eve'])
    expect(slotsForTimes('09:30', '13:30')).toEqual(['Mor'])
    expect(slotsForTimes('17:30', '21:00')).toEqual(['Eve'])
  })
  it('reads cohorts', () => {
    expect(parseCohort('Sep-25')).toBe('2025-09-01')
    expect(parseCohort('Jan-27')).toBe('2027-01-01')
    expect(parseCohort(46023)).toBe('2026-01-01')
  })
})

// A small, controlled world for the rules.
const base = buildSeed()
const pat = (id: string, p: Partial<User>): User => ({ ...base.users.find((u) => u.role === 'pat')!, id, name: id, campusId: 'c-salford', status: 'active', shift: 'morning', workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ...p })
const grp = (id: string, raw: string, p: Partial<Group> = {}): Group => ({
  id, code: id, intakeId: 'in-wlv-2701', courseId: 'crs-bm', campusId: 'c-salford', shift: 'morning', classDays: [], startTime: '09:00', endTime: '13:00', patId: null,
  sessions: parseGroupDays(raw).sessions, rawDays: raw, expectedStudents: 30, ...p,
})
function world(users: User[], groups: Group[]): DbState {
  return { ...base, users, groups, students: [], allocationProfiles: [], allocationDrafts: [] }
}
const draftOf = (db: DbState, ids: string[]): AllocationDraft => ({
  id: 'd', name: 'D', groupIds: ids, createdBy: '', createdAt: '', updatedAt: '', status: 'draft', publishedAt: null, publishedBy: null,
  assignments: Object.fromEntries(ids.map((id) => [id, { patId: db.groups.find((g) => g.id === id)!.patId, source: 'current' as const, locked: false, reason: '', overrideReason: '' }])),
})

describe('evaluate (the allocation rules)', () => {
  it('blocks day off, hours, clashes, a third group in a day and the student cap', () => {
    const a = pat('A', {})
    const db = world([a], [
      grp('own1', 'Monday Mor', { patId: 'A' }),
      grp('own2', 'Monday Afr', { patId: 'A' }),
      grp('sat', 'Saturday Full'),
      grp('eve', 'Tuesday Eve'),
      grp('clash', 'Monday Mor'),
      grp('third', 'Monday Eve'),
      grp('big', 'Wednesday Mor', { expectedStudents: 150 }),
      grp('ok', 'Thursday Full'),
    ])
    const ctx = buildContext(db, null)
    const e = (g: string) => evaluate(ctx, 'A', g)
    expect(e('sat').hard.join()).toMatch(/Sat is a day off/)
    expect(e('eve').hard.join()).toMatch(/evening is outside 09:00-17:00/)
    expect(e('clash').hard.join()).toMatch(/Clashes with own1/)
    expect(e('third').hard.join()).toMatch(/3 groups on Mon/)
    expect(e('big').hard).toEqual(['Would have 210 students (max 200)'])
    expect(e('ok').hard).toEqual([])
  })
  it('warns (without blocking) for another campus and the university mix', () => {
    const a = pat('A', {})
    const db = { ...world([a], [grp('far', 'Tuesday Mor', { campusId: 'c-derby' })]), allocationProfiles: [{ userId: 'A', workHours: null, availableFrom: null, maxStudents: null, minStudents: null, targetGroups: null, uniTargets: { CCCU: 2 }, preferredCampusIds: [], notes: '' }] }
    const r = evaluate(buildContext(db, null), 'A', 'far')
    expect(r.hard).toEqual([])
    expect(r.soft).toContain('Different campus')
    expect(r.soft.join()).toMatch(/isn't in their target mix/)
  })
  it('respects "available from" and evening working hours', () => {
    const e = pat('E', { shift: 'evening' })
    const db = { ...world([e], [grp('m', 'Tuesday Mor'), grp('n', 'Tuesday Eve')]), allocationProfiles: [{ userId: 'E', workHours: null, availableFrom: '2027-02-01', maxStudents: null, minStudents: null, targetGroups: null, uniTargets: {}, preferredCampusIds: [], notes: '' }] }
    const ctx = buildContext(db, null)
    expect(evaluate(ctx, 'E', 'm').hard.join()).toMatch(/outside 13:00-21:00/)
    expect(evaluate(ctx, 'E', 'n').hard.join()).toMatch(/Available from 2027-02-01/)
  })
})

describe('autoAllocate', () => {
  it('never breaks a hard rule, places what fits and explains what does not', () => {
    const users = [pat('A', {}), pat('B', { workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Sat'] }), pat('C', { shift: 'evening' })]
    const groups = [grp('g1', 'Monday Full'), grp('g2', 'Monday Full'), grp('g3', 'Tuesday Eve / Wednesday Eve'), grp('g4', 'Saturday Mor'), grp('g5', 'Sunday Full'), grp('g6', 'Monday Mor')]
    const db = world(users, groups)
    const s = autoAllocate(db, draftOf(db, groups.map((g) => g.id)))
    const placed = s.filter((x) => x.patId)
    // Verify every suggestion together against the rules.
    const draft = draftOf(db, groups.map((g) => g.id))
    for (const x of s) draft.assignments[x.groupId].patId = x.patId
    const ctx = buildContext(db, draft)
    for (const x of placed) expect(evaluate(ctx, x.patId!, x.groupId).hard).toEqual([])
    expect(s.find((x) => x.groupId === 'g3')!.patId).toBe('C')
    expect(s.find((x) => x.groupId === 'g4')!.patId).toBe('B')
    expect(s.find((x) => x.groupId === 'g5')!.patId).toBeNull()
    expect(s.find((x) => x.groupId === 'g5')!.reason).toMatch(/No PAT works Sun/)
    expect(new Set(placed.map((x) => x.patId)).size).toBeGreaterThan(1) // spreads the load
  })
  it('leaves locked and already allocated groups alone', () => {
    const db = world([pat('A', {}), pat('B', {})], [grp('x', 'Tuesday Mor', { patId: 'A' }), grp('y', 'Wednesday Mor')])
    const d = draftOf(db, ['x', 'y'])
    d.assignments.y.locked = true
    expect(autoAllocate(db, d)).toEqual([])
  })
  it('handles the demo January 2027 draft quickly and safely', () => {
    const db = buildSeed()
    const t = Date.now()
    const s = autoAllocate(db, db.allocationDrafts[0])
    expect(Date.now() - t).toBeLessThan(2000)
    const d = structuredClone(db.allocationDrafts[0])
    for (const x of s) d.assignments[x.groupId].patId = x.patId
    const ctx = buildContext(db, d)
    for (const x of s.filter((y) => y.patId)) expect(evaluate(ctx, x.patId!, x.groupId).hard).toEqual([])
    expect(s.filter((x) => x.patId).length).toBeGreaterThan(s.length / 2)
  })
})

describe('allocation sheet import', () => {
  it('round-trips the example workbook through .xlsx and imports it', () => {
    const db = buildSeed()
    const sheets = readXlsx(buildXlsx(exampleAllocationWorkbook(db)))
    expect(sheets.map((s) => s.name)).toEqual(['Salford', 'Derby', 'NewCastle'])
    const p = previewAllocationImport(db, sheets, sheets.map((s) => s.name), { updatePatterns: true })
    const msgs = p.rows.flatMap((r) => r.messages)
    expect(p.rows.find((r) => r.days.includes('TBC'))?.level).toBe('error')
    expect(msgs.some((m) => m.includes('Someone New'))).toBe(true)
    expect(p.rows.filter((r) => r.campus === 'Newcastle').length).toBeGreaterThan(0) // "Newcastel" matched
    expect(p.rows.find((r) => r.label.endsWith(' Z'))!.days).toBe('Thursday Eve / Saturday Afr') // "Thurday" typo read
    expect(p.groups.length).toBe(p.rows.filter((r) => r.level !== 'error').length)
    expect(p.newUniversities).toEqual([])
    expect(p.userPatches.length).toBeGreaterThan(0)
    // Matched PATs keep their demo working pattern.
    for (const { id, patch } of p.userPatches) expect(patch.workDays).toEqual(db.users.find((u) => u.id === id)!.workDays)
  })
})
