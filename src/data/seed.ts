import type {
  AppSettings,
  Campus,
  DbState,
  Permission,
  QuizQuestion,
  Role,
  Shift,
  TrainingModule,
  TrainingProgress,
  User,
  Weekday,
} from './types'
import { buildAcademicSeed } from './seedAcademic'
import { buildCommsSeed } from './seedComms'
import { buildWellbeingSeed } from './seedWellbeing'
import { buildAttendanceSeed } from './seedAttendance'
import { buildSubmissionsSeed } from './seedSubmissions'
import { buildLsaSeed } from './seedLsa'
import { buildLeaveSeed } from './seedLeave'
import { buildTasksSeed } from './seedTasks'
import { buildAllocationSeed } from './seedAllocation'
import { buildProbationSeed } from './probation'

export const DB_VERSION = 11

const day = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * day).toISOString()
const dateOnly = (iso: string) => iso.slice(0, 10)

// Seven campuses are expected in total. Only six were named so far, so the
// seventh is left for admins to add from the Campuses screen.
export const seedCampuses: Campus[] = [
  { id: 'c-abarna', name: 'Abarna' },
  { id: 'c-college-house', name: 'College House' },
  { id: 'c-salford', name: 'Salford' },
  { id: 'c-derby', name: 'Derby' },
  { id: 'c-sunderland', name: 'Sunderland' },
  { id: 'c-newcastle', name: 'Newcastle' },
]

const firstNames = [
  'Aisha', 'Ben', 'Chloe', 'Daniel', 'Emeka', 'Fatima', 'George', 'Hannah', 'Imran', 'Jade',
  'Kwame', 'Laura', 'Mohammed', 'Nadia', 'Oliver', 'Priya', 'Rahul', 'Sofia', 'Tariq', 'Uma',
  'Victor', 'Wei', 'Yasmin', 'Zain', 'Amara', 'Callum', 'Deepa', 'Ethan', 'Grace', 'Hassan',
  'Isla', 'Jamal', 'Kiran', 'Leah', 'Marcus', 'Nia', 'Omar', 'Rosa', 'Samir', 'Tanya',
]
const lastNames = [
  'Khan', 'Smith', 'Okafor', 'Patel', 'Jones', 'Ahmed', 'Taylor', 'Begum', 'Brown', 'Nowak',
  'Mensah', 'Wilson', 'Hussain', 'Evans', 'Chen', 'Ali', 'Roberts', 'Singh', 'Walker', 'Rahman',
]

let nameCursor = 0
function nextName() {
  const first = firstNames[nameCursor % firstNames.length]
  const last = lastNames[(nameCursor * 7) % lastNames.length]
  nameCursor++
  return `${first} ${last}`
}

