// One task list built from every module. Tasks are derived from the underlying records,
// so doing the real work (logging a meeting, recording a follow-up…) clears the task.
import type { AssignedTask, DbState, User } from './types'
import { activeModules, can, CONTACT_GAP_DAYS, fmtDate, isProfileComplete, isTop, lastReachedByStudent, moduleDueDate, needsTraining, openFollowUps, patGroups, progressFor, studentName, trainingSummary, visibleGroups, visibleStaff } from './logic'
import { caseActions, visibleCases } from './wellbeing'
import { NO_ACTION_DAYS, latestWeekEnding, riskRows } from './risk'
import { openPeriods, visibleNonSubmissions } from './submissions'
import { lsaStatus, visibleLsas } from './lsa'
import { canDecide, weekdayOf } from './leave'
import { needsManager, probationRows } from './probation'

export type TaskSource = 'training' | 'profile' | 'call_log' | 'wellbeing' | 'at_risk' | 'non_submission' | 'lsa' | 'leave' | 'assigned' | 'probation' | 'team'

export const SOURCE_LABEL: Record<TaskSource, string> = {
  training: 'Training',
  profile: 'Profile',
  call_log: 'Call log',
  wellbeing: 'Wellbeing',
  at_risk: 'At risk',
  non_submission: 'Non-submissions',
  lsa: 'LSA',
  leave: 'Leave & cover',
  assigned: 'Assigned',
  probation: 'Probation',
  team: 'Team',
}

export interface Task {
  id: string
  source: TaskSource
  title: string
  detail: string
  /** ISO date the task is due; null = no fixed date. */
  due: string | null
  link: string
  /** Set for assigned tasks, which are ticked off directly. */
  assignedTaskId?: string
}

export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'undated'
export const BUCKET_LABEL: Record<Bucket, string> = { overdue: 'Overdue', today: 'Due today', week: 'Next 7 days', later: 'Later', undated: 'No fixed date' }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (date: string, n: number) => iso(new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000))

export function bucketOf(t: Task, today: string): Bucket {
  if (!t.due) return 'undated'
  if (t.due < today) return 'overdue'
  if (t.due === today) return 'today'
  if (t.due <= addDays(today, 7)) return 'week'
  return 'later'
}

