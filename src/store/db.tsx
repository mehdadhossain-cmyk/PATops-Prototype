import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildSeed, DB_VERSION } from '../data/seed'
import { isProfileComplete, scoreQuiz } from '../data/logic'
import type { DbState, Role, TrainingModule, TrainingProgress, User } from '../data/types'

const STORAGE_KEY = 'patops.db'
const SESSION_KEY = 'patops.session'

function load(): DbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DbState
      if (parsed.version === DB_VERSION) return parsed
    }
  } catch {
    // fall through to seed
  }
  return buildSeed()
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
}

const DbContext = createContext<DbContextValue | null>(null)

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbState>(load)
  const [meId, setMeId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }, [db])

  useEffect(() => {
    if (meId) localStorage.setItem(SESSION_KEY, meId)
    else localStorage.removeItem(SESSION_KEY)
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
    }
  }, [db, me, mutate, upsertProgress])

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}

export function useDb() {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb must be used inside DbProvider')
  return ctx
}
