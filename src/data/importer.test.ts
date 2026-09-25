import { describe, expect, it } from 'vitest'
import { parseDays, parseTable, previewGroups, previewStudents } from './importer'
import { buildSeed } from './seed'

const db = buildSeed()
const jan27 = db.groups.find((g) => g.intakeId === 'in-wlv-2701')!
const existing = db.students[0]

describe('parseTable', () => {
  it('parses CSV with quoted commas and escaped quotes', () => {
    expect(parseTable('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
  })
  it('detects tab-separated data pasted from Excel', () => {
    expect(parseTable('a\tb\r\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('drops blank lines', () => {
    expect(parseTable('a,b\n\n1,2\n,\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseDays', () => {
  it('understands common formats', () => {
    expect(parseDays('Mon & Wed')).toEqual(['Mon', 'Wed'])
    expect(parseDays('Wednesday, Monday')).toEqual(['Mon', 'Wed'])
    expect(parseDays('tue/thu')).toEqual(['Tue', 'Thu'])
    expect(parseDays('')).toEqual([])
  })
})

describe('previewStudents', () => {
  const header = 'Person Code,Student ID,Forename,Surname,Email,Mobile,Group,Emergency Contact Number'
  it('reports missing required columns', () => {
    expect(previewStudents(db, 'Forename,Surname\nA,B').missingColumns).toContain('EBS Person Code')
  })
  it('creates new students and updates existing ones by EBS code', () => {
    const csv = [
      header,
      `9000001,U9000001,Ann,Lee,ann@x.com,0770,${jan27.code},0771`,
      `${existing.ebsPersonCode},${existing.uniStudentId},${existing.firstName},${existing.lastName},${existing.personalEmail},${existing.phone},${jan27.code},0771`,
    ].join('\n')
    const p = previewStudents(db, csv)
    expect(p.rows.map((r) => r.action)).toEqual(['create', 'update'])
    expect(p.rows[1].data?.id).toBe(existing.id)
    expect(p.rows[1].warnings.join()).toMatch(/Moves group/)
  })
  it('rejects bad rows with clear reasons', () => {
    const csv = [
      header,
      `9000002,U1,Bob,Ray,not-an-email,0770,${jan27.code},`,
      `9000003,U2,Cy,Do,c@x.com,0770,NOPE,0771`,
      `9000004,${existing.uniStudentId},Di,Ed,d@x.com,0770,${jan27.code},0771`,
      `9000005,U5,Ed,Fo,e@x.com,0770,${jan27.code},0771`,
      `9000005,U6,Ed,Fo,e@x.com,0770,${jan27.code},0771`,
    ].join('\n')
    const [bad, unknown, clash, ok, dup] = previewStudents(db, csv).rows
    expect(bad.errors).toContain('Invalid personal email')
    expect(unknown.errors.join()).toMatch(/Unknown group code/)
    expect(clash.errors.join()).toMatch(/already belongs/)
    expect(ok.action).toBe('create')
    expect(dup.errors.join()).toMatch(/twice/)
  })
})

describe('previewGroups', () => {
  it('validates course, campus, days and times', () => {
    const csv = [
      'Group Code,Course,Campus,Shift,Class Days,Start Time,End Time',
      'T-G01,BA (Hons) Business Management,Salford,Evening,Mon & Tue,17:30,21:00',
      'T-G02,Business Management,Derby,,Wed,18:00,21:00',
      'T-G03,Basket Weaving,Leeds,,,9:30,08:00',
    ].join('\n')
    const [a, b, c] = previewGroups(db, 'in-wlv-2701', csv).rows
    expect(a.data).toMatchObject({ code: 'T-G01', shift: 'evening', classDays: ['Mon', 'Tue'], campusId: 'c-salford', patId: null })
    expect(b.data?.shift).toBe('evening')
    expect(b.warnings.join()).toMatch(/inferred/)
    expect(c.action).toBe('skip')
    expect(c.errors.length).toBeGreaterThanOrEqual(4)
  })
})