export function tasksFor(db: DbState, me: User, now = new Date()): Task[] {
  const today = iso(now)
  const tasks: Task[] = []
  const name = (id: string) => {
    const s = db.students.find((x) => x.id === id)
    return s ? studentName(s) : 'Student'
  }

  // Profile and training (new joiners).
  if (!isProfileComplete(me)) tasks.push({ id: 'profile', source: 'profile', title: 'Complete your profile', detail: 'Needed before your training unlocks', due: today, link: '/profile' })
  else if (needsTraining(me)) {
    for (const m of activeModules(db).filter((x) => x.required && !progressFor(db, me.id, x.id)?.completedAt)) {
      tasks.push({ id: `tr-${m.id}`, source: 'training', title: `Complete training: ${m.title}`, detail: `~${m.estimatedMinutes} min`, due: iso(moduleDueDate(me, m)), link: `/training/${m.id}` })
    }
  }

  // Call log follow-ups I set, and students I haven't reached.
  for (const f of openFollowUps(db.comms.filter((c) => c.authorId === me.id), now)) {
    tasks.push({ id: `fu-${f.log.id}`, source: 'call_log', title: `Follow up with ${f.log.studentId ? name(f.log.studentId) : 'student'}`, detail: f.log.summary, due: f.log.followUpDate, link: f.log.studentId ? `/students/${f.log.studentId}` : '/call-log' })
  }
  if (me.role === 'pat') {
    const groupIds = new Set(patGroups(db, me.id).map((g) => g.id))
    const last = lastReachedByStudent(db.comms.filter((c) => c.authorId === me.id))
    const cutoff = iso(new Date(now.getTime() - CONTACT_GAP_DAYS * 86400000))
    const gap = db.students.filter((s) => s.status === 'active' && groupIds.has(s.groupId) && (last.get(s.id) ?? '') < cutoff).length
    if (gap) tasks.push({ id: 'gap', source: 'call_log', title: `Reach ${gap} student${gap === 1 ? '' : 's'} not contacted in ${CONTACT_GAP_DAYS} days`, detail: 'Open the Not contacted list in your call log', due: null, link: '/call-log' })
  }

  // Wellbeing, attendance risk, non-submissions and LSAs for students I can see (PATs: their own).
  if (me.role === 'pat' || me.role === 'lead') {
    for (const c of visibleCases(db, me)) {
      for (const a of caseActions(c, db.wellbeingMeetings, now)) {
        if (a.kind === 'awaiting_decision') continue
        const due = a.kind === 'meeting_due' ? iso(a.date) : a.kind === 'log_pending' ? addDays(iso(a.date), 2) : today
        tasks.push({ id: `wb-${c.id}-${a.kind}-${iso(a.date)}`, source: 'wellbeing', title: `${name(a.studentId)}: ${a.label}`, detail: '', due: a.urgent ? addDays(today, -1) : due, link: `/students/${a.studentId}` })
      }
    }
    const { atRisk } = riskRows(db, me, now)
    for (const r of atRisk) {
      if (r.att.newlyAtRisk && !r.lastAction) tasks.push({ id: `nr-${r.student.id}`, source: 'at_risk', title: `Contact ${studentName(r.student)}: newly below 65% (${r.att.current}%)`, detail: 'Add a note to their retention history', due: addDays(r.att.weekEnding ?? today, 7), link: `/students/${r.student.id}` })
      else if (r.noRecentAction) tasks.push({ id: `na-${r.student.id}`, source: 'at_risk', title: `${studentName(r.student)}: at risk (${r.att.current}%) with no action in ${NO_ACTION_DAYS} days`, detail: 'Contact the student and update the retention history', due: addDays(today, -1), link: `/students/${r.student.id}` })
    }
    for (const p of openPeriods(db)) {
      const n = visibleNonSubmissions(db, me, p.id).filter((x) => x.status === 'not_contacted').length
      if (n) tasks.push({ id: `ns-${p.id}`, source: 'non_submission', title: `Follow up ${n} non-submission${n === 1 ? '' : 's'}: ${p.name}`, detail: '', due: p.followUpBy, link: `/non-submissions?period=${p.id}` })
    }
    for (const l of visibleLsas(db, me)) {
      const st = lsaStatus(l, today)
      if (st === 'follow_up_overdue' || st === 'follow_up_due') tasks.push({ id: `lsa-${l.id}`, source: 'lsa', title: `LSA follow-up: ${name(l.studentId)}`, detail: l.comments, due: l.nextFollowUp, link: '/lsa' })
    }
  }

  // Leave and cover.
  for (const c of db.coverSlots.filter((x) => x.coverPatId === me.id && x.status === 'pending')) {
    const r = db.leaveRequests.find((x) => x.id === c.leaveId)
    if (r?.status !== 'awaiting_cover') continue
    tasks.push({ id: `cv-${c.id}`, source: 'leave', title: `Reply to cover request: ${weekdayOf(c.date)} ${c.date} for ${db.users.find((u) => u.id === r.requesterId)?.name}`, detail: db.groups.find((g) => g.id === c.groupId)?.code ?? '', due: addDays(c.date, -3) < today ? today : addDays(c.date, -3), link: '/leave' })
  }
  for (const r of db.leaveRequests.filter((x) => x.requesterId === me.id && x.status === 'awaiting_cover')) {
    const declined = db.coverSlots.filter((c) => c.leaveId === r.id && c.status === 'declined').length
    if (declined) tasks.push({ id: `dc-${r.id}`, source: 'leave', title: `Find another cover: ${declined} session${declined === 1 ? '' : 's'} declined`, detail: `Your leave from ${r.startDate}`, due: today, link: '/leave' })
  }
  for (const r of db.leaveRequests.filter((x) => canDecide(db, me, x))) {
    tasks.push({ id: `ap-${r.id}`, source: 'leave', title: `Approve or reject leave: ${db.users.find((u) => u.id === r.requesterId)?.name}`, detail: `${r.startDate} to ${r.endDate}`, due: addDays(r.startDate, -3) < today ? today : addDays(r.startDate, -3), link: '/leave' })
  }

  // Assigned tasks and personal reminders.
  for (const t of db.assignedTasks.filter((x) => x.assigneeIds.includes(me.id) && !x.completions.some((c) => c.userId === me.id))) {
    tasks.push({ id: `as-${t.id}`, source: 'assigned', title: t.title, detail: t.personal ? 'Personal reminder' : `From ${db.users.find((u) => u.id === t.createdBy)?.name}${t.description ? ` · ${t.description}` : ''}`, due: t.dueDate, link: '/tasks', assignedTaskId: t.id })
  }

  // Team-level items for admins, leads and the manager.
  if (me.role !== 'pat') tasks.push(...teamTasks(db, me, now))
  return tasks
}

