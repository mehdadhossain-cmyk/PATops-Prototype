// Probation rules: every PAT is on probation for 4 months from their start date.
// The PAT Manager decides the outcome, then confirms it to the HR manager.
import type { DbState, Probation, User } from './types'

export const PROBATION_MONTHS = 4
/** The manager is reminded this many days before a probation ends. */
export const PROBATION_REMIND_DAYS = 14
/** Seeded/migrated PATs whose probation ended longer ago than this are treated as already confirmed. */
export const PROBATION_HISTORY_DAYS = 30

export type ProbationStatus = 'not_started' | 'in_progress' | 'due_soon' | 'awaiting_decision' | 'awaiting_hr' | 'complete'
export const PROBATION_STATUS_LABEL: Record<ProbationStatus, string> = {
  not_started: 'Not started yet',
  in_progress: 'In probation',
  due_soon: 'Ending soon',
  awaiting_decision: 'Waiting for manager decision',
  awaiting_hr: 'Waiting to be confirmed to HR',
  complete: 'Complete',
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (date: string) => new Date(`${date}T12:00:00Z`)
export const addDaysTo = (date: string, n: number) => iso(new Date(at(date).getTime() + n * 86400000))

/** Same day of the month, n months later (clamped to the month's last day, e.g. 31 Oct → 28 Feb). */
export function addMonths(date: string, n: number): string {
  const d = at(date)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return iso(target)
}

export const emptyProbation = (userId: string): Probation => ({
  userId, extendedTo: null, outcome: null, decidedAt: null, decidedBy: null, note: '', hrNotifiedAt: null, hrNotifiedBy: null, events: [],
})

/** PATs who have (or will have) a probation. Inactive staff are left out. */
export const hasProbation = (u: User) => u.role === 'pat' && u.status !== 'inactive'

export const probationFor = (db: DbState, userId: string): Probation => db.probations.find((p) => p.userId === userId) ?? emptyProbation(userId)

export const standardEnd = (u: User) => addMonths(u.startDate, PROBATION_MONTHS)
export const probationEnd = (u: User, p: Probation) => p.extendedTo ?? standardEnd(u)

export function probationStatus(u: User, p: Probation, today = iso(new Date())): ProbationStatus {
  if (p.outcome) return p.hrNotifiedAt ? 'complete' : 'awaiting_hr'
  if (u.startDate > today) return 'not_started'
  const end = probationEnd(u, p)
  if (end <= today) return 'awaiting_decision'
  if (end <= addDaysTo(today, PROBATION_REMIND_DAYS)) return 'due_soon'
  return 'in_progress'
}

export interface ProbationRow {
  user: User
  probation: Probation
  end: string
  status: ProbationStatus
  /** Days until the end (negative once it has passed). */
  daysLeft: number
}

export function probationRows(db: DbState, today = iso(new Date())): ProbationRow[] {
  return db.users.filter(hasProbation).map((user) => {
    const probation = probationFor(db, user.id)
    const end = probationEnd(user, probation)
    return { user, probation, end, status: probationStatus(user, probation, today), daysLeft: Math.round((+at(end) - +at(today)) / 86400000) }
  })
}

/** Probations the manager needs to act on: decide, or confirm to HR. */
export const needsManager = (r: ProbationRow) => r.status === 'due_soon' || r.status === 'awaiting_decision' || r.status === 'awaiting_hr'

/** Text for the confirmation email to the HR manager. */
export function hrEmail(db: DbState, r: ProbationRow, managerName: string): { subject: string; body: string } {
  const { user, probation: p } = r
  const outcome = p.outcome === 'confirmed' ? 'has passed their probation, which I confirm' : 'has not passed their probation'
  const hr = db.settings.hrManagerName.split(' ')[0] || 'there'
  return {
    subject: `Probation outcome: ${user.name}`,
    body: [
      `Hi ${hr},`,
      '',
      `${user.name} (PAT, started ${user.startDate}) ${outcome}.`,
      `Probation period: ${user.startDate} to ${r.end}${p.extendedTo ? ' (extended)' : ''}.`,
      ...(p.note ? ['', `Notes: ${p.note}`] : []),
      '',
      'Many thanks,',
      managerName,
    ].join('\n'),
  }
}

/** Demo history: PATs whose probation ended a while ago were confirmed at the time. */
export function buildProbationSeed(users: User[], managerId: string, now = new Date()): Probation[] {
  const today = iso(now)
  const cutoff = addDaysTo(today, -PROBATION_HISTORY_DAYS)
  const out: Probation[] = []
  const pats = users.filter((u) => u.role === 'pat')
  for (const u of pats) {
    const end = standardEnd(u)
    if (end > cutoff) continue
    const decided = `${addDaysTo(end, -3)}T10:00:00.000Z`
    const sent = `${addDaysTo(end, -2)}T09:30:00.000Z`
    out.push({
      ...emptyProbation(u.id), outcome: 'confirmed', decidedAt: decided, decidedBy: managerId, hrNotifiedAt: sent, hrNotifiedBy: managerId,
      events: [
        { at: decided, by: managerId, text: 'Probation passed and confirmed' },
        { at: sent, by: managerId, text: 'Outcome confirmed to the HR manager' },
      ],
    })
  }
  // One recent probation decided but not yet confirmed to HR, so the demo shows that step.
  const recent = pats.filter((u) => u.status === 'active' && standardEnd(u) > cutoff && standardEnd(u) <= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  if (recent) {
    const decided = `${addDaysTo(today, -2)}T15:00:00.000Z`
    out.push({ ...emptyProbation(recent.id), outcome: 'confirmed', decidedAt: decided, decidedBy: managerId, note: 'Strong first term; students’ feedback very positive.', events: [{ at: decided, by: managerId, text: 'Probation passed and confirmed' }] })
  }
  return out
}
