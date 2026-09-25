import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CommEntry, LogContactModal, Toast } from '../components/Comms'
import { CaseActionButtons } from '../components/Wellbeing'
import { Sparkline } from '../components/AttendanceChart'
import { AttendanceValue, StageBadge } from '../components/Risk'
import { NO_ACTION_DAYS, RISK_THRESHOLD, riskRows } from '../data/risk'
import { openPeriods, progress, visibleNonSubmissions } from '../data/submissions'
import { LSA_DUE_SOON_DAYS, lsaStatus, visibleLsas } from '../data/lsa'
import { canDecide, weekdayOf } from '../data/leave'
import { fmtRange, LeaveStatusBadge } from '../components/Leave'
import { LEAVE_TYPE_LABEL } from '../data/types'
import { caseActions, casePatId, compliance, visibleCases } from '../data/wellbeing'
import { studentName } from '../data/logic'
import { StaffStatusBadge } from '../components/StatusBadges'
import { Button, Card, Empty, PageHeader, Progress, Stat, cx } from '../components/ui'
import { activeModules, campusName, CONTACT_GAP_DAYS, openFollowUps, patCommStats, courseName, fmtDate, fmtSchedule, groupStudents, intakeLabel, isProfileComplete, moduleDueDate, needsTraining, PAT_STUDENT_CAP, patGroups, patStudentCount, progressFor, trainingSummary, visibleGroups, visibleStaff } from '../data/logic'
import type { User } from '../data/types'
import { useDb } from '../store/db'

export function DashboardPage() {
  const { me } = useDb()
  if (!me) return null
  return me.role === 'pat' ? <PatDashboard me={me} /> : <TeamDashboard me={me} />
}

