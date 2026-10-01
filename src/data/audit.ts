// One-click audit pack for a member of staff: everything PATops holds about their work,
// as sections that render both as a printable report and as spreadsheet tabs.
import { activeModules, campusName, channelsLabel, courseName, fmtDate, fmtStamp, fmtSchedule, intakeLabel, patGroups, patCommStats, progressFor, studentName, trainingSummary, userName } from './logic'
import { lsaStatus } from './lsa'
import { casePatId, planCycles } from './wellbeing'
import { attendanceSummary } from './risk'
import { leaveDaysTaken, slotsFor, workingDays } from './leave'
import { FOLLOW_UP_LABEL, PAT_LEVEL_LABEL, LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, OUTCOME_LABEL, REASON_LABEL, ROLE_LABEL, STAGE_LABEL, WELLBEING_CATEGORY_LABEL, type DbState, type User } from './types'

export interface AuditRange {
  from: string | null // ISO date, inclusive
  to: string | null
}

export interface AuditSection {
  id: string
  title: string
  description: string
  columns: string[]
  rows: (string | number | null)[][]
}

export interface AuditPack {
  person: User
  generatedAt: string
  generatedBy: string
  range: AuditRange
  facts: [string, string][]
  summary: { label: string; value: string }[]
  sections: AuditSection[]
}

const inRange = (iso: string | null | undefined, r: AuditRange) => {
  if (!iso) return !r.from && !r.to
  const d = iso.slice(0, 10)
  return (!r.from || d >= r.from) && (!r.to || d <= r.to)
}
const yesNo = (b: boolean) => (b ? 'Yes' : 'No')

