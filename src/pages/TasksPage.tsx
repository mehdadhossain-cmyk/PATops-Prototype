import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TaskList } from '../components/TaskList'
import { TaskModal } from '../components/TaskModal'
import { Badge, Button, Card, ConfirmButton, Empty, PageHeader, Progress, Stat, Tabs, cx } from '../components/ui'
import { campusName, can, fmtDate, fmtDateTime } from '../data/logic'
import type { AssignedTask } from '../data/types'
import { bucketOf, canAssignTasks, canEditTask, sortTasks, SOURCE_LABEL, tasksFor, type TaskSource } from '../data/tasks'
import { useDb } from '../store/db'

type Tab = 'mine' | 'assigned' | 'done'

export function TasksPage() {
  const { db, me } = useDb()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'mine'
  const [source, setSource] = useState<TaskSource | ''>('')
  const [modal, setModal] = useState<'personal' | 'assign' | null>(null)
  const tasks = useMemo(() => (me ? sortTasks(tasksFor(db, me)) : []), [db, me])
  if (!me) return null
  const today = new Date().toISOString().slice(0, 10)
  const count = (b: string) => tasks.filter((t) => bucketOf(t, today) === b).length
  const sources = [...new Set(tasks.map((t) => t.source))]
  const canAssign = canAssignTasks(me)

  return (
    <div>
      <PageHeader
        title="My tasks"
        subtitle="Everything you need to do, from every part of PATops. Most tasks clear themselves when you do the work; assigned tasks and reminders are ticked off here."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('personal')}>+ Personal reminder</Button>
            {canAssign && <Button onClick={() => setModal('assign')}>+ Assign a task</Button>}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Overdue" value={count('overdue')} tone={count('overdue') ? 'bad' : 'good'} />
        <Stat label="Due today" value={count('today')} tone={count('today') ? 'warn' : 'default'} />
        <Stat label="Next 7 days" value={count('week')} />
        <Stat label="All open tasks" value={tasks.length} />
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(t) => setParams(t === 'mine' ? {} : { tab: t })}
          options={[
            { value: 'mine', label: 'To do' },
            { value: 'done', label: 'Done' },
            ...(canAssign ? [{ value: 'assigned' as Tab, label: 'Assigned by me' }] : []),
          ]}
        />
      </div>

      {tab === 'mine' && (
        <Card>
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={() => setSource('')} className={cx('rounded-full border px-3 py-1 text-sm', !source ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}>All ({tasks.length})</button>
            {sources.map((s) => (
              <button key={s} onClick={() => setSource(s)} className={cx('rounded-full border px-3 py-1 text-sm', source === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}>
                {SOURCE_LABEL[s]} ({tasks.filter((t) => t.source === s).length})
              </button>
            ))}
          </div>
          {tasks.length === 0 ? <Empty>You're all caught up. ✓</Empty> : <TaskList tasks={tasks.filter((t) => !source || t.source === source)} />}
        </Card>
      )}
      {tab === 'done' && <DoneList />}
      {tab === 'assigned' && <AssignedByMe />}

      {modal && <TaskModal personal={modal === 'personal'} onClose={() => setModal(null)} />}
    </div>
  )
}

function DoneList() {
  const { db, me, toggleTaskDone, deleteTask } = useDb()
  const [editing, setEditing] = useState<AssignedTask | null>(null)
  const done = db.assignedTasks
    .filter((t) => t.assigneeIds.includes(me!.id) && t.completions.some((c) => c.userId === me!.id))
    .sort((a, b) => (b.completions.find((c) => c.userId === me!.id)!.at).localeCompare(a.completions.find((c) => c.userId === me!.id)!.at))
  return (
    <Card title="Completed assigned tasks and reminders">
      {done.length === 0 ? (
        <Empty>Nothing completed yet. Other tasks disappear from your list as soon as the work is done.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {done.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked aria-label="Mark not done" onChange={() => toggleTaskDone(t.id, false)} />
              <span className="flex-1 text-slate-500 line-through">{t.title}</span>
              <span className="text-xs text-slate-400">Done {fmtDateTime(t.completions.find((c) => c.userId === me!.id)!.at)}</span>
              {canEditTask(me!, t) && <button className="text-xs text-brand-600 hover:underline" onClick={() => setEditing(t)}>Edit</button>}
              {t.personal && <button className="text-xs text-rose-600 hover:underline" onClick={() => deleteTask(t.id)}>Delete</button>}
            </li>
          ))}
        </ul>
      )}
      {editing && <TaskModal key={editing.id} personal={editing.personal} task={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function AssignedByMe() {
  const { db, me, deleteTask } = useDb()
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<AssignedTask | null>(null)
  const mine = db.assignedTasks.filter((t) => !t.personal && (t.createdBy === me!.id || can(me!, 'tasks'))).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  const today = new Date().toISOString().slice(0, 10)
  if (mine.length === 0) return <Card><Empty>You haven't assigned any tasks yet.</Empty></Card>
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {mine.map((t) => {
          const pct = Math.round((t.completions.length / t.assigneeIds.length) * 100)
          const late = t.dueDate && t.dueDate < today && pct < 100
          return (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-64 flex-1">
                  <button onClick={() => setOpen(open === t.id ? null : t.id)} className="text-left font-medium hover:text-brand-600">{t.title}</button>
                  <div className="text-xs text-slate-500">
                    By {db.users.find((u) => u.id === t.createdBy)?.name} · {t.assigneeIds.length} people · {t.dueDate ? <span className={cx(late && 'font-medium text-rose-600')}>due {fmtDate(t.dueDate)}</span> : 'no due date'}
                  </div>
                </div>
                <div className="w-56">
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{t.completions.length} of {t.assigneeIds.length} done</span><span>{pct}%</span></div>
                  <Progress value={pct} tone={pct === 100 ? 'good' : late ? 'bad' : 'warn'} />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" className="text-xs" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Hide' : 'Who’s done it?'}</Button>
                  {canEditTask(me!, t) && (
                    <>
                      <Button variant="secondary" className="text-xs" onClick={() => setEditing(t)}>Edit</Button>
                      <ConfirmButton label="Delete" confirmLabel={`Delete for all ${t.assigneeIds.length}?`} yesLabel="Delete" variant="secondary" onConfirm={() => deleteTask(t.id)} />
                    </>
                  )}
                </div>
              </div>
              {open === t.id && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  {t.description && <p className="mb-2 text-sm text-slate-600">{t.description}</p>}
                  <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {t.assigneeIds.map((id) => {
                      const u = db.users.find((x) => x.id === id)
                      const c = t.completions.find((x) => x.userId === id)
                      return (
                        <div key={id} className="flex items-center justify-between gap-2">
                          <span>{u?.name} <span className="text-xs text-slate-400">{campusName(db, u?.campusId ?? null)}</span></span>
                          {c ? <Badge tone="green">Done {fmtDate(c.at)}</Badge> : <Badge tone={late ? 'red' : 'amber'}>Not yet</Badge>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {editing && <TaskModal key={editing.id} personal={false} task={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}
