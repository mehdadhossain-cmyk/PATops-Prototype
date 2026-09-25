import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CommEntry, LogContactModal, Toast } from '../components/Comms'
import { CaseActionButtons } from '../components/Wellbeing'
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

      <div className="mb-5">
        <TeamReachCard me={me} />
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