export function buildAuditPack(db: DbState, userId: string, range: AuditRange, generatedBy: string, now = new Date()): AuditPack {
  const u = db.users.find((x) => x.id === userId)!
  const student = (id: string | null) => db.students.find((s) => s.id === id)
  const sName = (id: string | null) => {
    const s = student(id)
    return s ? studentName(s) : ''
  }
  const groupCode = (id: string | undefined) => db.groups.find((g) => g.id === id)?.code ?? ''
  const myGroups = patGroups(db, u.id)
  const myGroupIds = new Set(myGroups.map((g) => g.id))
  const myStudentIds = new Set(db.students.filter((s) => myGroupIds.has(s.groupId)).map((s) => s.id))
  const sections: AuditSection[] = []

  // Profile and training.
  const t = trainingSummary(db, u, now)
  sections.push({
    id: 'training',
    title: 'Training record',
    description: 'Onboarding modules: when the material was confirmed as read, every quiz attempt and completion.',
    columns: ['Module', 'Required', 'Started', 'Confirmed read', 'Quiz attempts (score %)', 'Completed'],
    rows: activeModules(db).map((m) => {
      const p = progressFor(db, u.id, m.id)
      return [m.title, yesNo(m.required), fmtStamp(p?.startedAt), fmtStamp(p?.acknowledgedAt), p?.attempts.map((a) => `${fmtDate(a.at)}: ${a.score}%${a.passed ? ' (pass)' : ''}`).join('; ') ?? '', fmtStamp(p?.completedAt)]
    }),
  })

  // Groups and caseload (current).
  sections.push({
    id: 'groups',
    title: 'Groups (current)',
    description: 'Groups this person is PAT for at the time of export.',
    columns: ['Group', 'Course', 'Intake', 'Campus', 'Classes', 'Active students'],
    rows: myGroups.map((g) => [g.code, courseName(db, g.courseId), intakeLabel(db, g.intakeId), campusName(db, g.campusId), fmtSchedule(g), db.students.filter((s) => s.groupId === g.id && s.status === 'active').length]),
  })

  // Call log (authored by the person).
  const comms = db.comms.filter((c) => c.authorId === u.id && inRange(c.at, range)).sort((a, b) => a.at.localeCompare(b.at))
  sections.push({
    id: 'call-log',
    title: 'Call log',
    description: 'Every contact and announcement this person logged. Entries marked as entered in error are included with the reason.',
    columns: ['Date/time', 'Type', 'Student', 'EBS person code', 'Groups', 'Channel', 'Direction', 'Outcome', 'Reason', 'Summary', 'Follow-up date', 'Follow-up done', 'Logged at', 'Entered in error'],
    rows: comms.map((c) => [
      fmtStamp(c.at), c.kind === 'announcement' ? 'Announcement' : 'Contact', sName(c.studentId), student(c.studentId)?.ebsPersonCode ?? '',
      c.groupIds.map((g) => groupCode(g)).join(' '), channelsLabel(c), c.kind === 'announcement' ? '' : c.direction, c.kind === 'announcement' ? '' : OUTCOME_LABEL[c.outcome],
      c.kind === 'announcement' ? '' : REASON_LABEL[c.reason], c.summary, c.followUpDate ? fmtDate(c.followUpDate) : '', c.followUpDoneAt ? fmtDate(c.followUpDoneAt) : '', fmtStamp(c.loggedAt), c.voidedAt ? `Yes: ${c.voidReason}` : '',
    ]),
  })

  // Wellbeing (cases for the person's students; meetings they recorded).
  const cases = db.wellbeingCases.filter((c) => casePatId(db, c) === u.id || c.formSentBy === u.id)
  sections.push({
    id: 'wellbeing',
    title: 'Wellbeing',
    description: 'Wellbeing referrals and fortnightly meetings. Only the broad category is held in PATops; details are in the wellbeing team’s system.',
    columns: ['Student', 'Category', 'Status', 'Form sent', 'Form returned', 'Decision', 'Plan start', 'Closed', 'Fortnight', 'Due', 'Meeting held', 'Outcome', 'Recorded on Teams', 'Logged in wellbeing system'],
    rows: cases.flatMap((c) => {
      const head = [sName(c.studentId), WELLBEING_CATEGORY_LABEL[c.category], c.status.replace('_', ' '), fmtDate(c.formSentAt), fmtDate(c.submittedAt), c.decisionAt ? `${c.status === 'declined' ? 'Declined' : 'Approved'} ${fmtDate(c.decisionAt)}` : '', fmtDate(c.planStart), fmtDate(c.closedAt)]
      const cycles = planCycles(c, db.wellbeingMeetings, now).filter((cy) => inRange(cy.meeting?.heldAt ?? cy.due.toISOString(), range))
      if (cycles.length === 0) return inRange(c.formSentAt, range) || !range.from ? [[...head, '', '', '', '', '', '']] : []
      return cycles.map((cy) => [...head, cy.index + 1, fmtDate(cy.due), fmtStamp(cy.meeting?.heldAt), cy.meeting ? (cy.meeting.outcome === 'held' ? 'Held' : 'Student did not attend') : cy.status === 'overdue' ? 'Not held' : 'Not yet due', cy.meeting ? yesNo(cy.meeting.recorded) : '', cy.meeting?.loggedAt ? fmtDate(cy.meeting.loggedAt) : cy.meeting ? 'Not logged' : ''])
    }),
  })

  // At-risk retention history.
  const notes = db.riskNotes.filter((n) => (n.authorId === u.id || myStudentIds.has(n.studentId)) && inRange(n.at, range)).sort((a, b) => a.at.localeCompare(b.at))
  sections.push({
    id: 'retention',
    title: 'At-risk retention notes',
    description: 'Retention notes written by this person, and by admins about this person’s students, with the student’s current attendance.',
    columns: ['Date/time', 'Student', 'EBS person code', 'Written by', 'Stage set', 'Note', 'Current attendance %'],
    rows: notes.map((n) => [fmtStamp(n.at), sName(n.studentId), student(n.studentId)?.ebsPersonCode ?? '', userName(db, n.authorId), n.stage ? STAGE_LABEL[n.stage] : '', n.text, attendanceSummary(db, n.studentId).current ?? '']),
  })

  // Non-submissions.
  const ns = db.nonSubmissions.filter((n) => (myStudentIds.has(n.studentId) || n.updatedBy === u.id) && (inRange(n.updatedAt, range) || inRange(db.submissionPeriods.find((p) => p.id === n.periodId)?.deadline, range)))
  sections.push({
    id: 'non-submissions',
    title: 'Non-submission follow-ups',
    description: 'Missed assessments for this person’s students and the follow-up recorded.',
    columns: ['Submission period', 'Deadline', 'Student', 'EBS person code', 'Assessment', 'Status', 'Note', 'Expected date', 'Updated', 'Updated by'],
    rows: ns.map((n) => {
      const p = db.submissionPeriods.find((x) => x.id === n.periodId)
      return [p?.name ?? '', fmtDate(p?.deadline), sName(n.studentId), student(n.studentId)?.ebsPersonCode ?? '', n.assessment, FOLLOW_UP_LABEL[n.status], n.note, fmtDate(n.expectedDate), fmtStamp(n.updatedAt), userName(db, n.updatedBy)]
    }),
  })

  // LSAs.
  const lsas = db.lsas.filter((l) => myStudentIds.has(l.studentId) || l.createdBy === u.id)
  const lsaChanges = db.lsaUpdates.filter((x) => lsas.some((l) => l.id === x.lsaId) && inRange(x.at, range)).sort((a, b) => a.at.localeCompare(b.at))
  sections.push({
    id: 'lsa',
    title: 'LSAs',
    description: 'Learning support agreements for this person’s students (current values), followed by every change in the period.',
    columns: ['Student ID', 'Student name', 'LSA start', 'LSA end', 'Next follow-up', 'Status', 'Comments'],
    rows: lsas.filter((l) => inRange(l.startDate, range) || lsaChanges.some((x) => x.lsaId === l.id) || !range.from).map((l) => {
      const s = student(l.studentId)
      return [s?.uniStudentId ?? '', sName(l.studentId), fmtDate(l.startDate), fmtDate(l.endDate), fmtDate(l.nextFollowUp), lsaStatus(l, now.toISOString().slice(0, 10)).replace(/_/g, ' '), l.comments]
    }),
  })
  sections.push({
    id: 'lsa-history',
    title: 'LSA change history',
    description: 'Every recorded change to those LSAs.',
    columns: ['Date/time', 'Student', 'Change', 'By'],
    rows: lsaChanges.map((x) => [fmtStamp(x.at), sName(lsas.find((l) => l.id === x.lsaId)!.studentId), x.summary, userName(db, x.by)]),
  })

  // Leave and cover.
  const leave = db.leaveRequests.filter((r) => r.requesterId === u.id && (inRange(r.startDate, range) || inRange(r.endDate, range))).sort((a, b) => a.startDate.localeCompare(b.startDate))
  sections.push({
    id: 'leave',
    title: 'Leave requests',
    description: 'Leave requested by this person with cover and approval decisions.',
    columns: ['Type', 'From', 'To', 'Working days', 'Status', 'Covers', 'PAT Lead decision', 'PAT Manager decision', 'Requested'],
    rows: leave.map((r) => [
      LEAVE_TYPE_LABEL[r.type], fmtDate(r.startDate), fmtDate(r.endDate), workingDays(u, r.startDate, r.endDate).length, LEAVE_STATUS_LABEL[r.status],
      slotsFor(db, r.id).map((c) => `${fmtDate(c.date)} ${groupCode(c.groupId)}: ${userName(db, c.coverPatId)} (${c.status})`).join('; '),
      r.leadDecision ? `${r.leadDecision.approved ? 'Approved' : 'Rejected'} by ${userName(db, r.leadDecision.by)} ${fmtDate(r.leadDecision.at)}${r.leadDecision.note ? `: ${r.leadDecision.note}` : ''}` : '',
      r.managerDecision ? `${r.managerDecision.approved ? 'Approved' : 'Rejected'} by ${userName(db, r.managerDecision.by)} ${fmtDate(r.managerDecision.at)}${r.managerDecision.note ? `: ${r.managerDecision.note}` : ''}` : '',
      fmtStamp(r.createdAt),
    ]),
  })
  const covered = db.coverSlots.filter((c) => c.coverPatId === u.id && inRange(c.date, range)).sort((a, b) => a.date.localeCompare(b.date))
  sections.push({
    id: 'cover',
    title: 'Cover provided',
    description: 'Classes this person was asked to cover for colleagues, and their response.',
    columns: ['Date', 'Group', 'For', 'Response', 'Responded', 'Note'],
    rows: covered.map((c) => [fmtDate(c.date), groupCode(c.groupId), userName(db, db.leaveRequests.find((r) => r.id === c.leaveId)?.requesterId ?? null), c.status, fmtStamp(c.respondedAt), c.note]),
  })

  // Assigned tasks.
  const tasks = db.assignedTasks.filter((x) => !x.personal && x.assigneeIds.includes(u.id) && (inRange(x.createdAt, range) || inRange(x.dueDate, range) || !range.from))
  sections.push({
    id: 'tasks',
    title: 'Assigned tasks',
    description: 'Tasks assigned to this person and when they were completed.',
    columns: ['Task', 'Assigned by', 'Assigned', 'Due', 'Completed'],
    rows: tasks.map((x) => {
      const done = x.completions.find((c) => c.userId === u.id)
      return [x.title, userName(db, x.createdBy), fmtDate(x.createdAt), fmtDate(x.dueDate), done ? fmtStamp(done.at) : 'Not completed']
    }),
  })

  // Activity history.
  const events = db.audit.filter((e) => (e.subjectUserId === u.id || e.actorId === u.id) && inRange(e.at, range)).sort((a, b) => a.at.localeCompare(b.at))
  sections.push({
    id: 'activity',
    title: 'Activity history',
    description: 'Every recorded action by or about this person in PATops.',
    columns: ['Date/time', 'Action', 'By'],
    rows: events.map((e) => [fmtStamp(e.at), e.message, userName(db, e.actorId) === 'Unknown' ? 'System' : userName(db, e.actorId)]),
  })

  const stats = patCommStats(db, u.id, now)
  const year = now.getFullYear()
  return {
    person: u,
    generatedAt: now.toISOString(),
    generatedBy,
    range,
    facts: [
      ['Name', u.name],
      ['Role', `${ROLE_LABEL[u.role]}${u.level ? ` (${PAT_LEVEL_LABEL[u.level]})` : ''}`],
      ['Campus', campusName(db, u.campusId)],
      ['Email', u.email],
      ['Status', u.status],
      ['Start date', fmtDate(u.startDate)],
      ['Shift / work days', `${u.shift ?? '—'} · ${u.workDays.join(', ') || '—'}`],
    ],
    summary: [
      { label: 'Training complete', value: `${t.completed}/${t.required}` },
      { label: 'Groups · students', value: `${myGroups.length} · ${stats.students}` },
      { label: 'Call log entries', value: String(comms.length) },
      { label: 'Wellbeing cases', value: String(cases.length) },
      { label: 'Retention notes', value: String(notes.length) },
      { label: 'Non-submissions', value: String(ns.length) },
      { label: 'LSAs', value: String(lsas.length) },
      { label: `Annual leave ${year}`, value: `${leaveDaysTaken(db, u, year)} days` },
    ],
    sections,
  }
}

export const rangeLabel = (r: AuditRange) =>
  !r.from && !r.to ? 'All records' : `${r.from ? fmtDate(r.from) : 'Start'} to ${r.to ? fmtDate(r.to) : 'today'}`

export function auditFileBase(p: AuditPack) {
  return `PATops-audit-${p.person.name.replace(/[^A-Za-z]+/g, '-')}-${p.generatedAt.slice(0, 10)}`
}
