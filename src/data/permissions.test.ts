import { describe, expect, it } from 'vitest'
import { scheduleFields } from './allocation'
import { can, canEditStaffMember, creatableRoles, isProfileComplete } from './logic'
import { buildSeed, DB_VERSION, migrateToV11 } from './seed'
import { canEditTask } from './tasks'
import type { AssignedTask, DbState, User } from './types'

const db = buildSeed()
const user = (id: string) => db.users.find((u) => u.id === id)!

describe('roles and permissions', () => {
  it('gives the manager and the owner everything', () => {
    for (const id of ['u-owner', 'u-manager']) {
      expect(can(user(id), 'allocation')).toBe(true)
      expect(can(user(id), 'schedules')).toBe(true)
    }
  })

  it('only lets admins do what they have been given', () => {
    expect(can(user('u-admin-1'), 'allocation')).toBe(true)
    expect(can(user('u-admin-2'), 'allocation')).toBe(false)
    expect(can(user('u-admin-2'), 'academic')).toBe(true)
    expect(can({ ...user('u-admin-2'), permissions: [] }, 'academic')).toBe(false)
  })

  it('never gives leads or PATs admin permissions, even if set', () => {
    expect(can({ ...user('u-lead-1'), permissions: ['allocation'] }, 'allocation')).toBe(false)
    expect(can({ ...user('u-pat-1'), permissions: ['schedules'] }, 'schedules')).toBe(false)
  })

  it('protects the owner account and limits who can create managers', () => {
    expect(canEditStaffMember(user('u-manager'), user('u-owner'))).toBe(false)
    expect(canEditStaffMember(user('u-owner'), user('u-manager'))).toBe(true)
    expect(canEditStaffMember(user('u-admin-1'), user('u-admin-2'))).toBe(false)
    expect(canEditStaffMember(user('u-admin-1'), user('u-pat-1'))).toBe(true)
    expect(creatableRoles(user('u-owner'))).toContain('manager')
    expect(creatableRoles(user('u-manager'))).not.toContain('manager')
    expect(creatableRoles(user('u-admin-3'))).toEqual([])
  })

  it("doesn't need a shift or working days for a PAT's own profile to be complete", () => {
    expect(isProfileComplete({ ...user('u-pat-1'), shift: null, workDays: [] })).toBe(true)
  })

  it('classifies PATs by level and nobody else', () => {
    expect(db.users.filter((u) => u.role === 'pat').every((u) => u.level)).toBe(true)
    expect(db.users.filter((u) => u.role !== 'pat').every((u) => u.level === null)).toBe(true)
    expect(new Set(db.users.map((u) => u.level).filter(Boolean))).toEqual(new Set(['trainee', 'junior', 'senior']))
  })
})

describe('editing tasks', () => {
  const t = (over: Partial<AssignedTask>): AssignedTask => ({ id: 't', title: 'x', description: '', dueDate: null, createdBy: 'u-lead-1', createdAt: '', assigneeIds: ['u-pat-1', 'u-pat-2'], completions: [], personal: false, ...over })
  it('lets the creator and the manager edit an assigned task, not the assignees', () => {
    expect(canEditTask(user('u-lead-1'), t({}))).toBe(true)
    expect(canEditTask(user('u-manager'), t({}))).toBe(true)
    expect(canEditTask(user('u-pat-1'), t({}))).toBe(false)
  })
  it('keeps personal reminders private to their owner', () => {
    expect(canEditTask(user('u-pat-1'), t({ personal: true, createdBy: 'u-pat-1', assigneeIds: ['u-pat-1'] }))).toBe(true)
    expect(canEditTask(user('u-manager'), t({ personal: true, createdBy: 'u-pat-1', assigneeIds: ['u-pat-1'] }))).toBe(false)
  })
})

describe('group schedule', () => {
  it('derives days, times and shift from the session grid', () => {
    const f = scheduleFields([{ day: 'Tue', slots: ['Eve'] }, { day: 'Mon', slots: ['Afr', 'Eve'] }])
    expect(f.classDays).toEqual(['Mon', 'Tue'])
    expect(f.startTime).toBe('13:00')
    expect(f.endTime).toBe('21:00')
    expect(f.shift).toBe('evening')
    expect(scheduleFields([{ day: 'Wed', slots: ['Mor'] }]).shift).toBe('morning')
  })
})

describe('upgrading saved data to v11', () => {
  it('adds the owner, permissions, levels, probation and multi-channel call logs', () => {
    const old = {
      ...db,
      version: 10,
      users: db.users.filter((u) => u.role !== 'owner').map(({ level: _l, permissions: _p, ...u }) => u),
      comms: db.comms.map(({ channels, ...c }) => ({ ...c, channel: channels[0] })),
      probations: undefined,
      staffNotes: undefined,
      settings: undefined,
    } as unknown as DbState
    const next = migrateToV11(old)
    expect(next.version).toBe(DB_VERSION)
    expect(next.users.filter((u) => u.role === 'owner')).toHaveLength(1)
    expect((next.users.find((u) => u.id === 'u-admin-3') as User).permissions).not.toContain('allocation')
    expect(next.users.find((u) => u.id === 'u-pat-1')!.level).toBe('senior')
    expect(next.comms.every((c) => c.channels.length === 1 && !('channel' in c))).toBe(true)
    expect(next.probations.length).toBeGreaterThan(0)
    expect(next.staffNotes).toEqual([])
    expect(next.settings.hrManagerEmail).toContain('@')
  })
})
