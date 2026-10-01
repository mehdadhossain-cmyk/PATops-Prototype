import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ProbationActions, ProbationBadge, ProbationTimeline } from '../components/Probation'
import { LevelBadge } from '../components/StatusBadges'
import { Card, Empty, PageHeader, Stat, Tabs, cx } from '../components/ui'
import { campusName, fmtDate } from '../data/logic'
import { needsManager, PROBATION_MONTHS, PROBATION_REMIND_DAYS, probationRows, type ProbationRow } from '../data/probation'
import { useDb } from '../store/db'

type Tab = 'action' | 'in_progress' | 'complete'

/** Probation overview for the PAT Manager and the Master Owner. */
export function ProbationPage() {
  const { db } = useDb()
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const rows = probationRows(db).sort((a, b) => a.end.localeCompare(b.end))
  const action = rows.filter(needsManager)
  const progress = rows.filter((r) => r.status === 'in_progress' || r.status === 'not_started')
  const complete = rows.filter((r) => r.status === 'complete').reverse()
  const [tab, setTab] = useState<Tab>(openId && complete.some((r) => r.user.id === openId) ? 'complete' : action.length || !progress.length ? 'action' : 'in_progress')
  const list = tab === 'action' ? action : tab === 'in_progress' ? progress : complete
  const toggle = (id: string) => setParams(openId === id ? {} : { open: id }, { replace: true })

  return (
    <div>
      <PageHeader
        title="Probation"
        subtitle={`Every PAT is on probation for ${PROBATION_MONTHS} months from their start date. You're reminded ${PROBATION_REMIND_DAYS} days before it ends; record your decision, then confirm it to the HR manager.`}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Decision needed" value={rows.filter((r) => r.status === 'awaiting_decision').length} tone={rows.some((r) => r.status === 'awaiting_decision') ? 'bad' : 'good'} hint="Probation has ended" />
        <Stat label={`Ending in ${PROBATION_REMIND_DAYS} days`} value={rows.filter((r) => r.status === 'due_soon').length} tone={rows.some((r) => r.status === 'due_soon') ? 'warn' : 'default'} />
        <Stat label="To confirm to HR" value={rows.filter((r) => r.status === 'awaiting_hr').length} tone={rows.some((r) => r.status === 'awaiting_hr') ? 'warn' : 'good'} />
        <Stat label="In probation" value={progress.length} />
      </div>
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'action', label: `Needs you (${action.length})` }, { value: 'in_progress', label: `In probation (${progress.length})` }, { value: 'complete', label: `Completed (${complete.length})` }]} />
      </div>
      <Card>
        {list.length === 0 ? (
          <Empty>{tab === 'action' ? 'Nothing needs you right now. ✓' : 'No one here.'}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((r) => <ProbationItem key={r.user.id} row={r} open={openId === r.user.id} onToggle={() => toggle(r.user.id)} />)}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ProbationItem({ row, open, onToggle }: { row: ProbationRow; open: boolean; onToggle: () => void }) {
  const { db } = useDb()
  const { user: u, end, daysLeft, status } = row
  const when = status === 'complete' ? `Ended ${fmtDate(end)}` : daysLeft < 0 ? `Ended ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago` : daysLeft === 0 ? 'Ends today' : `Ends in ${daysLeft} days`
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button onClick={onToggle} className="min-w-56 flex-1 text-left">
          <span className="font-medium hover:text-brand-600">{u.name}</span>
          <span className="block text-xs text-slate-500">{campusName(db, u.campusId)} · started {fmtDate(u.startDate)}</span>
        </button>
        <LevelBadge level={u.level} />
        <span className={cx('w-36 text-sm tabular-nums', status === 'awaiting_decision' ? 'font-medium text-rose-600' : status === 'due_soon' ? 'text-amber-700' : 'text-slate-600')}>{when}</span>
        <ProbationBadge status={status} />
        <button onClick={onToggle} className="text-sm text-brand-600 hover:underline">{open ? 'Hide' : status === 'complete' ? 'View' : 'Open'}</button>
      </div>
      {open && (
        <div className="mt-3 space-y-4 rounded-lg bg-slate-50 p-4">
          <ProbationTimeline row={row} />
          <ProbationActions row={row} />
          <Link to={`/staff/${u.id}`} className="inline-block text-sm text-brand-600 hover:underline">Open {u.name.split(' ')[0]}'s staff page (training, call log, notes) →</Link>
        </div>
      )}
    </li>
  )
}