function PatDashboard({ me }: { me: User }) {
  const { db } = useDb()
  const profileDone = isProfileComplete(me)
  const t = trainingSummary(db, me)
  const now = new Date()
  const first = me.name.split(' ')[0]

  const steps = [
    { label: 'Account created by PAT Admin', done: true },
    { label: 'Set up your profile', done: profileDone, to: '/profile' },
    { label: `Complete your training (${t.completed}/${t.required})`, done: t.complete, to: '/training' },
    { label: 'Get allocated to a student group', done: me.status === 'active' },
  ]

  const todo = activeModules(db)
    .filter((m) => m.required && !progressFor(db, me.id, m.id)?.completedAt)
    .map((m) => ({ m, due: moduleDueDate(me, m) }))
    .sort((a, b) => +a.due - +b.due)

  return (
    <div>
      <PageHeader title={`Hello, ${first}`} subtitle={me.status === 'active' ? 'Here is what needs your attention today.' : 'Welcome to the UKMC PAT team! Here is your onboarding journey.'} />

      {me.status !== 'active' && (
        <Card title="Your onboarding journey" className="mb-6">
          <ol className="space-y-3">
            {steps.map((s, i) => {
              const current = !s.done && steps.slice(0, i).every((x) => x.done)
              return (
                <li key={s.label} className="flex items-center gap-3">
                  <span
                    className={cx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                      s.done ? 'bg-emerald-500 text-white' : current ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {s.done ? '✓' : i + 1}
                  </span>
                  <span className={cx('flex-1 text-sm', s.done && 'text-slate-400 line-through', current && 'font-medium')}>{s.label}</span>
                  {current && s.to && <Link to={s.to}><Button>Go</Button></Link>}
                  {current && !s.to && <span className="text-sm text-slate-500">Your PAT Admins will allocate you shortly</span>}
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="My tasks" actions={<Link to="/training" className="text-sm text-brand-600 hover:underline">All training</Link>}>
          {!profileDone ? (
            <Empty>Complete your profile to see your tasks.</Empty>
          ) : todo.length === 0 ? (
            <Empty>You're all caught up. ✓</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todo.map(({ m, due }) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link to={`/training/${m.id}`} className="hover:text-brand-600">Training: {m.title}</Link>
                  <span className={cx('whitespace-nowrap text-xs', due < now ? 'font-medium text-rose-600' : 'text-slate-500')}>
                    {due < now ? 'Overdue · ' : 'Due '}{fmtDate(due)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <MyGroupsCard me={me} />
        {me.status === 'active' && <LeaveCard me={me} />}
        {me.status === 'active' && <NonSubmissionCard me={me} />}
        {me.status === 'active' && <LsaCard me={me} />}
        {me.status === 'active' && <AtRiskCard me={me} />}
        {me.status === 'active' && <WellbeingCard me={me} />}
        {me.status === 'active' && <CallLogCard me={me} />}
        <Card title="Coming in the next steps" className="lg:col-span-2">
          <p className="text-sm text-slate-500">
            This dashboard will also show at-risk students, wellbeing meetings due, non-submission follow-ups, LSAs and leave requests awaiting your cover response.
          </p>
        </Card>
      </div>
    </div>
  )
}

function CallLogCard({ me }: { me: User }) {
  const { db } = useDb()
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const stats = patCommStats(db, me.id)
  const due = openFollowUps(db.comms.filter((c) => c.authorId === me.id)).filter((f) => f.due.getTime() <= Date.now() + 86400000)

  return (
    <Card
      title="Call log"
      className="lg:col-span-2"
      actions={
        <div className="flex gap-2">
          <Link to="/call-log"><Button variant="secondary">Open call log</Button></Link>
          <Button onClick={() => setLogging(true)}>+ Log contact</Button>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Reached · {CONTACT_GAP_DAYS} days</div>
          <div className={cx('text-xl font-semibold', stats.coverage >= 70 ? 'text-emerald-600' : stats.coverage >= 40 ? 'text-amber-600' : 'text-rose-600')}>{stats.coverage}%</div>
          <div className="text-xs text-slate-500">{stats.students - stats.reached30} students still to reach</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Contacts this week</div>
          <div className="text-xl font-semibold">{stats.contacts7}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Follow-ups due</div>
          <div className={cx('text-xl font-semibold', due.some((f) => f.overdue) && 'text-rose-600')}>{due.length}</div>
          <div className="text-xs text-slate-500">{due.filter((f) => f.overdue).length} overdue</div>
        </div>
      </div>
      {due.length > 0 ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {due.slice(0, 5).map((f) => <CommEntry key={f.log.id} c={f.log} showAuthor={false} />)}
        </ul>
      ) : (
        <Empty>No follow-ups due today. ✓</Empty>
      )}
      <LogContactModal key={String(logging)} open={logging} onClose={(msg) => { setLogging(false); if (msg) setToast(msg) }} />
      <Toast message={toast} onDone={clearToast} />
    </Card>
  )
}

function MyGroupsCard({ me }: { me: User }) {
  const { db } = useDb()
  const groups = patGroups(db, me.id)
  const total = patStudentCount(db, me.id)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3)
  return (
    <Card title={`My groups · ${total} students`} actions={<Link to="/groups" className="text-sm text-brand-600 hover:underline">All groups</Link>}>
      {groups.length === 0 ? (
        <Empty>No groups yet. You'll see them here once a PAT Admin allocates you.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <Link to={`/groups/${g.id}`} className="font-mono font-medium text-brand-700 hover:underline">{g.code}</Link>
                <div className="text-xs text-slate-500">{courseName(db, g.courseId)}</div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div className={cx(g.classDays.some((d) => d === today) && 'font-medium text-emerald-700')}>{fmtSchedule(g)}{g.classDays.some((d) => d === today) && ' · today'}</div>
                <div>{groupStudents(db, g.id).length} students</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TeamDashboard({ me }: { me: User }) {
  const { db } = useDb()
  const staff = visibleStaff(db, me)
  const trainees = staff.filter((u) => needsTraining(u) && u.status !== 'inactive')
  const newJoiners = trainees.filter((u) => u.status === 'invited' || u.status === 'onboarding')
  const withOverdue = trainees.map((u) => ({ u, t: trainingSummary(db, u) })).filter(({ t }) => t.overdue.length > 0)
  const ready = newJoiners.filter((u) => trainingSummary(db, u).complete)
  const groups = visibleGroups(db, me)
  const noPat = groups.filter((g) => !g.patId)
  const planningIntakes = db.intakes.filter((i) => i.status === 'planning')
  const pats = staff.filter((u) => u.role === 'pat' && u.status === 'active')
  const overCap = pats.filter((u) => patStudentCount(db, u.id) > PAT_STUDENT_CAP)
  const first = me.name.split(' ')[0]

  return (
    <div>
      <PageHeader title={`Hello, ${first}`} subtitle={me.role === 'lead' ? `${campusName(db, me.campusId)} campus overview` : 'PAT team overview across all campuses'} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active PATs" value={staff.filter((u) => u.role === 'pat' && u.status === 'active').length} />
        <Stat label="New joiners onboarding" value={newJoiners.length} tone={newJoiners.length ? 'warn' : 'default'} />
        <Stat label="Overdue training" value={withOverdue.length} tone={withOverdue.length ? 'bad' : 'good'} hint="Staff with at least one overdue module" />
        <Stat label="Ready for allocation" value={ready.length} tone={ready.length ? 'good' : 'default'} hint="Training complete, awaiting a group" />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card title="Groups needing a PAT" actions={<Link to="/groups?pat=none" className="text-sm text-brand-600 hover:underline">View all</Link>}>
          {noPat.length === 0 ? (
            <Empty>Every group has a PAT. ✓</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...new Set(noPat.map((g) => g.intakeId))].map((iid) => {
                const n = noPat.filter((g) => g.intakeId === iid).length
                return (
                  <li key={iid} className="flex items-center justify-between">
                    <Link to={`/groups?intake=${iid}&pat=none`} className="hover:text-brand-600">{intakeLabel(db, iid)}</Link>
                    <span className="font-medium text-amber-700 tabular-nums">{n} group{n === 1 ? '' : 's'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {planningIntakes.length > 0 && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              In planning: {planningIntakes.map((i) => `${intakeLabel(db, i.id)} (starts ${fmtDate(i.startDate)})`).join(', ')}
            </p>
          )}
        </Card>
        <Card title="PAT workload">
          <ul className="divide-y divide-slate-100 text-sm">
            {[...pats].sort((a, b) => patStudentCount(db, b.id) - patStudentCount(db, a.id)).slice(0, 6).map((u) => {
              const n = patStudentCount(db, u.id)
              return (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  <Link to={`/staff/${u.id}`} className="w-40 truncate hover:text-brand-600">{u.name}</Link>
                  <div className="flex-1"><Progress value={(n / PAT_STUDENT_CAP) * 100} tone={n > PAT_STUDENT_CAP ? 'bad' : n > PAT_STUDENT_CAP * 0.9 ? 'warn' : 'good'} /></div>
                  <span className="w-20 text-right text-xs tabular-nums text-slate-500">{n} / {PAT_STUDENT_CAP}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-500">{overCap.length ? `${overCap.length} PAT(s) over the ${PAT_STUDENT_CAP}-student limit` : `Highest workloads shown. No one is over the ${PAT_STUDENT_CAP}-student limit.`}</p>
        </Card>
      </div>

      <LeaveApprovalsCard me={me} />
      <div className="mb-5">
        <TeamReachCard me={me} />
      </div>
      <div className="mb-5">
        <TeamAtRiskCard me={me} />
      </div>
      <div className="mb-5">
        <TeamNonSubmissionCard me={me} />
      </div>
      <div className="mb-5">
        <LsaCard me={me} />
      </div>
      <div className="mb-5">
        <TeamWellbeingCard me={me} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="New joiners" actions={<Link to="/training-tracker" className="text-sm text-brand-600 hover:underline">Training tracker</Link>}>
          {newJoiners.length === 0 ? (
            <Empty>No one is onboarding right now.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {newJoiners.map((u) => {
                const t = trainingSummary(db, u)
                return (
                  <li key={u.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/staff/${u.id}`} className="text-sm font-medium hover:text-brand-600">{u.name}</Link>
                      <div className="text-xs text-slate-500">{campusName(db, u.campusId)} · started {fmtDate(u.startDate)}</div>
                    </div>
                    <StaffStatusBadge status={u.status} />
                    <div className="w-28">
                      <div className="mb-1 text-right text-xs text-slate-500">{t.completed}/{t.required}</div>
                      <Progress value={t.percent} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card title="Overdue training">
          {withOverdue.length === 0 ? (
            <Empty>Nothing overdue. ✓</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {withOverdue.map(({ u, t }) => (
                <li key={u.id} className="py-2.5 text-sm">
                  <Link to={`/staff/${u.id}`} className="font-medium hover:text-brand-600">{u.name}</Link>
                  <div className="text-xs text-rose-600">{t.overdue.map((m) => m.title).join(', ')}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function TeamReachCard({ me }: { me: User }) {
  const { db } = useDb()
  const pats = visibleStaff(db, me).filter((u) => u.role === 'pat' && u.status === 'active')
  const rows = pats.map((u) => ({ u, s: patCommStats(db, u.id) })).sort((a, b) => a.s.coverage - b.s.coverage)
  const students = rows.reduce((n, r) => n + r.s.students, 0)
  const reached = rows.reduce((n, r) => n + r.s.reached30, 0)
  return (
    <Card title={`Students reached in the last ${CONTACT_GAP_DAYS} days · ${students ? Math.round((reached / students) * 100) : 0}%`} actions={<Link to="/call-log" className="text-sm text-brand-600 hover:underline">All call logs</Link>}>
      <p className="mb-3 text-sm text-slate-500">PATs with the lowest share of students reached:</p>
      <ul className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
        {rows.slice(0, 6).map(({ u, s }) => (
          <li key={u.id} className="flex items-center gap-3">
            <Link to={`/call-log?pat=${u.id}`} className="w-40 truncate hover:text-brand-600">{u.name}</Link>
            <div className="flex-1"><Progress value={s.coverage} tone={s.coverage >= 70 ? 'good' : s.coverage >= 40 ? 'warn' : 'bad'} /></div>
            <span className="w-24 text-right text-xs tabular-nums text-slate-500">{s.coverage}% · {s.reached30}/{s.students}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function WellbeingCard({ me }: { me: User }) {
  const { db } = useDb()
  const cases = visibleCases(db, me)
  const actions = cases
    .flatMap((c) => caseActions(c, db.wellbeingMeetings))
    .filter((a) => a.kind !== 'awaiting_decision')
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || +a.date - +b.date)
  const comp = compliance(cases, db.wellbeingMeetings)
  return (
    <Card
      title={`Wellbeing · ${comp.activePlans} student${comp.activePlans === 1 ? '' : 's'} on a plan`}
      className="lg:col-span-2"
      actions={<Link to="/wellbeing" className="text-sm text-brand-600 hover:underline">Open wellbeing</Link>}
    >
      {actions.length === 0 ? (
        <Empty>No wellbeing actions due. ✓</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {actions.slice(0, 5).map((a, i) => {
            const s = db.students.find((x) => x.id === a.studentId)!
            const c = db.wellbeingCases.find((x) => x.id === a.caseId)!
            return (
              <li key={`${a.caseId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link>
                  <div className={cx('text-xs', a.urgent ? 'text-rose-600' : 'text-slate-500')}>{a.label}</div>
                </div>
                <CaseActionButtons c={c} compact />
              </li>
            )
          })}
        </ul>
      )}
      {actions.length > 5 && <p className="mt-2 text-xs text-slate-500">+ {actions.length - 5} more on the Wellbeing page</p>}
    </Card>
  )
}

function TeamWellbeingCard({ me }: { me: User }) {
  const { db } = useDb()
  const cases = visibleCases(db, me)
  const comp = compliance(cases, db.wellbeingMeetings)
  const byPat = new Map<string, number>()
  for (const c of cases) {
    const urgent = caseActions(c, db.wellbeingMeetings).filter((a) => a.urgent).length
    const pat = casePatId(db, c)
    if (urgent && pat) byPat.set(pat, (byPat.get(pat) ?? 0) + urgent)
  }
  const worst = [...byPat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  return (
    <Card title={`Wellbeing · ${comp.activePlans} students on a plan`} actions={<Link to="/wellbeing" className="text-sm text-brand-600 hover:underline">Open wellbeing</Link>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Fortnightly meetings held and logged</span><span className="font-medium tabular-nums">{comp.percent}%</span></div>
          <Progress value={comp.percent} tone={comp.percent >= 85 ? 'good' : comp.percent >= 65 ? 'warn' : 'bad'} />
          <p className="mt-2 text-xs text-slate-500">{comp.overdueMeetings} meetings not held · {comp.logsOutstanding} waiting to be logged</p>
        </div>
        <div>
          <div className="mb-1 text-sm">PATs with the most urgent wellbeing actions</div>
          {worst.length === 0 ? (
            <p className="text-sm text-slate-500">None. ✓</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {worst.map(([id, n]) => (
                <li key={id} className="flex justify-between">
                  <Link to={`/staff/${id}`} className="hover:text-brand-600">{db.users.find((u) => u.id === id)?.name}</Link>
                  <span className="text-rose-600 tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}

function AtRiskCard({ me }: { me: User }) {
  const { db } = useDb()
  const { atRisk } = riskRows(db, me)
  const newly = atRisk.filter((r) => r.att.newlyAtRisk).length
  const stale = atRisk.filter((r) => r.noRecentAction).length
  const top = [...atRisk].sort((a, b) => Number(b.noRecentAction) - Number(a.noRecentAction) || (a.att.current ?? 0) - (b.att.current ?? 0)).slice(0, 6)
  return (
    <Card
      title={`At-risk students · ${atRisk.length} below ${RISK_THRESHOLD}%`}
      className="lg:col-span-2"
      actions={<Link to="/at-risk" className="text-sm text-brand-600 hover:underline">All at-risk students</Link>}
    >
      <p className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-amber-700">{newly} newly at risk</span> this week ·{' '}
        <span className={cx(stale > 0 && 'font-medium text-rose-600')}>{stale} with no action in {NO_ACTION_DAYS} days</span>
      </p>
      {top.length === 0 ? (
        <Empty>None of your students are below {RISK_THRESHOLD}%. ✓</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {top.map((r) => (
            <li key={r.student.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <Link to={`/students/${r.student.id}`} className="w-44 truncate font-medium hover:text-brand-600">{studentName(r.student)}</Link>
              <AttendanceValue value={r.att.current} change={r.att.change} />
              <Sparkline history={r.att.history} />
              <StageBadge stage={r.stage} />
              {r.noRecentAction && <span className="text-xs text-rose-600">No action in {NO_ACTION_DAYS}+ days</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TeamAtRiskCard({ me }: { me: User }) {
  const { db } = useDb()
  const { atRisk } = riskRows(db, me)
  const campuses = me.role === 'lead' ? db.campuses.filter((c) => c.id === me.campusId) : db.campuses
  const campusOf = new Map(db.groups.map((g) => [g.id, g.campusId]))
  const activeByCampus = new Map<string, number>()
  for (const s of db.students) if (s.status === 'active') activeByCampus.set(campusOf.get(s.groupId) ?? '', (activeByCampus.get(campusOf.get(s.groupId) ?? '') ?? 0) + 1)
  return (
    <Card title={`At-risk students · ${atRisk.length} below ${RISK_THRESHOLD}%`} actions={<Link to="/at-risk" className="text-sm text-brand-600 hover:underline">All at-risk students</Link>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4">Campus</th>
              <th className="py-2 pr-4 text-right">At risk</th>
              <th className="py-2 pr-4 w-48">Share of active students</th>
              <th className="py-2 pr-4 text-right">Newly at risk</th>
              <th className="py-2 pr-4 text-right">No action {NO_ACTION_DAYS}d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campuses.map((c) => {
              const rows = atRisk.filter((r) => campusOf.get(r.student.groupId) === c.id)
              const active = activeByCampus.get(c.id) ?? 0
              const pct = active ? Math.round((rows.length / active) * 100) : 0
              return (
                <tr key={c.id}>
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{rows.length}</td>
                  <td className="py-2 pr-4"><div className="flex items-center gap-2"><div className="flex-1"><Progress value={pct * 4} tone={pct >= 20 ? 'bad' : pct >= 12 ? 'warn' : 'good'} /></div><span className="w-9 text-right text-xs tabular-nums text-slate-500">{pct}%</span></div></td>
                  <td className="py-2 pr-4 text-right tabular-nums text-amber-700">{rows.filter((r) => r.att.newlyAtRisk).length}</td>
                  <td className={cx('py-2 pr-4 text-right tabular-nums', rows.some((r) => r.noRecentAction) && 'font-medium text-rose-600')}>{rows.filter((r) => r.noRecentAction).length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">The bar is scaled so a full bar means 25% of active students are at risk.</p>
    </Card>
  )
}

function NonSubmissionCard({ me }: { me: User }) {
  const { db } = useDb()
  const periods = openPeriods(db)
    .map((p) => ({ p, items: visibleNonSubmissions(db, me, p.id) }))
    .filter((x) => x.items.length > 0)
  if (periods.length === 0) return null
  return (
    <Card title="Non-submissions to follow up" className="lg:col-span-2" actions={<Link to="/non-submissions" className="text-sm text-brand-600 hover:underline">Open non-submissions</Link>}>
      <ul className="space-y-3">
        {periods.map(({ p, items }) => {
          const prog = progress(items, p)
          return (
            <li key={p.id} className="text-sm">
              <div className="mb-1 flex flex-wrap justify-between gap-2">
                <Link to={`/non-submissions?period=${p.id}`} className="font-medium hover:text-brand-600">{p.name}</Link>
                <span className={cx(prog.notContacted ? 'text-rose-600' : 'text-emerald-700')}>
                  {prog.notContacted ? `${prog.notContacted} not contacted yet · follow up by ${fmtDate(p.followUpBy)}` : 'All followed up ✓'}
                </span>
              </div>
              <Progress value={prog.followedUpPct} tone={prog.followedUpPct >= 90 ? 'good' : prog.followedUpPct >= 60 ? 'warn' : 'bad'} />
              <div className="mt-1 text-xs text-slate-500">{prog.total} missed submissions · {prog.followedUpPct}% followed up · {prog.resolved} resolved</div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function TeamNonSubmissionCard({ me }: { me: User }) {
  const { db } = useDb()
  const periods = openPeriods(db)
  if (periods.length === 0) return null
  return (
    <Card title="Non-submissions" actions={<Link to="/non-submissions" className="text-sm text-brand-600 hover:underline">Open non-submissions</Link>}>
      <ul className="space-y-3">
        {periods.map((p) => {
          const prog = progress(visibleNonSubmissions(db, me, p.id), p)
          return (
            <li key={p.id} className="text-sm">
              <div className="mb-1 flex flex-wrap justify-between gap-2">
                <Link to={`/non-submissions?period=${p.id}`} className="font-medium hover:text-brand-600">{p.name}</Link>
                <span className="text-slate-500">follow up by {fmtDate(p.followUpBy)}</span>
              </div>
              <Progress value={prog.followedUpPct} tone={prog.followedUpPct >= 90 ? 'good' : prog.followedUpPct >= 60 ? 'warn' : 'bad'} />
              <div className="mt-1 text-xs text-slate-500">
                {prog.total} missed · {prog.followedUpPct}% followed up · <span className={cx(prog.notContacted > 0 && 'text-rose-600')}>{prog.notContacted} not contacted</span> · {prog.resolved} resolved
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function LsaCard({ me }: { me: User }) {
  const { db } = useDb()
  const lsas = visibleLsas(db, me)
  if (lsas.length === 0) return null
  const due = lsas
    .filter((l) => ['follow_up_overdue', 'follow_up_due'].includes(lsaStatus(l)))
    .sort((a, b) => (a.nextFollowUp ?? '').localeCompare(b.nextFollowUp ?? ''))
  const active = lsas.filter((l) => lsaStatus(l) !== 'ended').length
  const overdue = due.filter((l) => lsaStatus(l) === 'follow_up_overdue').length
  return (
    <Card
      title={`LSAs · ${active} active`}
      className={me.role === 'pat' ? 'lg:col-span-2' : undefined}
      actions={<Link to="/lsa" className="text-sm text-brand-600 hover:underline">Open LSAs</Link>}
    >
      <p className="mb-2 text-sm text-slate-600">
        <span className={cx(overdue > 0 && 'font-medium text-rose-600')}>{overdue} follow-up{overdue === 1 ? '' : 's'} overdue</span> · {due.length - overdue} due in the next {LSA_DUE_SOON_DAYS} days
      </p>
      {me.role === 'pat' && due.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {due.slice(0, 5).map((l) => {
            const s = db.students.find((x) => x.id === l.studentId)!
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link>
                <span className={cx('text-xs', lsaStatus(l) === 'follow_up_overdue' ? 'text-rose-600' : 'text-amber-700')}>Follow-up {fmtDate(l.nextFollowUp)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function LeaveCard({ me }: { me: User }) {
  const { db } = useDb()
  const today = new Date().toISOString().slice(0, 10)
  const asks = db.coverSlots.filter((c) => c.coverPatId === me.id && c.status === 'pending' && db.leaveRequests.find((r) => r.id === c.leaveId)?.status === 'awaiting_cover')
  const covering = db.coverSlots
    .filter((c) => c.coverPatId === me.id && c.status === 'accepted' && c.date >= today && db.leaveRequests.find((r) => r.id === c.leaveId)?.status === 'approved')
    .sort((a, b) => a.date.localeCompare(b.date))
  const mine = db.leaveRequests.filter((r) => r.requesterId === me.id && (r.status.startsWith('awaiting') || (r.status === 'approved' && r.endDate >= today)))
  if (!asks.length && !covering.length && !mine.length) return null
  return (
    <Card title="Leave and cover" className="lg:col-span-2" actions={<Link to="/leave" className="text-sm text-brand-600 hover:underline">Open leave</Link>}>
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Cover requests for you</div>
          {asks.length === 0 ? <p className="text-sm text-slate-500">None waiting ✓</p> : (
            <ul className="space-y-1 text-sm">
              {asks.map((c) => (
                <li key={c.id}><Link to="/leave" className="font-medium text-amber-700 hover:underline">{weekdayOf(c.date)} {fmtDate(c.date)}</Link> · {db.groups.find((g) => g.id === c.groupId)?.code} for {db.users.find((u) => u.id === db.leaveRequests.find((r) => r.id === c.leaveId)?.requesterId)?.name}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">You're covering</div>
          {covering.length === 0 ? <p className="text-sm text-slate-500">No upcoming cover</p> : (
            <ul className="space-y-1 text-sm">
              {covering.slice(0, 4).map((c) => <li key={c.id}>{weekdayOf(c.date)} {fmtDate(c.date)} · <span className="font-mono text-xs">{db.groups.find((g) => g.id === c.groupId)?.code}</span></li>)}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Your leave</div>
          {mine.length === 0 ? <p className="text-sm text-slate-500">No upcoming leave</p> : (
            <ul className="space-y-1.5 text-sm">
              {mine.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2">{fmtRange(r.startDate, r.endDate)} <LeaveStatusBadge r={r} /></li>)}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}

function LeaveApprovalsCard({ me }: { me: User }) {
  const { db } = useDb()
  const waiting = db.leaveRequests.filter((r) => canDecide(db, me, r))
  if (me.role !== 'lead' && me.role !== 'manager') return null
  return (
    <div className="mb-5">
      <Card title={`Leave waiting for your approval · ${waiting.length}`} actions={<Link to="/leave" className="text-sm text-brand-600 hover:underline">Open leave</Link>}>
        {waiting.length === 0 ? <Empty>Nothing waiting. ✓</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {waiting.map((r) => {
              const slots = db.coverSlots.filter((c) => c.leaveId === r.id)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 py-2">
                  <span className="w-44 font-medium">{db.users.find((u) => u.id === r.requesterId)?.name}</span>
                  <span>{fmtRange(r.startDate, r.endDate)}</span>
                  <span className="text-slate-500">{LEAVE_TYPE_LABEL[r.type]} · {slots.length ? `all ${slots.length} covers accepted` : 'no cover needed'}</span>
                  <span className="ml-auto"><LeaveStatusBadge r={r} /></span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
