// Demo leave requests at every stage of the cover and approval flow.
import type { CoverSlot, Decision, Group, LeaveRequest, LeaveStatus, LeaveType, User } from './types'
import { coverCandidates, sessionsToCover, statusAfterCover } from './leave'
import type { DbState } from './types'

const day = 24 * 60 * 60 * 1000
const iso = (n: number) => new Date(Date.now() + n * day).toISOString().slice(0, 10)

interface Plan {
  requester: string
  from: number
  to: number
  type: LeaveType
  reason: string
  stage: LeaveStatus
  /** Force this PAT as the cover for the first session, so a demo user has something to respond to. */
  firstCover?: string
  declineFirst?: boolean
}

export function buildLeaveSeed(users: User[], groups: Group[]): { leaveRequests: LeaveRequest[]; coverSlots: CoverSlot[] } {
  // Sofia Rahman (the Salford demo PAT) is asked to cover a colleague, and has her own request in progress.
  const sofia = users.find((u) => u.name === 'Sofia Rahman')?.id
  const salford = users.filter((u) => u.role === 'pat' && u.status === 'active' && u.campusId === 'c-salford' && u.id !== sofia).map((u) => u.id)
  const derby = users.filter((u) => u.role === 'pat' && u.status === 'active' && u.campusId === 'c-derby').map((u) => u.id)
  const newcastle = users.filter((u) => u.role === 'pat' && u.status === 'active' && u.campusId === 'c-newcastle').map((u) => u.id)
  const plans = ([
    { requester: salford[0], from: 9, to: 13, type: 'annual', reason: 'Family visit', stage: 'awaiting_cover', firstCover: sofia },
    ...(sofia ? [{ requester: sofia, from: 20, to: 22, type: 'annual' as LeaveType, reason: 'Short break', stage: 'awaiting_lead' as LeaveStatus }] : []),
    { requester: salford[1], from: 30, to: 34, type: 'annual', reason: 'Holiday', stage: 'awaiting_manager' },
    { requester: derby[0], from: 5, to: 6, type: 'medical_appointment', reason: 'Hospital appointment', stage: 'approved' },
    { requester: derby[1], from: -12, to: -8, type: 'annual', reason: 'Holiday', stage: 'approved' },
    { requester: newcastle[0], from: 14, to: 18, type: 'annual', reason: 'Wedding', stage: 'awaiting_cover', declineFirst: true },
    { requester: newcastle[1], from: 3, to: 3, type: 'toil', reason: 'Open day on Saturday', stage: 'rejected' },
  ] as Plan[]).filter((p) => p.requester)

  const db = { users, groups, leaveRequests: [] as LeaveRequest[], coverSlots: [] as CoverSlot[] } as unknown as DbState
  const lead = (campusId: string | null) => users.find((u) => u.role === 'lead' && u.campusId === campusId)?.id ?? 'u-manager'
  const at = (offsetDays: number) => new Date(Math.min(Date.now() + offsetDays * day, Date.now() - 3600000)).toISOString()

  plans.forEach((p, i) => {
    const requester = users.find((u) => u.id === p.requester)!
    const start = iso(p.from)
    const end = iso(p.to)
    const created = at(Math.min(p.from, 0) - 10)
    const id = `lv-${i + 1}`
    const approvedLead: Decision | null = ['awaiting_manager', 'approved'].includes(p.stage)
      ? { by: lead(requester.campusId), at: at(Math.min(p.from, 0) - 7), approved: true, note: 'Cover confirmed.' }
      : null
    const req: LeaveRequest = {
      id, requesterId: requester.id, type: p.type, startDate: start, endDate: end, reason: p.reason,
      status: p.stage, createdAt: created,
      leadDecision: p.stage === 'rejected' ? { by: lead(requester.campusId), at: at(-1), approved: false, note: 'Open day follow-up calls are needed that day; please choose another date.' } : approvedLead,
      managerDecision: p.stage === 'approved' ? { by: 'u-manager', at: at(Math.min(p.from, 0) - 6), approved: true, note: '' } : null,
      cancelledAt: null,
    }
    db.leaveRequests.push(req)
    const draft: { date: string; groupId: string; coverPatId: string }[] = []
    for (const [j, s] of sessionsToCover(db, requester.id, start, end).entries()) {
      const forced = j === 0 && p.firstCover
      const cover = forced ?? coverCandidates(db, s, requester.id, draft).find((c) => !c.blocked)?.user.id
      if (!cover) continue
      draft.push({ date: s.date, groupId: s.group.id, coverPatId: cover })
      const pending = p.stage === 'awaiting_cover' && (forced || j === 0)
      const status: CoverSlot['status'] = p.declineFirst && j === 0 ? 'declined' : pending ? 'pending' : 'accepted'
      db.coverSlots.push({
        id: `cs-${db.coverSlots.length + 1}`, leaveId: id, date: s.date, groupId: s.group.id, coverPatId: cover, status,
        respondedAt: status === 'pending' ? null : at(Math.min(p.from, 0) - 9),
        note: status === 'declined' ? 'Sorry, I have a hospital appointment that afternoon.' : '',
      })
    }
    // Requests with no sessions to cover skip straight to approval.
    if (p.stage === 'awaiting_cover' && !db.coverSlots.some((c) => c.leaveId === id)) req.status = statusAfterCover(db, requester)
  })
  return { leaveRequests: db.leaveRequests, coverSlots: db.coverSlots }
}