const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.ac.uk`

function makeUser(
  id: string,
  role: Role,
  campusId: string | null,
  opts: Partial<User> & { startDaysAgo: number; shift?: Shift | null; workDays?: Weekday[] },
): User {
  const name = opts.name ?? nextName()
  const started = daysAgo(opts.startDaysAgo)
  const complete = opts.status !== 'invited'
  return {
    id,
    name,
    email: emailFor(name),
    role,
    campusId,
    status: opts.status ?? 'active',
    startDate: dateOnly(started),
    level: role === 'pat' ? (opts.level ?? defaultLevel(opts.status ?? 'active', opts.startDaysAgo)) : null,
    permissions: opts.permissions ?? [],
    phone: complete ? `07${String(100000000 + nameCursor * 7919).slice(0, 9)}` : '',
    shift: opts.shift ?? (complete ? 'morning' : null),
    workDays: opts.workDays ?? (complete ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] : []),
    emergencyContact: complete
      ? { name: 'Next of kin', relationship: 'Family', phone: '07700900000' }
      : null,
    bio: '',
    profileCompletedAt: complete ? started : null,
    createdAt: daysAgo(opts.startDaysAgo + 7),
    createdBy: role === 'manager' || role === 'owner' ? null : 'u-admin-1',
  }
}

/** New joiners are trainees; PATs with more than ~10 months in the role are senior. */
const defaultLevel = (status: User['status'], startDaysAgo: number) => (status !== 'active' ? 'trainee' : startDaysAgo > 300 ? 'senior' : 'junior')

/** Demo admins have different access, granted by the PAT Manager. Only the first can allocate PATs. */
export const seedAdminPermissions: Permission[][] = [
  ['allocation', 'schedules', 'staff', 'training', 'academic', 'attendance', 'submissions', 'lsa', 'tasks', 'audit', 'settings'],
  ['academic', 'attendance', 'submissions', 'lsa', 'tasks', 'audit'],
  ['attendance', 'submissions', 'lsa', 'tasks'],
  ['schedules', 'staff', 'training', 'tasks'],
]

export const seedSettings: AppSettings = { hrManagerName: 'Rebecca Lewis', hrManagerEmail: 'hr.manager@example.ac.uk' }

export const seedOwner = () => makeUser('u-owner', 'owner', null, { startDaysAgo: 1500, name: 'Jordan Hayes' })

function buildUsers(): User[] {
  const users: User[] = []
  users.push(seedOwner())
  users.push(makeUser('u-manager', 'manager', null, { startDaysAgo: 900, name: 'Sarah Mitchell' }))
  for (let i = 1; i <= 4; i++) {
    users.push(makeUser(`u-admin-${i}`, 'admin', null, { startDaysAgo: 600 - i * 40, permissions: seedAdminPermissions[i - 1] }))
  }
  seedCampuses.forEach((c, ci) => {
    users.push(makeUser(`u-lead-${ci + 1}`, 'lead', c.id, { startDaysAgo: 500 - ci * 20 }))
    for (let p = 1; p <= 5; p++) {
      const idx = ci * 5 + p
      const evening = p % 2 === 0
      users.push(
        makeUser(`u-pat-${idx}`, 'pat', c.id, {
          startDaysAgo: 400 - idx * 9,
          shift: evening ? 'evening' : 'morning',
          // Varied patterns, as on the real allocation sheet (days off differ between PATs).
          workDays: evening
            ? idx % 4 < 2 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] : ['Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            : idx % 3 === 0 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] : idx % 3 === 1 ? ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
        }),
      )
    }
  })
  // New joiners at different onboarding stages.
  users.push(
    makeUser('u-new-1', 'pat', 'c-salford', { startDaysAgo: 3, status: 'onboarding', name: 'Adam Clarke' }),
    makeUser('u-new-2', 'pat', 'c-derby', { startDaysAgo: 10, status: 'onboarding', name: 'Bushra Iqbal', shift: 'evening' }),
    makeUser('u-new-3', 'pat', 'c-abarna', { startDaysAgo: -4, status: 'invited', name: 'Connor Doyle' }),
  )
  return users
}

const q = (id: string, question: string, options: string[], answerIndex: number): QuizQuestion => ({
  id,
  question,
  options,
  answerIndex,
})

export const seedModules: TrainingModule[] = [
  {
    id: 'm-welcome',
    title: 'Welcome to the college and the PAT role',
    description: 'Who we work with, how the PAT team is structured and what a PAT is responsible for.',
    content: `The college delivers undergraduate programmes in person on behalf of partner universities (e.g. University of Wolverhampton, Arts University Bournemouth).

As a Personal Academic Tutor (PAT) you are the first point of contact for the students in your groups. Most of our students are mature learners and many are first-time undergraduates, so they will rely on you for guidance in person, by phone, text, email and WhatsApp.

Team structure: PAT Manager → PAT Admins (all campuses) → PAT Leads (one per campus) → PATs.

Your core responsibilities:
• Support every student in your groups and log every contact in your call log.
• Share announcements with your groups.
• Identify and support at-risk students (attendance below 65%).
• Support students on a wellbeing plan with bi-weekly recorded meetings.
• Follow up non-submissions and sign Learning Support Agreements (LSAs).`,
    resourceUrl: '',
    estimatedMinutes: 15,
    order: 1,
    required: true,
    passMark: 100,
    dueDays: 3,
    archived: false,
    quiz: [
      q('q1', 'Who is the next level of escalation above a PAT on your campus?', ['PAT Admin', 'PAT Lead', 'PAT Manager', 'Wellbeing team'], 1),
      q('q2', 'What should you do after any contact with a student?', ['Nothing', 'Tell your lead verbally', 'Log it in your call log', 'Email the university'], 2),
    ],
  },
  {
    id: 'm-comms',
    title: 'Student communication and call logging',
    description: 'Communication channels, tone, and how and when to log every interaction.',
    content: `Every interaction with a student must be logged: calls, texts, emails, WhatsApp messages and in-person conversations.

A good log entry records: date/time, channel, direction (inbound/outbound), the reason for contact, the outcome, and any follow-up action with a date.

Announcements to a whole group are sent by email and WhatsApp, and should be logged once against the group.