function teamTasks(db: DbState, me: User, now: Date): Task[] {
  const today = iso(now)
  const out: Task[] = []
  const staff = visibleStaff(db, me)
  if (can(me, 'attendance')) {
    const latest = latestWeekEnding(db)
    const friday = new Date(now)
    friday.setDate(friday.getDate() - ((friday.getDay() + 2) % 7))
    if (!latest || latest < iso(friday)) out.push({ id: 'att-upload', source: 'team', title: `Upload attendance for the week ending ${fmtDate(iso(friday))}`, detail: 'At-risk flags use the latest upload', due: addDays(iso(friday), 3), link: '/attendance' })
  }
  const ready = staff.filter((u) => u.status === 'onboarding' && trainingSummary(db, u).complete)
  if (ready.length && can(me, 'staff')) out.push({ id: 'ready', source: 'team', title: `${ready.length} new joiner${ready.length === 1 ? '' : 's'} finished training: mark active and allocate`, detail: ready.map((u) => u.name).join(', '), due: today, link: '/staff' })
  const overdueTraining = staff.filter((u) => needsTraining(u) && u.status !== 'inactive' && trainingSummary(db, u, now).overdue.length > 0)
  if (overdueTraining.length) out.push({ id: 'tr-overdue', source: 'team', title: `${overdueTraining.length} staff with overdue training`, detail: overdueTraining.map((u) => u.name).join(', '), due: null, link: '/training-tracker' })
  const noPat = visibleGroups(db, me).filter((g) => !g.patId && db.intakes.find((i) => i.id === g.intakeId)?.status !== 'closed')
  if (noPat.length && can(me, 'allocation')) out.push({ id: 'nopat', source: 'team', title: `${noPat.length} group${noPat.length === 1 ? '' : 's'} without a PAT`, detail: '', due: null, link: '/groups?pat=none' })
  if (isTop(me.role)) {
    for (const r of probationRows(db, today).filter(needsManager)) {
      if (r.status === 'awaiting_hr') {
        out.push({ id: `pb-hr-${r.user.id}`, source: 'probation', title: `Confirm ${r.user.name}'s probation outcome to the HR manager`, detail: r.probation.outcome === 'confirmed' ? 'Passed and confirmed' : 'Not passed', due: addDays((r.probation.decidedAt ?? today).slice(0, 10), 2), link: `/probation?open=${r.user.id}` })
      } else {
        out.push({ id: `pb-${r.user.id}`, source: 'probation', title: `Confirm probation: ${r.user.name}`, detail: `${r.daysLeft < 0 ? `Ended ${-r.daysLeft} days ago` : r.daysLeft === 0 ? 'Ends today' : `Ends in ${r.daysLeft} days`} · started ${fmtDate(r.user.startDate)}`, due: r.end, link: `/probation?open=${r.user.id}` })
      }
    }
  }
  for (const t of db.assignedTasks.filter((x) => x.createdBy === me.id && !x.personal)) {
    const open = t.assigneeIds.length - t.completions.length
    if (open > 0 && t.dueDate && t.dueDate < today) out.push({ id: `track-${t.id}`, source: 'team', title: `"${t.title}": ${open} of ${t.assigneeIds.length} not done`, detail: 'Past its due date', due: t.dueDate, link: '/tasks?tab=assigned' })
  }
  return out
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title))
}

/** Who may edit or delete an assigned task or reminder: whoever created it, and the PAT Manager / Master Owner for assigned tasks. */
export function canEditTask(me: User, t: AssignedTask): boolean {
  if (t.personal) return t.createdBy === me.id
  return t.createdBy === me.id || isTop(me.role)
}

/** Who can assign tasks to others. */
export const canAssignTasks = (me: User) => me.role === 'lead' || can(me, 'tasks')
