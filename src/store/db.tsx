import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildSeed, DB_VERSION, migrateToV11 } from '../data/seed'
import { buildAcademicSeed } from '../data/seedAcademic'
import { buildCommsSeed } from '../data/seedComms'
import { buildWellbeingSeed } from '../data/seedWellbeing'
import { buildAttendanceSeed } from '../data/seedAttendance'
import { buildSubmissionsSeed } from '../data/seedSubmissions'
import { buildLsaSeed } from '../data/seedLsa'
import { buildLeaveSeed } from '../data/seedLeave'
import { buildTasksSeed } from '../data/seedTasks'
import { buildAllocationSeed } from '../data/seedAllocation'
import { can, isProfileComplete, scoreQuiz } from '../data/logic'
import { loadSaved, save } from './persist'
import type { RetentionStage } from '../data/types'
import type { AttendanceRow, LsaRow, NonSubmissionRow } from '../data/importer'
import { WEEKDAYS, type Shift, type Weekday } from '../data/types'
import type { AllocationDraft, AllocationProfile, AppSettings, AssignedTask, CoverSlot, LeaveRequest, LeaveType, Lsa, PatLevel, Permission, Probation, ProbationOutcome, StaffNote } from '../data/types'
import { emptyProbation } from '../data/probation'
import type { Suggestion } from '../data/allocation'
import { statusAfterCover } from '../data/leave'
import type { FollowUpStatus, NonSubmission, SubmissionPeriod } from '../data/types'
import type { CommLog, Course, DbState, Group, Intake, Role, Student, TrainingModule, TrainingProgress, University, User, WellbeingCase, WellbeingCategory } from '../data/types'
import { nextOpenCycle } from '../data/wellbeing'

const SESSION_KEY = 'patops.session'

async function load(): Promise<DbState> {
  const saved = await loadSaved()
  if (saved) {
    try {
      return migrate(saved)
    } catch {
      // Unknown shape: start from fresh demo data.
    }
  }
  return buildSeed()
}

/** Upgrade demo data saved by an earlier step of the prototype, keeping what the user did. */
function migrate(d: DbState): DbState {
  let next = d
  // v1 -> v2: add the academic structure.
  if (next.version === 1) next = { ...next, ...buildAcademicSeed(next.users, next.campuses), version: 2 }
  // v2 -> v3: add call log history.
  if (next.version === 2) next = { ...next, comms: buildCommsSeed(next.users, next.groups, next.students), version: 3 }
  // v3 -> v4: add wellbeing referrals and plans.
  if (next.version === 3) next = { ...next, ...buildWellbeingSeed(next.users, next.groups, next.students), version: 4 }
  // v4 -> v5: add weekly attendance and retention notes.
  if (next.version === 4) next = { ...next, ...buildAttendanceSeed(next.groups, next.students, next.intakes), version: 5 }
  // v5 -> v6: add submission periods and non-submissions.
  if (next.version === 5) next = { ...next, ...buildSubmissionsSeed(next.groups, next.students), version: 6 }
  // v6 -> v7: add LSAs.
  if (next.version === 6) next = { ...next, ...buildLsaSeed(next.groups, next.students), version: 7 }
  // v7 -> v8: add leave requests and cover.
  if (next.version === 7) next = { ...next, ...buildLeaveSeed(next.users, next.groups), version: 8 }
  // v8 -> v9: add assigned tasks.
  if (next.version === 8) next = { ...next, ...buildTasksSeed(next.users), version: 9 }
  // v9 -> v10: add allocation settings and the January 2027 draft (also tidies demo timetable clashes).
  if (next.version === 9) next = { ...next, ...buildAllocationSeed(next.users, next.groups, next.campuses), version: 10 }
  // v10 -> v11: owner, admin permissions, PAT levels, probation, private notes, multi-channel call logs.
  if (next.version === 10) next = migrateToV11(next)
  if (next.version !== DB_VERSION) throw new Error('Unknown data version')
  return next
}

/** Storage can be unavailable (private mode, blocked site data); the app still works in memory. */
const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    } catch {
      // ignore
    }
  },
}

