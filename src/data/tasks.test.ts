import { describe, expect, it } from 'vitest'
import { buildSeed } from './seed'
import { bucketOf, tasksFor, type Task } from './tasks'
import type { AssignedTask, CommLog, DbState, LeaveRequest } from './types'

const base = buildSeed()
const now = new Date()
const today = now.toISOString().slice(0, 10)
const pat = base.users.find((u) => u.name === 'Sofia Rahman')!
const newJoiner = base.users.find((u) => u.id === 'u-new-1')!
const lead = base.users.find((u) => u.role === 'lead' && u.campusId === pat.campusId)!
const admin = base.users.find((u) => u.role === 'admin')!
const ids = (tasks: Task[]) => tasks.map((t) => t.id)

describe('tasksFor', () => {
  it('gives new joiners their outstanding training modules', () => {
    const t = tasksFor(base, newJoiner, now)
    expect(t.filter((x) => x.source === 'training').length).toBeGreaterThan(0)
  })

  it('includes call-log follow-ups the PAT set, and clears them when done', () => {
    const s = base.students.find((x) => base.groups.find((g) => g.id === x.groupId)?.patId === pat.id)!
    const log: CommLog = { id: 'c1', authorId: pat.id, kind: 'individual', studentId: s.id, groupIds: [], channel: 'phone', direction: 'outbound', outcome: 'reached', reason: 'attendance', summary: 'x', at: now.toISOString(), loggedAt: now.toISOString(), followUpDate: today, followUpDoneAt: null, voidedAt: null, voidReason: '' }
    const db: DbState = { ...base, comms: [log] }
    expect(ids(tasksFor(db, pat, now))).toContain('fu-c1')
    expect(ids(tasksFor({ ...db, comms: [{ ...log, followUpDoneAt: now.toISOString() }] }, pat, now))).not.toContain('fu-c1')
  })

  it('shows assigned tasks until the person ticks them off', () => {
    const task: AssignedTask = { id: 'a1', title: 'Do the thing', description: '', dueDate: today, createdBy: admin.id, createdAt: '', assigneeIds: [pat.id], completions: [], personal: false }
    const db: DbState = { ...base, assignedTasks: [task] }
    expect(ids(tasksFor(db, pat, now))).toContain('as-a1')
    expect(ids(tasksFor({ ...db, assignedTasks: [{ ...task, completions: [{ userId: pat.id, at: '' }] }] }, pat, now))).not.toContain('as-a1')
  })

  it('asks the campus lead to approve leave once covers are in', () => {
    const r: LeaveRequest = { id: 'lv', requesterId: pat.id, type: 'annual', startDate: '2099-01-10', endDate: '2099-01-11', reason: '', status: 'awaiting_lead', createdAt: '', leadDecision: null, managerDecision: null, cancelledAt: null }
    const db: DbState = { ...base, leaveRequests: [r], coverSlots: [] }
    expect(ids(tasksFor(db, lead, now))).toContain('ap-lv')
    expect(ids(tasksFor(db, pat, now))).not.toContain('ap-lv')
  })

  it('reminds admins to upload attendance when this week is missing', () => {
    const db: DbState = { ...base, attendanceUploads: [] }
    expect(ids(tasksFor(db, admin, now))).toContain('att-upload')
  })
})

describe('bucketOf', () => {
  it('groups by due date', () => {
    const t = (due: string | null): Task => ({ id: 'x', source: 'team', title: '', detail: '', due, link: '/' })
    expect(bucketOf(t('2026-09-24'), '2026-09-25')).toBe('overdue')
    expect(bucketOf(t('2026-09-25'), '2026-09-25')).toBe('today')
    expect(bucketOf(t('2026-10-02'), '2026-09-25')).toBe('week')
    expect(bucketOf(t('2026-10-03'), '2026-09-25')).toBe('later')
    expect(bucketOf(t(null), '2026-09-25')).toBe('undated')
  })
})
