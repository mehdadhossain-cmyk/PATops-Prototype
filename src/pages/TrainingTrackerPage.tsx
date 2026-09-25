import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StaffStatusBadge } from '../components/StatusBadges'
import { Button, Card, Empty, PageHeader, Progress, Select, Stat, cx } from '../components/ui'
import { activeModules, campusName, moduleDueDate, needsTraining, progressFor, trainingSummary, visibleStaff } from '../data/logic'
import { downloadCsv } from '../lib/csv'
import { useDb } from '../store/db'

type Filter = 'all' | 'incomplete' | 'overdue'

export function TrainingTrackerPage() {
  const { db, me } = useDb()
  const [campus, setCampus] = useState('')
  const [filter, setFilter] = useState<Filter>('incomplete')

  const modules = activeModules(db)
  const now = new Date()

  const rows = useMemo(() => {
    if (!me) return []
    return visibleStaff(db, me)
      .filter((u) => needsTraining(u) && u.status !== 'inactive')
      .filter((u) => !campus || u.campusId === campus)
      .map((u) => ({ u, t: trainingSummary(db, u) }))
      .filter(({ t }) => (filter === 'all' ? true : filter === 'overdue' ? t.overdue.length > 0 : !t.complete))
      .sort((a, b) => b.t.overdue.length - a.t.overdue.length || a.t.percent - b.t.percent)
  }, [db, me, campus, filter])

  if (!me) return null

  const everyone = visibleStaff(db, me).filter((u) => needsTraining(u) && u.status !== 'inactive')
  const summaries = everyone.map((u) => trainingSummary(db, u))
  const inTraining = summaries.filter((s) => !s.complete).length
  const overdue = summaries.filter((s) => s.overdue.length > 0).length
  const awaitingProfile = everyone.filter((u) => u.status === 'invited').length

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Campus', 'Status', 'Completed', 'Required', 'Overdue', ...modules.map((m) => m.title)]
    const lines = rows.map(({ u, t }) => [
      u.name, u.email, campusName(db, u.campusId), u.status, t.completed, t.required, t.overdue.length,
      ...modules.map((m) => {
        const p = progressFor(db, u.id, m.id)
        return p?.completedAt ? `Completed ${p.completedAt.slice(0, 10)}` : p?.startedAt ? 'In progress' : 'Not started'
      }),
    ])
    downloadCsv(`training-tracker-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...lines])
  }

  return (
    <div>
      <PageHeader
        title="Training tracker"
        subtitle="Who has completed which module, and who is falling behind."
        actions={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="In training" value={inTraining} hint="Required modules not all complete" />
        <Stat label="With overdue modules" value={overdue} tone={overdue ? 'bad' : 'good'} />
        <Stat label="Awaiting profile setup" value={awaitingProfile} tone={awaitingProfile ? 'warn' : 'default'} hint="Invited but not yet signed in" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          {me.role !== 'lead' && (
            <Select value={campus} onChange={(e) => setCampus(e.target.value)} className="max-w-xs">
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
            {(['incomplete', 'overdue', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cx('rounded-md px-3 py-1.5 text-sm capitalize', filter === f ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty>Nobody matches this filter. Everyone is up to date. ✓</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium uppercase tracking-wide">Staff</th>
                  <th className="py-2 pr-4 font-medium uppercase tracking-wide w-36">Progress</th>
                  {modules.map((m, i) => (
                    <th key={m.id} className="px-1 py-2 text-center font-medium" title={m.title}>
                      M{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ u, t }) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <Link to={`/staff/${u.id}`} className="font-medium hover:text-brand-600">{u.name}</Link>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {campusName(db, u.campusId)} <StaffStatusBadge status={u.status} />
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="mb-1 text-xs text-slate-500">{t.completed}/{t.required}</div>
                      <Progress value={t.percent} />
                    </td>
                    {modules.map((m) => {
                      const p = progressFor(db, u.id, m.id)
                      const late = !p?.completedAt && moduleDueDate(u, m) < now
                      const failed = p?.attempts.some((a) => !a.passed)
                      const [sym, cls, label] = p?.completedAt
                        ? ['✓', 'bg-emerald-100 text-emerald-700', 'Completed']
                        : late
                          ? ['!', 'bg-rose-100 text-rose-700', 'Overdue']
                          : p?.startedAt
                            ? ['…', 'bg-amber-100 text-amber-700', 'In progress']
                            : ['', 'bg-slate-100 text-slate-400', 'Not started']
                      return (
                        <td key={m.id} className="px-1 py-2 text-center">
                          <span
                            title={`${m.title}: ${label}${failed ? ' (had a failed attempt)' : ''}`}
                            className={cx('relative inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold', cls)}
                          >
                            {sym}
                            {failed && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          {modules.map((m, i) => <span key={m.id}><strong>M{i + 1}</strong> {m.title}</span>)}
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />had a failed quiz attempt</span>
        </div>
      </Card>
    </div>
  )
}
