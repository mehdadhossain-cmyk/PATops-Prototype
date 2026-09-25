import { Link } from 'react-router-dom'
import { ModuleStatusBadge } from '../components/StatusBadges'
import { Badge, Button, Card, PageHeader, Progress, Stat } from '../components/ui'
import { activeModules, fmtDate, isProfileComplete, moduleDueDate, moduleStatus, progressFor, trainingSummary } from '../data/logic'
import { useDb } from '../store/db'

export function MyTrainingPage() {
  const { db, me } = useDb()
  if (!me) return null
  const profileDone = isProfileComplete(me)
  const summary = trainingSummary(db, me)
  const modules = activeModules(db)
  const now = new Date()

  return (
    <div>
      <PageHeader title="My training" subtitle="Work through each module, confirm you've read it, then pass the short check to complete it." />

      {!profileDone && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-900">
            <strong>Your training is locked.</strong> Please complete your profile first.
          </div>
          <Link to="/profile">
            <Button>Set up profile</Button>
          </Link>
        </div>
      )}

      {summary.complete && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          🎉 <strong>All required training complete.</strong> Your PAT Admins have been notified that you're ready to be allocated to a group.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Progress" value={`${summary.completed}/${summary.required}`} hint={<Progress value={summary.percent} />} />
        <Stat label="Overdue" value={summary.overdue.length} tone={summary.overdue.length ? 'bad' : 'good'} />
        <Stat label="Next due" value={summary.nextDue ? fmtDate(summary.nextDue.due) : '—'} hint={summary.nextDue?.module.title} />
      </div>

      <Card title="Training package">
        <ol className="divide-y divide-slate-100">
          {modules.map((m, i) => {
            const p = progressFor(db, me.id, m.id)
            const status = profileDone ? moduleStatus(p) : 'locked'
            const due = moduleDueDate(me, m)
            const overdue = status !== 'completed' && due < now
            const best = p?.attempts.length ? Math.max(...p.attempts.map((a) => a.score)) : null
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-4 py-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    {!m.required && <Badge>Optional</Badge>}
                  </div>
                  <div className="text-sm text-slate-500">{m.description}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    ~{m.estimatedMinutes} min · due {fmtDate(due)}
                    {m.quiz.length > 0 && ` · ${m.quiz.length}-question check, pass mark ${m.passMark}%`}
                    {best !== null && ` · best score ${best}% (${p!.attempts.length} attempt${p!.attempts.length > 1 ? 's' : ''})`}
                  </div>
                </div>
                <ModuleStatusBadge status={status} overdue={overdue} />
                {status !== 'locked' && (
                  <Link to={`/training/${m.id}`}>
                    <Button variant={status === 'completed' ? 'secondary' : 'primary'}>
                      {status === 'completed' ? 'Review' : status === 'in_progress' ? 'Continue' : 'Start'}
                    </Button>
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
