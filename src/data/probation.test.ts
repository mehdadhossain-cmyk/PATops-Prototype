import { describe, expect, it } from 'vitest'
import { buildSeed } from './seed'
import { addMonths, emptyProbation, hrEmail, needsManager, probationRows, probationStatus } from './probation'
import { tasksFor } from './tasks'
import type { User } from './types'

const base = buildSeed()
const pat = (startDate: string): User => ({ ...base.users.find((u) => u.role === 'pat')!, startDate, status: 'active' })

describe('probation', () => {
  it('ends 4 months after the start date, clamping to the end of short months', () => {
    expect(addMonths('2026-01-15', 4)).toBe('2026-05-15')
    expect(addMonths('2025-10-31', 4)).toBe('2026-02-28')
    expect(addMonths('2026-09-30', 4)).toBe('2027-01-30')
  })

  it('moves through in probation → ending soon → decision → HR → complete', () => {
    const u = pat('2026-01-15') // ends 2026-05-15
    const p = emptyProbation(u.id)
    expect(probationStatus(u, p, '2026-01-01')).toBe('not_started')
    expect(probationStatus(u, p, '2026-04-30')).toBe('in_progress')
    expect(probationStatus(u, p, '2026-05-01')).toBe('due_soon')
    expect(probationStatus(u, p, '2026-05-15')).toBe('awaiting_decision')
    const decided = { ...p, outcome: 'confirmed' as const, decidedAt: '2026-05-16T10:00:00Z', decidedBy: 'u-manager' }
    expect(probationStatus(u, decided, '2026-05-16')).toBe('awaiting_hr')
    expect(probationStatus(u, { ...decided, hrNotifiedAt: '2026-05-17T10:00:00Z' }, '2026-05-17')).toBe('complete')
  })

  it('uses the extended end date', () => {
    const u = pat('2026-01-15')
    expect(probationStatus(u, { ...emptyProbation(u.id), extendedTo: '2026-07-15' }, '2026-05-20')).toBe('in_progress')
  })

  it('seeds a demo that shows every step the manager handles', () => {
    const rows = probationRows(base)
    expect(rows.some((r) => r.status === 'awaiting_decision')).toBe(true)
    expect(rows.some((r) => r.status === 'awaiting_hr')).toBe(true)
    expect(rows.some((r) => r.status === 'complete')).toBe(true)
    expect(rows.some((r) => r.status === 'in_progress')).toBe(true)
    expect(rows.every((r) => r.user.role === 'pat')).toBe(true)
  })

  it('reminds the manager and the owner, not admins or leads', () => {
    const due = probationRows(base).filter(needsManager).length
    const probationTasks = (id: string) => tasksFor(base, base.users.find((u) => u.id === id)!).filter((t) => t.source === 'probation').length
    expect(probationTasks('u-manager')).toBe(due)
    expect(probationTasks('u-owner')).toBe(due)
    expect(probationTasks('u-admin-1')).toBe(0)
    expect(probationTasks('u-lead-1')).toBe(0)
  })

  it('writes the HR email with the outcome and notes', () => {
    const r = probationRows(base).find((x) => x.status === 'awaiting_hr')!
    const mail = hrEmail(base, r, 'Sarah Mitchell')
    expect(mail.subject).toContain(r.user.name)
    expect(mail.body).toContain('has passed their probation')
    expect(mail.body).toContain(r.probation.note)
    expect(mail.body).toMatch(/^Hi Rebecca,/)
  })
})
