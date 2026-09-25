import { Link } from 'react-router-dom'
import { fmtDate } from '../data/logic'
import { BUCKET_LABEL, bucketOf, SOURCE_LABEL, type Bucket, type Task, type TaskSource } from '../data/tasks'
import { useDb } from '../store/db'
import { Badge, cx } from './ui'

const sourceTone: Record<TaskSource, 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'purple'> = {
  training: 'purple', profile: 'purple', call_log: 'blue', wellbeing: 'green', at_risk: 'red', non_submission: 'amber', lsa: 'blue', leave: 'slate', assigned: 'purple', team: 'slate',
}

const bucketStyle: Record<Bucket, string> = {
  overdue: 'text-rose-600',
  today: 'text-amber-700',
  week: 'text-slate-700',
  later: 'text-slate-500',
  undated: 'text-slate-500',
}

/** Tasks grouped by when they're due. Assigned tasks can be ticked off here; others link to where the work is done. */
export function TaskList({ tasks, limit, compact }: { tasks: Task[]; limit?: number; compact?: boolean }) {
  const { toggleTaskDone } = useDb()
  const today = new Date().toISOString().slice(0, 10)
  const order: Bucket[] = ['overdue', 'today', 'week', 'later', 'undated']
  let shown = 0
  return (
    <div className="space-y-4">
      {order.map((b) => {
        const list = tasks.filter((t) => bucketOf(t, today) === b)
        if (list.length === 0 || (limit !== undefined && shown >= limit)) return null
        const visible = limit !== undefined ? list.slice(0, limit - shown) : list
        shown += visible.length
        return (
          <section key={b}>
            <h3 className={cx('mb-1 text-xs font-semibold tracking-wide uppercase', bucketStyle[b])}>
              {BUCKET_LABEL[b]} <span className="text-slate-400">({list.length})</span>
            </h3>
            <ul className="divide-y divide-slate-100">
              {visible.map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-2">
                  {t.assignedTaskId ? (
                    <input type="checkbox" aria-label={`Mark "${t.title}" done`} className="mt-1 h-4 w-4 shrink-0" onChange={() => toggleTaskDone(t.assignedTaskId!, true)} />
                  ) : (
                    <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', b === 'overdue' ? 'bg-rose-500' : b === 'today' ? 'bg-amber-400' : 'bg-slate-300')} />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={t.link} className="text-sm font-medium text-slate-800 hover:text-brand-600">{t.title}</Link>
                    {!compact && t.detail && <div className="truncate text-xs text-slate-500">{t.detail}</div>}
                  </div>
                  <Badge tone={sourceTone[t.source]}>{SOURCE_LABEL[t.source]}</Badge>
                  <span className={cx('w-24 shrink-0 text-right text-xs tabular-nums', bucketStyle[b])}>{t.due ? fmtDate(t.due) : '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