Logs are used to evidence support when decisions are made about at-risk students, so be factual and professional.`,
    resourceUrl: '',
    estimatedMinutes: 20,
    order: 2,
    required: true,
    passMark: 67,
    dueDays: 5,
    archived: false,
    quiz: [
      q('q1', 'Which of these does NOT need to be logged?', ['A WhatsApp reply to a student', 'A missed call to a student', 'An in-person chat', 'None - all of them need logging'], 3),
      q('q2', 'A good log entry must include…', ['Only the date', 'Channel, reason, outcome and follow-up', "The student's grades", 'Your opinion of the student'], 1),
      q('q3', 'Why are call logs important for at-risk students?', ['They are not', 'They evidence the support given when retention decisions are made', 'They count towards your pay', 'They replace attendance'], 1),
    ],
  },
  {
    id: 'm-wellbeing',
    title: 'Wellbeing process',
    description: 'Referring students to the wellbeing team and supporting approved wellbeing plans.',
    content: `If a student has difficulties such as illness, pregnancy or personal circumstances, send them the wellbeing form.

The wellbeing team reviews the form and approves or declines it. If approved, you must:
• Hold a bi-weekly meeting with the student on Teams, and record it.
• Log the support provided in the wellbeing team's logging system, following their guideline.

PATops tracks which of your students are on a wellbeing plan and whether each fortnightly meeting has been logged.`,
    resourceUrl: '',
    estimatedMinutes: 20,
    order: 3,
    required: true,
    passMark: 67,
    dueDays: 7,
    archived: false,
    quiz: [
      q('q1', 'Who approves a wellbeing form?', ['The PAT', 'The PAT Lead', 'The wellbeing team', 'The partner university'], 2),
      q('q2', 'How often must you meet a student on a wellbeing plan?', ['Weekly', 'Bi-weekly', 'Monthly', 'Only when they ask'], 1),
      q('q3', 'Wellbeing meetings must be…', ['Held on Teams and recorded', 'Held by phone only', 'Unrecorded for privacy', 'Held by the admin'], 0),
    ],
  },
  {
    id: 'm-attendance',
    title: 'Attendance and at-risk students',
    description: 'How attendance is tracked weekly and what to do when a student falls below 65%.',
    content: `Attendance is updated every week. Any student with attendance below 65% is an at-risk student.

For each at-risk student, contact them, understand the barriers, and log a comment in their risk record. PAT Admins working on retention also log their actions in the same record.

This history is used when deciding whether a student continues or is withdrawn, so keep it complete and timely.`,
    resourceUrl: '',
    estimatedMinutes: 15,
    order: 4,
    required: true,
    passMark: 100,
    dueDays: 7,
    archived: false,
    quiz: [
      q('q1', 'Below what attendance is a student considered at risk?', ['50%', '65%', '75%', '80%'], 1),
      q('q2', 'Who adds comments to an at-risk student record?', ['Only the PAT', 'Only admins', 'Both the PAT and the admins working on retention', 'The university'], 2),
    ],
  },
  {
    id: 'm-submissions',
    title: 'Non-submissions and LSAs',
    description: 'Following up students who miss assessment deadlines, and Learning Support Agreements.',
    content: `During each submission period, admins publish the list of students who have not submitted. You follow up each one and record the outcome.

A Learning Support Agreement (LSA) is signed with a student to agree support actions. Record every LSA you sign so admins can track them centrally.`,
    resourceUrl: '',
    estimatedMinutes: 10,
    order: 5,
    required: true,
    passMark: 50,
    dueDays: 10,
    archived: false,
    quiz: [
      q('q1', 'Who publishes the non-submission list?', ['PAT Admins', 'Students', 'The PAT Manager', 'IT'], 0),
      q('q2', 'After signing an LSA you should…', ['Keep it to yourself', 'Record it so admins can track it', 'Post it on WhatsApp', 'Email it to the whole group'], 1),
    ],
  },
  {
    id: 'm-gdpr',
    title: 'Data protection (GDPR) and safeguarding',
    description: 'Handling student personal data safely and recognising safeguarding concerns.',
    content: `You will have access to student personal data: contact details, emergency contacts, university IDs and EBS person codes.

