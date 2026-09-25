import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildSeed, DB_VERSION } from '../data/seed'
import { buildAcademicSeed } from '../data/seedAcademic'
import { buildCommsSeed } from '../data/seedComms'
import { isProfileComplete, scoreQuiz } from '../data/logic'
import { loadSaved, save } from './persist'
import type { CommLog, Course, DbState, Group, Intake, Role, Student, TrainingModule, TrainingProgress, University, User } from '../data/types'

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