function upsertProbation(list: Probation[], userId: string, fn: (p: Probation) => Probation): Probation[] {
  const existing = list.find((p) => p.userId === userId)
  return existing ? list.map((p) => (p === existing ? fn(p) : p)) : [...list, fn(emptyProbation(userId))]
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`
const now = () => new Date().toISOString()

export type NewCommInput = Omit<CommLog, 'id' | 'authorId' | 'loggedAt' | 'followUpDoneAt' | 'voidedAt' | 'voidReason'>

export interface NewStaffInput {
  name: string
  email: string
  role: Role
  campusId: string | null
  startDate: string
}

interface DbContextValue {
  db: DbState
  me: User | null
  login: (userId: string) => void
  logout: () => void
  resetDemo: () => void
  createStaff: (input: NewStaffInput) => User
  updateProfile: (userId: string, patch: Partial<User>) => void
  setStaffStatus: (userId: string, status: User['status']) => void
  addCampus: (name: string) => void
  saveModule: (m: TrainingModule) => void
  startModule: (moduleId: string) => void
  acknowledgeModule: (moduleId: string) => void
  submitQuiz: (moduleId: string, answers: number[]) => { score: number; passed: boolean }
  saveUniversity: (u: University) => void
  saveCourse: (c: Course) => void
  saveIntake: (i: Intake) => void
  saveGroup: (g: Group) => void
  setGroupPat: (groupId: string, patId: string | null) => void
  updateStudent: (id: string, patch: Partial<Student>) => void
  importStudents: (rows: Student[], source: string) => void
  importGroups: (rows: Group[], source: string) => void
  addComms: (entries: NewCommInput[]) => void
  completeFollowUp: (id: string) => void
  voidComm: (id: string, reason: string) => void
  sendWellbeingForm: (studentId: string, category: WellbeingCategory, sentAt: string) => void
  markFormSubmitted: (caseId: string, at: string) => void
  recordDecision: (caseId: string, approved: boolean, at: string, reason: string) => void
  recordMeeting: (caseId: string, m: { heldAt: string; outcome: 'held' | 'no_show'; recorded: boolean; logged: boolean; addToCallLog: boolean }) => void
  markMeetingLogged: (meetingId: string) => void
  closeCase: (caseId: string, reason: string) => void
  importAttendance: (weekEnding: string, rows: AttendanceRow[], source: string) => void
  addRiskNote: (studentId: string, text: string, stage: RetentionStage | null) => void
  savePeriod: (p: SubmissionPeriod) => void
  importNonSubmissions: (periodId: string, rows: NonSubmissionRow[], source: string) => void
  recordAuditExport: (userId: string, format: string, range: string) => void
  saveAllocationProfile: (p: AllocationProfile) => void
  createDraft: (name: string, groupIds: string[]) => string
  deleteDraft: (draftId: string) => void
  setDraftAssignment: (draftId: string, groupId: string, patId: string | null, overrideReason?: string) => void
  toggleDraftLock: (draftId: string, groupId: string) => void
  applySuggestions: (draftId: string, suggestions: Suggestion[]) => void
  clearSuggestions: (draftId: string) => void
  publishDraft: (draftId: string) => void
  applyAllocationImport: (input: { groups: Group[]; newUniversities: University[]; newCourses: Course[]; newIntakes: Intake[]; draftName: string | null; profiles: AllocationProfile[]; userPatches: { id: string; patch: Partial<User> }[]; source: string }) => string | null
  createTask: (input: { title: string; description: string; dueDate: string | null; assigneeIds: string[]; personal: boolean }) => void
  toggleTaskDone: (taskId: string, done: boolean) => void
  updateTask: (taskId: string, patch: { title: string; description: string; dueDate: string | null; assigneeIds: string[] }) => void
  deleteTask: (taskId: string) => void
  setPermissions: (userId: string, permissions: Permission[]) => void
  setPatLevel: (userId: string, level: PatLevel) => void
  saveWorkPattern: (userId: string, input: { shift: Shift | null; workDays: Weekday[]; workHours: string | null }) => void
  decideProbation: (userId: string, outcome: ProbationOutcome, note: string, level: PatLevel | null) => void
  extendProbation: (userId: string, until: string, note: string) => void
  reopenProbation: (userId: string) => void
  markProbationSentToHr: (userId: string) => void
  addStaffNote: (userId: string, text: string) => void
  updateStaffNote: (noteId: string, text: string) => void
  deleteStaffNote: (noteId: string) => void
  saveSettings: (patch: Partial<AppSettings>) => void
  deleteGroup: (groupId: string, moveStudentsTo: string | null) => void
  submitLeave: (input: { type: LeaveType; startDate: string; endDate: string; reason: string; covers: { date: string; groupId: string; coverPatId: string }[] }) => void
  respondCover: (slotId: string, accept: boolean, note: string) => void
  replaceCover: (slotId: string, coverPatId: string) => void
  decideLeave: (leaveId: string, approved: boolean, note: string) => void
  cancelLeave: (leaveId: string) => void
  saveLsa: (input: { id?: string; studentId: string; startDate: string; endDate: string | null; nextFollowUp: string | null; comments: string }) => void
  importLsas: (rows: LsaRow[], source: string) => void
  updateNonSubmission: (id: string, patch: { status: FollowUpStatus; note: string; expectedDate: string | null }, callLog: 'phone' | 'whatsapp' | 'email' | 'sms' | 'in_person' | null) => void
}

const DbContext = createContext<DbContextValue | null>(null)

/** Loads saved data (or demo data) before rendering the app. */
export function DbProvider({ children }: { children: ReactNode }) {
  const [initial, setInitial] = useState<DbState | null>(null)
  useEffect(() => {
    load().then(setInitial)
  }, [])
  if (!initial) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading PATops…</div>
  return <LoadedDbProvider initial={initial}>{children}</LoadedDbProvider>
}

function LoadedDbProvider({ initial, children }: { initial: DbState; children: ReactNode }) {
  const [db, setDb] = useState<DbState>(initial)
  const [meId, setMeId] = useState<string | null>(() => storage.get(SESSION_KEY))

  // Save every change straight away, so nothing is lost if the page is closed or reloaded.
  useEffect(() => {
    save(db)
  }, [db])

  useEffect(() => {
    storage.set(SESSION_KEY, meId)
  }, [meId])

  const me = db.users.find((u) => u.id === meId) ?? null

  /** Apply a mutation and append an audit event in one step. */
  const mutate = useCallback(
    (
      fn: (d: DbState) => DbState,
      audit?: { type: string; message: string; subjectUserId: string | null },
    ) => {
      setDb((prev) => {
        const next = fn(prev)
        if (!audit) return next
        return {
          ...next,
          audit: [...next.audit, { id: uid('ev'), at: now(), actorId: meId ?? 'system', ...audit }],
        }
      })
    },
    [meId],
  )

  const upsertProgress = useCallback(
    (moduleId: string, fn: (p: TrainingProgress) => TrainingProgress) => (d: DbState): DbState => {
      if (!me) return d
      const existing = d.trainingProgress.find((p) => p.userId === me.id && p.moduleId === moduleId)
      const base: TrainingProgress = existing ?? {
        userId: me.id,
        moduleId,
        startedAt: null,
        acknowledgedAt: null,
        attempts: [],
        completedAt: null,
      }
      const updated = fn(base)
      return {
        ...d,
        trainingProgress: existing
          ? d.trainingProgress.map((p) => (p === existing ? updated : p))
          : [...d.trainingProgress, updated],
      }
    },
    [me],
  )

  const value = useMemo<DbContextValue>(() => {
    /** Wellbeing audit events are filed under the student's current PAT, naming the student. */
    const wbAudit = (studentId: string | undefined, type: string, message: string) => {
      const s = db.students.find((x) => x.id === studentId)
      const patId = db.groups.find((g) => g.id === s?.groupId)?.patId ?? null
      return { type, message: s ? `${message}: ${s.firstName} ${s.lastName}` : message, subjectUserId: patId }
    }
    const moduleTitle = (id: string) => db.trainingModules.find((m) => m.id === id)?.title ?? id
    return {
      db,
      me,
      login: (id) => setMeId(id),
      logout: () => setMeId(null),
      resetDemo: () => {
        setDb(buildSeed())
        setMeId(null)
      },
      createStaff: (input) => {
        const user: User = {
          id: uid('u'),
          ...input,
          level: input.role === 'pat' ? 'trainee' : null,
          permissions: [],
          status: 'invited',
          phone: '',
          shift: null,
          workDays: [],
          emergencyContact: null,
          bio: '',
          profileCompletedAt: null,
          createdAt: now(),
          createdBy: me?.id ?? null,
        }
        mutate((d) => ({ ...d, users: [...d.users, user] }), {
          type: 'staff.created',
          message: `Account created for ${user.name} (${input.role})`,
          subjectUserId: user.id,
        })
        return user
      },
      updateProfile: (userId, patch) => {
        mutate(
          (d) => ({
            ...d,
            users: d.users.map((u) => {
              if (u.id !== userId) return u
              const next = { ...u, ...patch }
              if (isProfileComplete(next) && !next.profileCompletedAt) {
                next.profileCompletedAt = now()
                if (next.status === 'invited') next.status = 'onboarding'
              }
              return next
            }),
          }),
          { type: 'profile.updated', message: 'Profile updated', subjectUserId: userId },
        )
      },
      setStaffStatus: (userId, status) => {
        mutate((d) => ({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, status } : u)) }), {
          type: 'staff.status',
          message: `Status changed to ${status}`,
          subjectUserId: userId,
        })
      },
      addCampus: (name) => {
        mutate((d) => ({ ...d, campuses: [...d.campuses, { id: uid('c'), name }] }), {
          type: 'campus.created',
          message: `Campus ${name} added`,
          subjectUserId: null,
        })
      },
      saveModule: (m) => {
        const exists = db.trainingModules.some((x) => x.id === m.id)
        mutate(
          (d) => ({
            ...d,
            trainingModules: exists
              ? d.trainingModules.map((x) => (x.id === m.id ? m : x))
              : [...d.trainingModules, m],
          }),
          { type: 'training.module', message: `${exists ? 'Updated' : 'Created'} module "${m.title}"`, subjectUserId: null },
        )
      },
      startModule: (moduleId) => {
        const p = me && db.trainingProgress.find((x) => x.userId === me.id && x.moduleId === moduleId)
        if (p?.startedAt) return
        mutate(upsertProgress(moduleId, (x) => ({ ...x, startedAt: now() })), {
          type: 'training.started',
          message: `Started "${moduleTitle(moduleId)}"`,
          subjectUserId: me?.id ?? null,
        })
      },
      acknowledgeModule: (moduleId) => {
        const mod = db.trainingModules.find((m) => m.id === moduleId)
        const noQuiz = mod?.quiz.length === 0
        mutate(
          upsertProgress(moduleId, (x) => ({
            ...x,
            acknowledgedAt: x.acknowledgedAt ?? now(),
            completedAt: noQuiz ? (x.completedAt ?? now()) : x.completedAt,
          })),
          { type: 'training.acknowledged', message: `Confirmed reading "${moduleTitle(moduleId)}"`, subjectUserId: me?.id ?? null },
        )
      },
      submitQuiz: (moduleId, answers) => {
        const mod = db.trainingModules.find((m) => m.id === moduleId)!
        const score = scoreQuiz(mod, answers)
        const passed = score >= mod.passMark
        mutate(
          upsertProgress(moduleId, (x) => ({
            ...x,
            attempts: [...x.attempts, { at: now(), score, passed }],
            completedAt: passed && x.acknowledgedAt ? (x.completedAt ?? now()) : x.completedAt,
          })),
          {
            type: passed ? 'training.passed' : 'training.failed',
            message: `Quiz "${mod.title}": ${score}% (${passed ? 'passed' : 'not passed'})`,
            subjectUserId: me?.id ?? null,
          },
        )
        return { score, passed }
      },
      saveUniversity: (u) => {
        const exists = db.universities.some((x) => x.id === u.id)
        mutate((d) => ({ ...d, universities: exists ? d.universities.map((x) => (x.id === u.id ? u : x)) : [...d.universities, u] }), {
          type: 'university.saved', message: `${exists ? 'Updated' : 'Added'} partner university ${u.name}`, subjectUserId: null,
        })
      },
      saveCourse: (c) => {
        const exists = db.courses.some((x) => x.id === c.id)
        mutate((d) => ({ ...d, courses: exists ? d.courses.map((x) => (x.id === c.id ? c : x)) : [...d.courses, c] }), {
          type: 'course.saved', message: `${exists ? 'Updated' : 'Added'} course ${c.name}`, subjectUserId: null,
        })
      },
      saveIntake: (i) => {
        const exists = db.intakes.some((x) => x.id === i.id)
        mutate((d) => ({ ...d, intakes: exists ? d.intakes.map((x) => (x.id === i.id ? i : x)) : [...d.intakes, i] }), {
          type: 'intake.saved', message: `${exists ? 'Updated' : 'Created'} intake ${i.name}`, subjectUserId: null,
        })
      },
      saveGroup: (g) => {
        const exists = db.groups.some((x) => x.id === g.id)
        mutate((d) => ({ ...d, groups: exists ? d.groups.map((x) => (x.id === g.id ? g : x)) : [...d.groups, g] }), {
          type: 'group.saved', message: `${exists ? 'Updated' : 'Created'} group ${g.code}`, subjectUserId: null,
        })
      },
      setGroupPat: (groupId, patId) => {
        const g = db.groups.find((x) => x.id === groupId)
        if (!g || g.patId === patId) return
        const name = (id: string | null) => db.users.find((u) => u.id === id)?.name
        const events = [
          g.patId && { subjectUserId: g.patId, type: 'group.unassigned', message: `Removed as PAT of ${g.code}` },
          patId && { subjectUserId: patId, type: 'group.assigned', message: `Assigned as PAT of ${g.code}${g.patId ? ` (previously ${name(g.patId)})` : ''}` },
        ].filter(Boolean) as { subjectUserId: string; type: string; message: string }[]
        setDb((d) => ({
          ...d,
          groups: d.groups.map((x) => (x.id === groupId ? { ...x, patId } : x)),
          audit: [...d.audit, ...events.map((e) => ({ id: uid('ev'), at: now(), actorId: meId ?? 'system', ...e }))],
        }))
      },
      updateStudent: (id, patch) => {
        const s = db.students.find((x) => x.id === id)
        mutate((d) => ({ ...d, students: d.students.map((x) => (x.id === id ? { ...x, ...patch } : x)) }), {
          type: 'student.updated', message: `Updated student record ${s ? `${s.firstName} ${s.lastName}` : id}`, subjectUserId: null,
        })
      },
      importStudents: (rows, source) => {
        const byId = new Map(rows.map((r) => [r.id, r]))
        mutate(
          (d) => {
            const existing = new Set(d.students.map((s) => s.id))
            return {
              ...d,
              students: [...d.students.map((s) => byId.get(s.id) ?? s), ...rows.filter((r) => !existing.has(r.id))],
            }
          },
          { type: 'students.imported', message: `Imported ${rows.length} student records from ${source}`, subjectUserId: null },
        )
      },
      importGroups: (rows, source) => {
        const byId = new Map(rows.map((r) => [r.id, r]))
        mutate(
          (d) => {
            const existing = new Set(d.groups.map((g) => g.id))
            return { ...d, groups: [...d.groups.map((g) => byId.get(g.id) ?? g), ...rows.filter((r) => !existing.has(r.id))] }
          },
          { type: 'groups.imported', message: `Imported ${rows.length} groups from ${source}`, subjectUserId: null },
        )
      },
      addComms: (entries) => {
        if (!me || entries.length === 0) return
        const t = now()
        const logs: CommLog[] = entries.map((e) => ({ ...e, id: uid('cl'), authorId: me.id, loggedAt: t, followUpDoneAt: null, voidedAt: null, voidReason: '' }))
        // Log entries are their own record; no separate audit event per contact.
        setDb((d) => ({ ...d, comms: [...d.comms, ...logs] }))
      },
      completeFollowUp: (id) => {
        setDb((d) => ({ ...d, comms: d.comms.map((c) => (c.id === id ? { ...c, followUpDoneAt: now() } : c)) }))
      },
      sendWellbeingForm: (studentId, category, sentAt) => {
        const c: WellbeingCase = {
          id: uid('wb'), studentId, category, status: 'form_sent', formSentAt: sentAt, formSentBy: me?.id ?? '',
          submittedAt: null, decisionAt: null, decisionRecordedBy: null, declineReason: '', planStart: null, closedAt: null, closeReason: '',
        }
        mutate((d) => ({ ...d, wellbeingCases: [...d.wellbeingCases, c] }), wbAudit(studentId, 'wellbeing.form_sent', 'Wellbeing form sent'))
      },
      markFormSubmitted: (caseId, at) => {
        const c = db.wellbeingCases.find((x) => x.id === caseId)
        mutate((d) => ({ ...d, wellbeingCases: d.wellbeingCases.map((x) => (x.id === caseId ? { ...x, status: 'submitted', submittedAt: at } : x)) }),
          wbAudit(c?.studentId, 'wellbeing.submitted', 'Wellbeing form returned by student'))
      },
      recordDecision: (caseId, approved, at, reason) => {
        const c = db.wellbeingCases.find((x) => x.id === caseId)
        mutate(
          (d) => ({
            ...d,
            wellbeingCases: d.wellbeingCases.map((x) =>
              x.id === caseId
                ? { ...x, status: approved ? 'approved' : 'declined', decisionAt: at, decisionRecordedBy: me?.id ?? null, declineReason: approved ? '' : reason, planStart: approved ? at.slice(0, 10) : null }
                : x,
            ),
          }),
          wbAudit(c?.studentId, approved ? 'wellbeing.approved' : 'wellbeing.declined', approved ? 'Wellbeing plan approved by the wellbeing team' : 'Wellbeing form declined by the wellbeing team'),
        )
      },
      recordMeeting: (caseId, m) => {
        const c = db.wellbeingCases.find((x) => x.id === caseId)
        if (!c || !me) return
        const cycle = nextOpenCycle(c, db.wellbeingMeetings)
        const t = now()
        const meeting = { id: uid('wm'), caseId, cycle, heldAt: m.heldAt, outcome: m.outcome, recorded: m.recorded, loggedAt: m.logged ? t : null, recordedBy: me.id }
        const comm: CommLog | null = m.addToCallLog
          ? {
              id: uid('cl'), authorId: me.id, kind: 'individual', studentId: c.studentId, groupIds: [], channels: ['teams'], direction: 'outbound',
              outcome: m.outcome === 'held' ? 'reached' : 'no_answer', reason: 'wellbeing',
              summary: m.outcome === 'held' ? `Fortnightly wellbeing meeting on Teams (fortnight ${cycle + 1}).` : `Fortnightly wellbeing meeting (fortnight ${cycle + 1}): student did not attend.`,
              at: m.heldAt, loggedAt: t, followUpDate: null, followUpDoneAt: null, voidedAt: null, voidReason: '',
            }
          : null
        mutate(
          (d) => ({ ...d, wellbeingMeetings: [...d.wellbeingMeetings, meeting], comms: comm ? [...d.comms, comm] : d.comms }),
          wbAudit(c.studentId, 'wellbeing.meeting', `Wellbeing meeting recorded (fortnight ${cycle + 1}, ${m.outcome === 'held' ? 'held' : 'student did not attend'}${m.logged ? ', logged' : ''})`),
        )
      },
      markMeetingLogged: (meetingId) => {
        const m = db.wellbeingMeetings.find((x) => x.id === meetingId)
        const c = db.wellbeingCases.find((x) => x.id === m?.caseId)
        mutate((d) => ({ ...d, wellbeingMeetings: d.wellbeingMeetings.map((x) => (x.id === meetingId ? { ...x, loggedAt: now() } : x)) }),
          wbAudit(c?.studentId, 'wellbeing.logged', `Confirmed wellbeing meeting (fortnight ${(m?.cycle ?? 0) + 1}) logged in the wellbeing system`))
      },
      closeCase: (caseId, reason) => {
        const c = db.wellbeingCases.find((x) => x.id === caseId)
        mutate((d) => ({ ...d, wellbeingCases: d.wellbeingCases.map((x) => (x.id === caseId ? { ...x, status: 'closed', closedAt: now(), closeReason: reason } : x)) }),
          wbAudit(c?.studentId, 'wellbeing.closed', `Wellbeing plan closed: ${reason}`))
      },
      importAttendance: (weekEnding, rows, source) => {
        const ids = new Set(rows.map((r) => r.studentId))
        const upload = { id: uid('au'), weekEnding, uploadedAt: now(), uploadedBy: me?.id ?? '', source, rows: rows.length }
        mutate(
          (d) => ({
            ...d,
            // Re-uploading a week replaces that week's figures for the students in the file.
            attendance: [...d.attendance.filter((a) => !(a.weekEnding === weekEnding && ids.has(a.studentId))), ...rows.map((r) => ({ ...r, weekEnding }))],
            attendanceUploads: [...d.attendanceUploads.filter((u) => u.weekEnding !== weekEnding), upload],
          }),
          { type: 'attendance.imported', message: `Imported attendance for week ending ${weekEnding} (${rows.length} students) from ${source}`, subjectUserId: null },
        )
      },
      addRiskNote: (studentId, text, stage) => {
        if (!me) return
        const s = db.students.find((x) => x.id === studentId)
        const patId = db.groups.find((g) => g.id === s?.groupId)?.patId ?? null
        const note = { id: uid('rn'), studentId, authorId: me.id, at: now(), text, stage }
        const withdraw = stage === 'withdrawn' && can(me, 'attendance')
        mutate(
          (d) => ({
            ...d,
            riskNotes: [...d.riskNotes, note],
            students: withdraw ? d.students.map((x) => (x.id === studentId ? { ...x, status: 'withdrawn' } : x)) : d.students,
          }),
          {
            type: stage ? 'risk.stage' : 'risk.note',
            message: `${stage ? `Retention stage set to "${stage.replace('_', ' ')}"` : 'Retention note added'}${s ? `: ${s.firstName} ${s.lastName}` : ''}`,
            subjectUserId: patId,
          },
        )
      },
      savePeriod: (p) => {
        const prev = db.submissionPeriods.find((x) => x.id === p.id)
        mutate((d) => ({ ...d, submissionPeriods: prev ? d.submissionPeriods.map((x) => (x.id === p.id ? p : x)) : [...d.submissionPeriods, p] }), {
          type: 'submissions.period',
          message: !prev ? `Created submission period "${p.name}"` : prev.status !== p.status ? `${p.status === 'closed' ? 'Closed' : 'Reopened'} submission period "${p.name}"` : `Updated submission period "${p.name}"`,
          subjectUserId: null,
        })
      },
      importNonSubmissions: (periodId, rows, source) => {
        const items: NonSubmission[] = rows.map((r) => ({ id: uid('ns'), periodId, ...r, status: 'not_contacted', note: '', expectedDate: null, updatedAt: null, updatedBy: null }))
        const name = db.submissionPeriods.find((p) => p.id === periodId)?.name ?? ''
        mutate((d) => ({ ...d, nonSubmissions: [...d.nonSubmissions, ...items] }), {
          type: 'submissions.imported', message: `Imported ${rows.length} non-submissions into "${name}" from ${source}`, subjectUserId: null,
        })
      },
      updateNonSubmission: (id, patch, callLog) => {
        const n = db.nonSubmissions.find((x) => x.id === id)
        if (!n || !me) return
        const s = db.students.find((x) => x.id === n.studentId)
        const patId = db.groups.find((g) => g.id === s?.groupId)?.patId ?? null
        const t = now()
        const comm: CommLog | null = callLog
          ? {
              id: uid('cl'), authorId: me.id, kind: 'individual', studentId: n.studentId, groupIds: [], channels: [callLog], direction: 'outbound',
              outcome: patch.status === 'no_response' ? 'no_answer' : 'reached', reason: 'assessment',
              summary: `Non-submission follow-up (${n.assessment}): ${patch.note || patch.status.replace('_', ' ')}`,
              at: t, loggedAt: t, followUpDate: patch.expectedDate, followUpDoneAt: null, voidedAt: null, voidReason: '',
            }
          : null
        mutate(
          (d) => ({
            ...d,
            nonSubmissions: d.nonSubmissions.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: t, updatedBy: me.id } : x)),
            comms: comm ? [...d.comms, comm] : d.comms,
          }),
          {
            type: 'submissions.followup',
            message: `Non-submission follow-up: ${s ? `${s.firstName} ${s.lastName}` : ''}, ${n.assessment} → ${patch.status.replace('_', ' ')}`,
            subjectUserId: patId,
          },
        )
      },
      saveAllocationProfile: (p) => {
        const u = db.users.find((x) => x.id === p.userId)
        mutate((d) => ({ ...d, allocationProfiles: [...d.allocationProfiles.filter((x) => x.userId !== p.userId), p] }), {
          type: 'allocation.profile', message: `Updated allocation settings for ${u?.name}`, subjectUserId: p.userId,
        })
      },
      createDraft: (name, groupIds) => {
        const t = now()
        const draft: AllocationDraft = {
          id: uid('ad'), name, groupIds, createdBy: me?.id ?? '', createdAt: t, updatedAt: t, status: 'draft', publishedAt: null, publishedBy: null,
          assignments: Object.fromEntries(groupIds.map((id) => [id, { patId: db.groups.find((g) => g.id === id)?.patId ?? null, source: 'current' as const, locked: false, reason: '', overrideReason: '' }])),
        }
        mutate((d) => ({ ...d, allocationDrafts: [...d.allocationDrafts, draft] }), { type: 'allocation.draft', message: `Started allocation draft "${name}" (${groupIds.length} groups)`, subjectUserId: null })
        return draft.id
      },
      deleteDraft: (draftId) => {
        const dr = db.allocationDrafts.find((x) => x.id === draftId)
        mutate((d) => ({ ...d, allocationDrafts: d.allocationDrafts.filter((x) => x.id !== draftId) }), { type: 'allocation.draft', message: `Deleted allocation draft "${dr?.name}"`, subjectUserId: null })
      },
      setDraftAssignment: (draftId, groupId, patId, overrideReason = '') => {
        // Draft edits aren't audited one by one; publishing records every change.
        setDb((d) => ({
          ...d,
          allocationDrafts: d.allocationDrafts.map((dr) =>
            dr.id !== draftId ? dr : {
              ...dr,
              updatedAt: now(),
              groupIds: dr.groupIds.includes(groupId) ? dr.groupIds : [...dr.groupIds, groupId],
              assignments: { ...dr.assignments, [groupId]: { patId, source: 'manual', locked: dr.assignments[groupId]?.locked ?? false, reason: '', overrideReason } },
            },
          ),
        }))
      },
      toggleDraftLock: (draftId, groupId) => {
        setDb((d) => ({
          ...d,
          allocationDrafts: d.allocationDrafts.map((dr) => {
            if (dr.id !== draftId) return dr
            const a = dr.assignments[groupId] ?? { patId: null, source: 'current' as const, locked: false, reason: '', overrideReason: '' }
            return { ...dr, updatedAt: now(), assignments: { ...dr.assignments, [groupId]: { ...a, locked: !a.locked } } }
          }),
        }))
      },
      applySuggestions: (draftId, suggestions) => {
        setDb((d) => ({
          ...d,
          allocationDrafts: d.allocationDrafts.map((dr) => {
            if (dr.id !== draftId) return dr
            const assignments = { ...dr.assignments }
            for (const s of suggestions) {
              const a = assignments[s.groupId]
              if (a?.locked) continue
              assignments[s.groupId] = { patId: s.patId, source: s.patId ? 'auto' : (a?.source ?? 'current'), locked: false, reason: s.reason, overrideReason: '' }
            }
            return { ...dr, updatedAt: now(), assignments }
          }),
        }))
      },
      clearSuggestions: (draftId) => {
        setDb((d) => ({
          ...d,
          allocationDrafts: d.allocationDrafts.map((dr) =>
            dr.id !== draftId ? dr : {
              ...dr,
              updatedAt: now(),
              assignments: Object.fromEntries(Object.entries(dr.assignments).map(([gid, a]) => [gid, a.source === 'auto' && !a.locked ? { ...a, patId: d.groups.find((g) => g.id === gid)?.patId ?? null, source: 'current', reason: '' } : a])),
            },
          ),
        }))
      },
      publishDraft: (draftId) => {
        const dr = db.allocationDrafts.find((x) => x.id === draftId)
        if (!dr || !me) return
        const t = now()
        const changes = dr.groupIds
          .map((gid) => ({ g: db.groups.find((x) => x.id === gid)!, to: dr.assignments[gid]?.patId ?? null }))
          .filter(({ g, to }) => g && g.patId !== to)
        const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? 'nobody'
        const events = changes.flatMap(({ g, to }) => [
          ...(to ? [{ id: uid('ev'), at: t, actorId: me.id, subjectUserId: to, type: 'group.assigned', message: `Allocated ${g.code} (was ${name(g.patId)}) in "${dr.name}"${dr.assignments[g.id]?.overrideReason ? `; rule override: ${dr.assignments[g.id].overrideReason}` : ''}` }] : []),
          ...(g.patId ? [{ id: uid('ev'), at: t, actorId: me.id, subjectUserId: g.patId, type: 'group.unassigned', message: `${g.code} moved to ${name(to)} in "${dr.name}"` }] : []),
        ])
        const gained = new Map<string, string[]>()
        for (const { g, to } of changes) if (to) gained.set(to, [...(gained.get(to) ?? []), g.code])
        const tasks: AssignedTask[] = [...gained.entries()].map(([pid, codes]) => ({
          id: uid('at'), title: `New group${codes.length > 1 ? 's' : ''} allocated: ${codes.join(', ')}`, description: `From "${dr.name}". Check the timetable and contact your new students.`,
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), createdBy: me.id, createdAt: t, assigneeIds: [pid], completions: [], personal: false,
        }))
        const byId = new Map(changes.map(({ g, to }) => [g.id, to]))
        setDb((d) => ({
          ...d,
          groups: d.groups.map((g) => (byId.has(g.id) ? { ...g, patId: byId.get(g.id)! } : g)),
          assignedTasks: [...d.assignedTasks, ...tasks],
          allocationDrafts: d.allocationDrafts.map((x) => (x.id === draftId ? { ...x, status: 'published', publishedAt: t, publishedBy: me.id, updatedAt: t } : x)),
          audit: [...d.audit, { id: uid('ev'), at: t, actorId: me.id, subjectUserId: null, type: 'allocation.published', message: `Published "${dr.name}": ${changes.length} group${changes.length === 1 ? '' : 's'} changed` }, ...events],
        }))
      },
      applyAllocationImport: (input) => {
        if (!me) return null
        const t = now()
        const existing = new Set(db.groups.map((g) => g.id))
        const newGroups = input.groups.filter((g) => !existing.has(g.id))
        const updated = new Map(input.groups.filter((g) => existing.has(g.id)).map((g) => [g.id, g]))
        let draft: AllocationDraft | null = null
        if (input.draftName) {
          // Imported PAT names go into a draft, so nothing changes live until it's published.
          draft = {
            id: uid('ad'), name: input.draftName, groupIds: input.groups.map((g) => g.id), createdBy: me.id, createdAt: t, updatedAt: t, status: 'draft', publishedAt: null, publishedBy: null,
            assignments: Object.fromEntries(input.groups.map((g) => [g.id, { patId: g.patId, source: 'manual' as const, locked: false, reason: 'From the imported sheet', overrideReason: '' }])),
          }
        }
        const patches = new Map(input.userPatches.map((p) => [p.id, p.patch]))
        mutate(
          (d) => ({
            ...d,
            // Groups are created/updated with their current (live) PAT unchanged; the sheet's PATs sit in the draft.
            universities: [...d.universities, ...input.newUniversities],
            courses: [...d.courses, ...input.newCourses],
            intakes: [...d.intakes, ...input.newIntakes],
            groups: [...d.groups.map((g) => (updated.has(g.id) ? { ...updated.get(g.id)!, patId: g.patId } : g)), ...newGroups.map((g) => ({ ...g, patId: null }))],
            users: d.users.map((u) => (patches.has(u.id) ? { ...u, ...patches.get(u.id) } : u)),
            allocationProfiles: [...d.allocationProfiles.filter((p) => !input.profiles.some((x) => x.userId === p.userId)), ...input.profiles],
            allocationDrafts: draft ? [...d.allocationDrafts, draft] : d.allocationDrafts,
          }),
          { type: 'allocation.imported', message: `Imported allocation sheet ${input.source}: ${newGroups.length} new groups, ${updated.size} updated, ${input.userPatches.length} PAT working patterns updated`, subjectUserId: null },
        )
        return draft?.id ?? null
      },
      recordAuditExport: (userId, format, range) => {
        const u = db.users.find((x) => x.id === userId)
        mutate((d) => d, { type: 'audit.exported', message: `Audit pack for ${u?.name} exported as ${format} (${range})`, subjectUserId: userId })
      },
      createTask: (input) => {
        if (!me) return
        const t: AssignedTask = { id: uid('at'), ...input, createdBy: me.id, createdAt: now(), completions: [] }
        mutate((d) => ({ ...d, assignedTasks: [...d.assignedTasks, t] }), input.personal
          ? undefined
          : { type: 'task.assigned', message: `Assigned "${input.title}" to ${input.assigneeIds.length} ${input.assigneeIds.length === 1 ? 'person' : 'people'}${input.dueDate ? `, due ${input.dueDate}` : ''}`, subjectUserId: null })
      },
      toggleTaskDone: (taskId, done) => {
        if (!me) return
        const t = db.assignedTasks.find((x) => x.id === taskId)
        mutate(
          (d) => ({
            ...d,
            assignedTasks: d.assignedTasks.map((x) =>
              x.id !== taskId ? x : { ...x, completions: done ? [...x.completions.filter((c) => c.userId !== me.id), { userId: me.id, at: now() }] : x.completions.filter((c) => c.userId !== me.id) },
            ),
          }),
          t && !t.personal ? { type: done ? 'task.done' : 'task.reopened', message: `${done ? 'Completed' : 'Reopened'} task "${t.title}"`, subjectUserId: me.id } : undefined,
        )
      },
      updateTask: (taskId, patch) => {
        const t = db.assignedTasks.find((x) => x.id === taskId)
        if (!t) return
        // People taken off the task lose their tick; people added start as not done.
        mutate(
          (d) => ({ ...d, assignedTasks: d.assignedTasks.map((x) => (x.id !== taskId ? x : { ...x, ...patch, completions: x.completions.filter((c) => patch.assigneeIds.includes(c.userId)) })) }),
          t.personal ? undefined : { type: 'task.updated', message: `Edited assigned task "${patch.title}" (${patch.assigneeIds.length} ${patch.assigneeIds.length === 1 ? 'person' : 'people'}${patch.dueDate ? `, due ${patch.dueDate}` : ''})`, subjectUserId: null },
        )
      },
      setPermissions: (userId, permissions) => {
        const u = db.users.find((x) => x.id === userId)
        mutate((d) => ({ ...d, users: d.users.map((x) => (x.id === userId ? { ...x, permissions } : x)) }), {
          type: 'staff.permissions', message: `Access for ${u?.name} set to: ${permissions.length ? permissions.join(', ') : 'none'}`, subjectUserId: userId,
        })
      },
      saveWorkPattern: (userId, input) => {
        const u = db.users.find((x) => x.id === userId)
        if (!u) return
        const prof = db.allocationProfiles.find((p) => p.userId === userId)
        const base: AllocationProfile = prof ?? { userId, workHours: null, availableFrom: null, maxStudents: null, minStudents: null, targetGroups: null, uniTargets: {}, preferredCampusIds: [], notes: '' }
        const off = WEEKDAYS.filter((d) => !input.workDays.includes(d))
        mutate(
          (d) => ({
            ...d,
            users: d.users.map((x) => (x.id === userId ? { ...x, shift: input.shift, workDays: input.workDays } : x)),
            allocationProfiles: [...d.allocationProfiles.filter((p) => p.userId !== userId), { ...base, workHours: input.workHours }],
          }),
          { type: 'staff.work_pattern', message: `Working pattern set: ${input.shift ?? 'no'} shift, works ${input.workDays.join(', ') || 'no days'}${off.length ? ` (off ${off.join(', ')})` : ''}${input.workHours ? `, hours ${input.workHours}` : ''}`, subjectUserId: userId },
        )
      },
      setPatLevel: (userId, level) => {
        const u = db.users.find((x) => x.id === userId)
        if (!u || u.level === level) return
        mutate((d) => ({ ...d, users: d.users.map((x) => (x.id === userId ? { ...x, level } : x)) }), {
          type: 'staff.level', message: `PAT level changed from ${u.level ?? 'none'} to ${level}`, subjectUserId: userId,
        })
      },
      decideProbation: (userId, outcome, note, level) => {
        if (!me) return
        const t = now()
        const text = outcome === 'confirmed' ? 'Probation passed and confirmed' : 'Probation not passed'
        // Probation details stay with the manager; the activity history (seen by leads) only records that a decision was made.
        mutate(
          (d) => ({
            ...d,
            probations: upsertProbation(d.probations, userId, (p) => ({ ...p, outcome, note, decidedAt: t, decidedBy: me.id, hrNotifiedAt: null, hrNotifiedBy: null, events: [...p.events, { at: t, by: me.id, text: note ? `${text}: ${note}` : text }] })),
            users: level ? d.users.map((x) => (x.id === userId ? { ...x, level } : x)) : d.users,
          }),
          { type: 'probation.decided', message: 'Probation outcome recorded by the PAT Manager', subjectUserId: userId },
        )
      },
      extendProbation: (userId, until, note) => {
        if (!me) return
        const t = now()
        mutate(
          (d) => ({ ...d, probations: upsertProbation(d.probations, userId, (p) => ({ ...p, extendedTo: until, outcome: null, decidedAt: null, decidedBy: null, hrNotifiedAt: null, hrNotifiedBy: null, events: [...p.events, { at: t, by: me.id, text: `Probation extended to ${until}${note ? `: ${note}` : ''}` }] })) }),
          { type: 'probation.extended', message: `Probation extended to ${until}`, subjectUserId: userId },
        )
      },
      reopenProbation: (userId) => {
        if (!me) return
        const t = now()
        mutate((d) => ({ ...d, probations: upsertProbation(d.probations, userId, (p) => ({ ...p, outcome: null, decidedAt: null, decidedBy: null, hrNotifiedAt: null, hrNotifiedBy: null, events: [...p.events, { at: t, by: me.id, text: 'Decision withdrawn (not yet sent to HR)' }] })) }))
      },
      markProbationSentToHr: (userId) => {
        if (!me) return
        const t = now()
        const hr = db.settings.hrManagerName || 'the HR manager'
        mutate(
          (d) => ({ ...d, probations: upsertProbation(d.probations, userId, (p) => ({ ...p, hrNotifiedAt: t, hrNotifiedBy: me.id, events: [...p.events, { at: t, by: me.id, text: `Outcome confirmed to ${hr} (HR manager)` }] })) }),
          { type: 'probation.hr', message: 'Probation outcome confirmed to HR', subjectUserId: userId },
        )
      },
      // Private notes are deliberately not written to the audit trail, which leads and exports can see.
      addStaffNote: (userId, text) => {
        if (!me) return
        const note: StaffNote = { id: uid('sn'), userId, authorId: me.id, at: now(), editedAt: null, text }
        setDb((d) => ({ ...d, staffNotes: [...d.staffNotes, note] }))
      },
      updateStaffNote: (noteId, text) => {
        setDb((d) => ({ ...d, staffNotes: d.staffNotes.map((n) => (n.id === noteId ? { ...n, text, editedAt: now() } : n)) }))
      },
      deleteStaffNote: (noteId) => {
        setDb((d) => ({ ...d, staffNotes: d.staffNotes.filter((n) => n.id !== noteId) }))
      },
      saveSettings: (patch) => {
        mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }), { type: 'settings.updated', message: 'Updated the HR manager contact', subjectUserId: null })
      },
      deleteGroup: (groupId, moveStudentsTo) => {
        const g = db.groups.find((x) => x.id === groupId)
        if (!g) return
        const target = db.groups.find((x) => x.id === moveStudentsTo)
        const moved = db.students.filter((s) => s.groupId === groupId).length
        mutate(
          (d) => ({
            ...d,
            groups: d.groups.filter((x) => x.id !== groupId),
            students: target ? d.students.map((s) => (s.groupId === groupId ? { ...s, groupId: target.id } : s)) : d.students,
            allocationDrafts: d.allocationDrafts.map((dr) => {
              if (!dr.groupIds.includes(groupId)) return dr
              const assignments = { ...dr.assignments }
              delete assignments[groupId]
              return { ...dr, groupIds: dr.groupIds.filter((x) => x !== groupId), assignments }
            }),
          }),
          { type: 'group.deleted', message: `Deleted group ${g.code}${target ? `; moved ${moved} student${moved === 1 ? '' : 's'} to ${target.code}` : ''}`, subjectUserId: g.patId },
        )
      },
      deleteTask: (taskId) => {
        const t = db.assignedTasks.find((x) => x.id === taskId)
        mutate((d) => ({ ...d, assignedTasks: d.assignedTasks.filter((x) => x.id !== taskId) }), t && !t.personal ? { type: 'task.deleted', message: `Deleted assigned task "${t.title}"`, subjectUserId: null } : undefined)
      },
      submitLeave: (input) => {
        if (!me) return
        const t = now()
        const id = uid('lv')
        const req: LeaveRequest = {
          id, requesterId: me.id, type: input.type, startDate: input.startDate, endDate: input.endDate, reason: input.reason,
          status: input.covers.length ? 'awaiting_cover' : statusAfterCover(db, me), createdAt: t,
          leadDecision: null, managerDecision: null, cancelledAt: null,
        }
        const slots: CoverSlot[] = input.covers.map((c) => ({ id: uid('cs'), leaveId: id, ...c, status: 'pending', respondedAt: null, note: '' }))
        const coverEvents = slots.map((s) => ({
          id: uid('ev'), at: t, actorId: me.id, subjectUserId: s.coverPatId, type: 'cover.requested',
          message: `Asked to cover ${db.groups.find((g) => g.id === s.groupId)?.code} on ${s.date} for ${me.name}`,
        }))
        setDb((d) => ({
          ...d,
          leaveRequests: [...d.leaveRequests, req],
          coverSlots: [...d.coverSlots, ...slots],
          audit: [...d.audit, { id: uid('ev'), at: t, actorId: me.id, subjectUserId: me.id, type: 'leave.requested', message: `Requested ${input.type} leave ${input.startDate} to ${input.endDate} (${slots.length} sessions to cover)` }, ...coverEvents],
        }))
      },
      respondCover: (slotId, accept, note) => {
        const slot = db.coverSlots.find((c) => c.id === slotId)
        const req = db.leaveRequests.find((r) => r.id === slot?.leaveId)
        const requester = db.users.find((u) => u.id === req?.requesterId)
        if (!slot || !req || !requester || !me) return
        const t = now()
        const slots = db.coverSlots.map((c) => (c.id === slotId ? { ...c, status: accept ? ('accepted' as const) : ('declined' as const), respondedAt: t, note } : c))
        const allAccepted = slots.filter((c) => c.leaveId === req.id).every((c) => c.status === 'accepted')
        const group = db.groups.find((g) => g.id === slot.groupId)?.code
        mutate(
          (d) => ({
            ...d,
            coverSlots: slots,
            leaveRequests: d.leaveRequests.map((r) => (r.id === req.id && allAccepted && r.status === 'awaiting_cover' ? { ...r, status: statusAfterCover(d, requester) } : r)),
          }),
          { type: accept ? 'cover.accepted' : 'cover.declined', message: `${me.name} ${accept ? 'accepted' : 'declined'} cover of ${group} on ${slot.date} for ${requester.name}${note ? `: ${note}` : ''}`, subjectUserId: requester.id },
        )
      },
      replaceCover: (slotId, coverPatId) => {
        const slot = db.coverSlots.find((c) => c.id === slotId)
        const who = db.users.find((u) => u.id === coverPatId)?.name
        mutate((d) => ({ ...d, coverSlots: d.coverSlots.map((c) => (c.id === slotId ? { ...c, coverPatId, status: 'pending', respondedAt: null, note: '' } : c)) }), {
          type: 'cover.requested', message: `Asked ${who} to cover ${db.groups.find((g) => g.id === slot?.groupId)?.code} on ${slot?.date}`, subjectUserId: me?.id ?? null,
        })
      },
      decideLeave: (leaveId, approved, note) => {
        const req = db.leaveRequests.find((r) => r.id === leaveId)
        if (!req || !me) return
        const decision = { by: me.id, at: now(), approved, note }
        const atLead = req.status === 'awaiting_lead'
        mutate(
          (d) => ({
            ...d,
            leaveRequests: d.leaveRequests.map((r) =>
              r.id !== leaveId ? r : atLead
                ? { ...r, leadDecision: decision, status: approved ? 'awaiting_manager' : 'rejected' }
                : { ...r, managerDecision: decision, status: approved ? 'approved' : 'rejected' },
            ),
          }),
          { type: approved ? 'leave.approved' : 'leave.rejected', message: `${atLead ? 'PAT Lead' : 'PAT Manager'} ${approved ? 'approved' : 'rejected'} leave ${req.startDate} to ${req.endDate}${note ? `: ${note}` : ''}`, subjectUserId: req.requesterId },
        )
      },
      cancelLeave: (leaveId) => {
        const req = db.leaveRequests.find((r) => r.id === leaveId)
        mutate((d) => ({ ...d, leaveRequests: d.leaveRequests.map((r) => (r.id === leaveId ? { ...r, status: 'cancelled', cancelledAt: now() } : r)) }), {
          type: 'leave.cancelled', message: `Cancelled leave ${req?.startDate} to ${req?.endDate}`, subjectUserId: req?.requesterId ?? null,
        })
      },
      saveLsa: (input) => {
        if (!me) return
        const t = now()
        const prev = input.id ? db.lsas.find((l) => l.id === input.id) : undefined
        const s = db.students.find((x) => x.id === input.studentId)
        const patId = db.groups.find((g) => g.id === s?.groupId)?.patId ?? null
        const lsa: Lsa = prev
          ? { ...prev, ...input, id: prev.id, updatedAt: t, updatedBy: me.id }
          : { ...input, id: uid('lsa'), createdBy: me.id, createdAt: t, updatedAt: t, updatedBy: me.id }
        // Describe what changed, so the history keeps every version.
        const changes: string[] = []
        if (!prev) changes.push(`LSA signed (start ${input.startDate})`)
        else {
          if (prev.startDate !== lsa.startDate) changes.push(`start date ${prev.startDate} → ${lsa.startDate}`)
          if (prev.endDate !== lsa.endDate) changes.push(`end date ${prev.endDate ?? 'none'} → ${lsa.endDate ?? 'none'}`)
          if (prev.nextFollowUp !== lsa.nextFollowUp) changes.push(`next follow-up ${prev.nextFollowUp ?? 'none'} → ${lsa.nextFollowUp ?? 'none'}`)
        }
        if (lsa.comments && lsa.comments !== prev?.comments) changes.push(`Comment: ${lsa.comments}`)
        if (changes.length === 0) return
        const update = { id: uid('lu'), lsaId: lsa.id, at: t, by: me.id, summary: changes.join('; ') }
        mutate(
          (d) => ({ ...d, lsas: prev ? d.lsas.map((l) => (l.id === lsa.id ? lsa : l)) : [...d.lsas, lsa], lsaUpdates: [...d.lsaUpdates, update] }),
          { type: prev ? 'lsa.updated' : 'lsa.created', message: `${prev ? 'LSA updated' : 'LSA signed'}${s ? `: ${s.firstName} ${s.lastName}` : ''} (${changes.join('; ')})`, subjectUserId: patId },
        )
      },
      importLsas: (rows, source) => {
        if (!me) return
        const t = now()
        const byId = new Map(rows.filter((r) => r.existingId).map((r) => [r.existingId!, r]))
        const created: Lsa[] = rows
          .filter((r) => !r.existingId)
          .map((r) => ({ id: uid('lsa'), studentId: r.studentId, startDate: r.startDate, endDate: r.endDate, nextFollowUp: r.nextFollowUp, comments: r.comments, createdBy: me.id, createdAt: t, updatedAt: t, updatedBy: me.id }))
        const updates = [
          ...created.map((l) => ({ id: uid('lu'), lsaId: l.id, at: t, by: me.id, summary: `Imported from ${source}` })),
          ...[...byId.keys()].map((id) => ({ id: uid('lu'), lsaId: id, at: t, by: me.id, summary: `Updated from ${source}` })),
        ]
        mutate(
          (d) => ({
            ...d,
            lsas: [
              ...d.lsas.map((l) => {
                const r = byId.get(l.id)
                return r ? { ...l, endDate: r.endDate, nextFollowUp: r.nextFollowUp, comments: r.comments || l.comments, updatedAt: t, updatedBy: me.id } : l
              }),
              ...created,
            ],
            lsaUpdates: [...d.lsaUpdates, ...updates],
          }),
          { type: 'lsa.imported', message: `Imported ${rows.length} LSA records from ${source} (${created.length} new, ${byId.size} updated)`, subjectUserId: null },
        )
      },
      voidComm: (id, reason) => {
        mutate((d) => ({ ...d, comms: d.comms.map((c) => (c.id === id ? { ...c, voidedAt: now(), voidReason: reason } : c)) }), {
          type: 'comm.voided', message: `Marked a call log entry as entered in error: ${reason}`, subjectUserId: me?.id ?? null,
        })
      },
    }
  }, [db, me, meId, mutate, upsertProgress])

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}

export function useDb() {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb must be used inside DbProvider')
  return ctx
}