• Only use it for supporting the student.
• Never share it in personal apps or with other students.
• Do not export data to personal devices.
• Report any data breach or safeguarding concern immediately to your PAT Lead.`,
    resourceUrl: '',
    estimatedMinutes: 25,
    order: 6,
    required: true,
    passMark: 100,
    dueDays: 3,
    archived: false,
    quiz: [
      q('q1', 'You accidentally email a student list to the wrong person. What do you do?', ['Nothing', 'Report it immediately to your PAT Lead', 'Wait and see', 'Delete your sent email'], 1),
      q('q2', 'Can you save the student contact list to your personal phone?', ['Yes', 'Only for my own groups', 'No', 'Only the emails'], 2),
    ],
  },
]

function buildProgress(users: User[]): TrainingProgress[] {
  const progress: TrainingProgress[] = []
  for (const u of users) {
    if (u.role !== 'pat' && u.role !== 'lead') continue
    if (u.status === 'invited') continue
    const start = new Date(u.startDate).getTime()
    seedModules.forEach((m, mi) => {
      const done = (offsetDays: number) => new Date(start + offsetDays * day).toISOString()
      if (u.status === 'active') {
        progress.push({
          userId: u.id,
          moduleId: m.id,
          startedAt: done(mi),
          acknowledgedAt: done(mi),
          attempts: [{ at: done(mi), score: 100, passed: true }],
          completedAt: done(mi),
        })
      } else if (u.id === 'u-new-2') {
        // Further along, with one failed quiz attempt and one module in progress.
        if (mi < 3) {
          const attempts = mi === 1
            ? [{ at: done(2), score: 33, passed: false }, { at: done(3), score: 100, passed: true }]
            : [{ at: done(mi + 1), score: 100, passed: true }]
          progress.push({ userId: u.id, moduleId: m.id, startedAt: done(mi), acknowledgedAt: done(mi + 1), attempts, completedAt: attempts.at(-1)!.at })
        } else if (mi === 3) {
          progress.push({ userId: u.id, moduleId: m.id, startedAt: done(6), acknowledgedAt: null, attempts: [], completedAt: null })
        }
      } else if (u.id === 'u-new-1' && mi === 0) {
        progress.push({ userId: u.id, moduleId: m.id, startedAt: done(1), acknowledgedAt: done(1), attempts: [], completedAt: null })
      }
    })
  }
  return progress
}

export function buildSeed(): DbState {
  nameCursor = 0
  const users = buildUsers()
  const academic = buildAcademicSeed(users, seedCampuses)
  const allocation = buildAllocationSeed(users, academic.groups, seedCampuses)
  const groups = allocation.groups
  return {
    version: DB_VERSION,
    campuses: seedCampuses,
    ...academic,
    groups,
    comms: buildCommsSeed(users, groups, academic.students),
    ...buildWellbeingSeed(users, groups, academic.students),
    ...buildAttendanceSeed(groups, academic.students, academic.intakes),
    ...buildSubmissionsSeed(groups, academic.students),
    ...buildLsaSeed(groups, academic.students),
    ...buildLeaveSeed(users, groups),
    ...buildTasksSeed(users),
    allocationProfiles: allocation.allocationProfiles,
    allocationDrafts: allocation.allocationDrafts,
    probations: buildProbationSeed(users, 'u-manager'),
    staffNotes: [],
    settings: seedSettings,
    users,
    trainingModules: seedModules,
    trainingProgress: buildProgress(users),
    audit: [],
  }
}

/**
 * v10 -> v11: owner account, admin permissions, PAT levels, probation, private notes,
 * HR contact, and call-log entries with several channels.
 */
export function migrateToV11(d: DbState): DbState {
  type OldUser = User & { level?: User['level']; permissions?: Permission[] }
  type OldComm = DbState['comms'][number] & { channel?: DbState['comms'][number]['channels'][number] }
  const today = Date.now()
  const users: User[] = (d.users as OldUser[]).map((u) => ({
    ...u,
    level: u.level !== undefined ? u.level : u.role === 'pat' ? defaultLevel(u.status, Math.floor((today - new Date(u.startDate).getTime()) / day)) : null,
    permissions: u.permissions ?? (u.role === 'admin' ? (seedAdminPermissions[Number(u.id.replace('u-admin-', '')) - 1] ?? seedAdminPermissions[1]) : []),
  }))
  if (!users.some((u) => u.role === 'owner')) users.unshift(seedOwner())
  const manager = users.find((u) => u.role === 'manager')?.id ?? 'u-owner'
  return {
    ...d,
    version: 11,
    users,
    comms: (d.comms as OldComm[]).map(({ channel, ...c }) => ({ ...c, channels: c.channels ?? (channel ? [channel] : ['phone']) })),
    probations: d.probations ?? buildProbationSeed(users, manager),
    staffNotes: d.staffNotes ?? [],
    settings: d.settings ?? seedSettings,
  }
}
