import { Link } from 'react-router-dom'
import { StaffStatusBadge } from '../components/StatusBadges'
import { Button, Card, Empty, PageHeader, Progress, Stat, cx } from '../components/ui'
import { activeModules, campusName, fmtDate, isProfileComplete, moduleDueDate, needsTraining, progressFor, trainingSummary, visibleStaff } from '../data/logic'
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
        <Card title="Coming in the next steps">
          <p className="text-sm text-slate-500">
            This dashboard will also show your groups, at-risk students, wellbeing meetings due, non-submission follow-ups, LSAs and leave requests awaiting your cover response.
          </p>
        </Card>
      </div>
    </div>
  )
}

function TeamDashboard({ me }: { me: User }) {
  const { db } = useDb()
  const staff = visibleStaff(db, me)
  const trainees = staff.filter((u) => needsTraining(u) && u.status !== 'inactive')
  const newJoiners = trainees.filter((u) => u.status === 'invited' || u.status === 'onboarding')
  const withOverdue = trainees.map((u) => ({ u, t: trainingSummary(db, u) })).filter(({ t }) => t.overdue.length > 0)
  const ready = newJoiners.filter((u) => trainingSummary(db, u).complete)
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
