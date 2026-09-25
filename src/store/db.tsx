import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildSeed, DB_VERSION } from '../data/seed'
import { buildAcademicSeed } from '../data/seedAcademic'
import { buildCommsSeed } from '../data/seedComms'
import { buildWellbeingSeed } from '../data/seedWellbeing'
import { buildAttendanceSeed } from '../data/seedAttendance'
import { buildSubmissionsSeed } from '../data/seedSubmissions'
import { buildLsaSeed } from '../data/seedLsa'
import { isProfileComplete, scoreQuiz } from '../data/logic'
import { loadSaved, save } from './persist'
import type { RetentionStage } from '../data/types'
import type { AttendanceRow, LsaRow, NonSubmissionRow } from '../data/importer'
import type { Lsa } from '../data/types'
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

  // Debounced so bursts of edits are written once.
  useEffect(() => {
    const t = setTimeout(() => save(db), 300)
    return () => clearTimeout(t)
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
              id: uid('cl'), authorId: me.id, kind: 'individual', studentId: c.studentId, groupIds: [], channel: 'teams', direction: 'outbound',
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
        const withdraw = stage === 'withdrawn' && (me.role === 'admin' || me.role === 'manager')
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
              id: uid('cl'), authorId: me.id, kind: 'individual', studentId: n.studentId, groupIds: [], channel: callLog, direction: 'outbound',
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
