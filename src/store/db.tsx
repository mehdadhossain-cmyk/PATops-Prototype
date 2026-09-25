import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildSeed, DB_VERSION } from '../data/seed'
import { buildAcademicSeed } from '../data/seedAcademic'
import { isProfileComplete, scoreQuiz } from '../data/logic'
import type { Course, DbState, Group, Intake, Role, Student, TrainingModule, TrainingProgress, University, User } from '../data/types'

const STORAGE_KEY = 'patops.db'
const SESSION_KEY = 'patops.session'

function load(): DbState {
  try {
    const raw = storage.get(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DbState
      if (parsed.version === DB_VERSION) return parsed
      // v1 -> v2: keep staff and training progress, add the academic structure.
      if (parsed.version === 1) return { ...parsed, ...buildAcademicSeed(parsed.users, parsed.campuses), version: DB_VERSION }
    }
  } catch {
    // fall through to seed
  }
  return buildSeed()
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
}

const DbContext = createContext<DbContextValue | null>(null)

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbState>(load)
  const [meId, setMeId] = useState<string | null>(() => storage.get(SESSION_KEY))

  useEffect(() => {
    storage.set(STORAGE_KEY, JSON.stringify(db))
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
    }
  }, [db, me, meId, mutate, upsertProgress])

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}

export function useDb() {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb must be used inside DbProvider')
  return ctx
}
