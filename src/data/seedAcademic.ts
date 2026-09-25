// Demo academic structure: partner universities, courses, intakes, groups and students.
// Groups are pre-assigned to PATs, mirroring the existing allocation sheet
// (the allocation engine itself is out of scope for this prototype).
import type { Campus, Course, Group, Intake, Student, University, User, Weekday } from './types'

/** Small deterministic PRNG so the demo data is the same on every reset. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export const seedUniversities: University[] = [
  { id: 'uni-wlv', name: 'University of Wolverhampton', shortName: 'UoW' },
  { id: 'uni-aub', name: 'Arts University Bournemouth', shortName: 'AUB' },
  // Placeholders until the other two partner universities are confirmed.
  { id: 'uni-c', name: 'Partner University C', shortName: 'PUC' },
  { id: 'uni-d', name: 'Partner University D', shortName: 'PUD' },
]

export const seedCourses: Course[] = [
  { id: 'crs-bm', name: 'BA (Hons) Business Management', universityId: 'uni-wlv' },
  { id: 'crs-hsc', name: 'BSc (Hons) Health and Social Care', universityId: 'uni-wlv' },
  { id: 'crs-comp', name: 'BSc (Hons) Computing', universityId: 'uni-wlv' },
  { id: 'crs-ci', name: 'BA (Hons) Creative Industries', universityId: 'uni-aub' },
  { id: 'crs-acc', name: 'BA (Hons) Accounting and Finance', universityId: 'uni-c' },
  { id: 'crs-tm', name: 'BA (Hons) Tourism Management', universityId: 'uni-d' },
]

const courseCode: Record<string, string> = {
  'crs-bm': 'BM', 'crs-hsc': 'HSC', 'crs-comp': 'COMP', 'crs-ci': 'CI', 'crs-acc': 'ACC', 'crs-tm': 'TM',
}

export const seedIntakes: Intake[] = [
  { id: 'in-wlv-2509', universityId: 'uni-wlv', name: 'September 2025', startDate: '2025-09-22', endDate: '2028-07-31', status: 'active' },
  { id: 'in-wlv-2601', universityId: 'uni-wlv', name: 'January 2026', startDate: '2026-01-26', endDate: '2029-01-31', status: 'active' },
  { id: 'in-wlv-2609', universityId: 'uni-wlv', name: 'September 2026', startDate: '2026-09-21', endDate: '2029-07-31', status: 'active' },
  { id: 'in-aub-2609', universityId: 'uni-aub', name: 'September 2026', startDate: '2026-09-28', endDate: '2029-07-31', status: 'active' },
  { id: 'in-c-2601', universityId: 'uni-c', name: 'January 2026', startDate: '2026-02-02', endDate: '2029-01-31', status: 'active' },
  { id: 'in-d-2605', universityId: 'uni-d', name: 'May 2026', startDate: '2026-05-11', endDate: '2029-05-31', status: 'active' },
  { id: 'in-wlv-2701', universityId: 'uni-wlv', name: 'January 2027', startDate: '2027-01-25', endDate: '2030-01-31', status: 'planning' },
]

const intakeCode: Record<string, string> = {
  'in-wlv-2509': 'S25', 'in-wlv-2601': 'J26', 'in-wlv-2609': 'S26', 'in-aub-2609': 'S26',
  'in-c-2601': 'J26', 'in-d-2605': 'M26', 'in-wlv-2701': 'J27',
}

const courseForIntake: Record<string, string[]> = {
  'in-wlv-2509': ['crs-bm', 'crs-hsc'],
  'in-wlv-2601': ['crs-bm', 'crs-comp'],
  'in-wlv-2609': ['crs-bm', 'crs-hsc', 'crs-comp'],
  'in-aub-2609': ['crs-ci'],
  'in-c-2601': ['crs-acc'],
  'in-d-2605': ['crs-tm'],
  'in-wlv-2701': ['crs-bm', 'crs-hsc'],
}

const first = ['Abdul', 'Adaeze', 'Agnieszka', 'Ahmed', 'Alina', 'Amina', 'Andrei', 'Ayesha', 'Blessing', 'Bogdan', 'Carmen', 'Chidi', 'Claire', 'Daniela', 'David', 'Delroy', 'Elena', 'Emmanuel', 'Farah', 'Florin', 'Gabriel', 'Gloria', 'Hamid', 'Ioana', 'Ibrahim', 'Joanna', 'Joseph', 'Kateryna', 'Kofi', 'Linda', 'Mariam', 'Marius', 'Michael', 'Monica', 'Mustafa', 'Ngozi', 'Olga', 'Patience', 'Rashid', 'Roxana', 'Ruth', 'Sadia', 'Samuel', 'Shabnam', 'Simona', 'Stephen', 'Tunde', 'Valentina', 'Yusuf', 'Zahra']
const last = ['Abiodun', 'Adeyemi', 'Akhtar', 'Anghel', 'Asante', 'Baker', 'Bello', 'Chowdhury', 'Constantin', 'Dumitru', 'Eze', 'Farooq', 'Georgescu', 'Hassan', 'Ionescu', 'Islam', 'James', 'Kaur', 'Kowalski', 'Lungu', 'Mahmood', 'Miah', 'Moldovan', 'Nwosu', 'Obi', 'Okonkwo', 'Owusu', 'Pop', 'Qureshi', 'Radu', 'Rahman', 'Sheikh', 'Stan', 'Sultana', 'Thomas', 'Uddin', 'Williams', 'Wisniewski', 'Yeboah', 'Zaman']

export interface AcademicSeed {
  universities: University[]
  courses: Course[]
  intakes: Intake[]
  groups: Group[]
  students: Student[]
}

export function buildAcademicSeed(users: User[], campuses: Campus[]): AcademicSeed {
  const rand = rng(20260925)
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]
  const campusCode = (id: string) => (campuses.find((c) => c.id === id)?.name ?? 'X').replace(/\s/g, '').slice(0, 3).toUpperCase()

  const groups: Group[] = []
  const students: Student[] = []
  const counters: Record<string, number> = {}
  const activeIntakes = seedIntakes.filter((i) => i.status === 'active')

  const makeGroup = (intakeId: string, courseId: string, campusId: string, shift: Group['shift'], days: Weekday[], patId: string | null): Group => {
    const prefix = `${courseCode[courseId]}-${intakeCode[intakeId]}-${campusCode(campusId)}`
    counters[prefix] = (counters[prefix] ?? 0) + 1
    const g: Group = {
      id: `g-${groups.length + 1}`,
      code: `${prefix}-G${String(counters[prefix]).padStart(2, '0')}`,
      intakeId,
      courseId,
      campusId,
      shift,
      classDays: days,
      startTime: shift === 'morning' ? '09:30' : '17:30',
      endTime: shift === 'morning' ? '13:30' : '21:00',
      patId,
    }
    groups.push(g)
    return g
  }

  const addStudents = (g: Group, n: number) => {
    const uni = seedIntakes.find((i) => i.id === g.intakeId)!.universityId
    for (let i = 0; i < n; i++) {
      const fn = pick(first)
      const ln = pick(last)
      const num = students.length + 1
      const uniId = uni === 'uni-wlv' ? `2${String(400000 + num * 37).slice(-6)}` : `${uni.slice(-1).toUpperCase()}${String(1000000 + num * 53).slice(-7)}`
      const r = rand()
      students.push({
        id: `s-${num}`,
        firstName: fn,
        lastName: ln,
        personalEmail: `${fn}.${ln}${num % 97}@gmail.com`.toLowerCase(),
        uniEmail: uni === 'uni-wlv' ? `${uniId}@wlv.ac.uk` : `${uniId.toLowerCase()}@student.${uni.slice(4)}.ac.uk`,
        phone: `07${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`,
        emergencyContactName: `${pick(first)} ${ln}`,
        emergencyContactPhone: `07${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`,
        ebsPersonCode: String(3000000 + num * 11),
        uniStudentId: uniId,
        groupId: g.id,
        status: r < 0.03 ? 'withdrawn' : r < 0.06 ? 'interrupted' : 'active',
      })
    }
  }

  // Two or three groups per active PAT, matching their campus, shift and work days.
  const pats = users.filter((u) => u.role === 'pat' && u.status === 'active')
  for (const [pi, pat] of pats.entries()) {
    const nGroups = rand() < 0.4 ? 3 : 2
    for (let k = 0; k < nGroups; k++) {
      const intake = pick(activeIntakes)
      const courseId = pick(courseForIntake[intake.id])
      // Like the real timetable: the first two groups run back-to-back (morning + afternoon, or
      // afternoon + evening) on the same two days; a third group uses two other days.
      const base = (k < 2 ? 0 : 2) + (pi % pat.workDays.length) // rotate so busy days differ between PATs
      const d1 = pat.workDays[base % pat.workDays.length]
      const d2 = pat.workDays[(base + 1) % pat.workDays.length]
      const g = makeGroup(intake.id, courseId, pat.campusId!, pat.shift ?? 'morning', d1 === d2 ? [d1] : [d1, d2], pat.id)
      if (k === 1) {
        g.startTime = '13:30'
        g.endTime = '17:00'
      }
      addStudents(g, 18 + Math.floor(rand() * 20))
    }
  }

  // Some groups in the newest intakes are still waiting for a PAT.
  for (const [i, c] of campuses.entries()) {
    const g = makeGroup('in-wlv-2609', 'crs-bm', c.id, i % 2 ? 'evening' : 'morning', i % 2 ? ['Mon', 'Wed'] : ['Tue', 'Thu'], null)
    addStudents(g, 20 + Math.floor(rand() * 10))
  }

  // January 2027 intake: groups planned by the academic team, no students or PATs yet.
  for (const c of campuses) {
    for (const [shift, days] of [['morning', ['Mon', 'Tue']], ['evening', ['Wed', 'Thu']]] as const) {
      makeGroup('in-wlv-2701', pick(courseForIntake['in-wlv-2701']), c.id, shift, [...days], null)
    }
  }

  return { universities: seedUniversities, courses: seedCourses, intakes: seedIntakes, groups, students }
}
