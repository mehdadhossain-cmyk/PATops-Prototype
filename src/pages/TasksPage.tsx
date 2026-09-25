import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TaskList } from '../components/TaskList'
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, Select, Stat, Tabs, Textarea, cx } from '../components/ui'
import { campusName, fmtDate, fmtDateTime, visibleStaff } from '../data/logic'
import { bucketOf, SOURCE_LABEL, sortTasks, tasksFor, type TaskSource } from '../data/tasks'
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
  const canAssign = me.role !== 'pat'

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
              {t.personal && <button className="text-xs text-rose-600 hover:underline" onClick={() => deleteTask(t.id)}>Delete</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function AssignedByMe() {
  const { db, me, deleteTask } = useDb()
  const [open, setOpen] = useState<string | null>(null)
  const mine = db.assignedTasks.filter((t) => !t.personal && (t.createdBy === me!.id || me!.role === 'manager' || me!.role === 'admin')).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
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
                <Button variant="ghost" className="text-xs" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Hide' : 'Who’s done it?'}</Button>
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
                  {t.createdBy === me!.id && <button className="mt-3 text-xs text-rose-600 hover:underline" onClick={() => deleteTask(t.id)}>Delete this task</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function TaskModal({ personal, onClose }: { personal: boolean; onClose: () => void }) {
  const { db, me, createTask } = useDb()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState('')
  const [audience, setAudience] = useState<'all' | 'campus' | 'people'>(me!.role === 'lead' ? 'campus' : 'all')
  const [campus, setCampus] = useState(me!.campusId ?? db.campuses[0].id)
  const [people, setPeople] = useState<string[]>([])
  const [error, setError] = useState('')
  const pats = visibleStaff(db, me!).filter((u) => (u.role === 'pat' || u.role === 'lead') && u.status !== 'inactive' && u.id !== me!.id)
  const assignees = personal ? [me!.id] : audience === 'all' ? pats.filter((u) => u.role === 'pat').map((u) => u.id) : audience === 'campus' ? pats.filter((u) => u.role === 'pat' && u.campusId === campus).map((u) => u.id) : people

  return (
    <Modal open title={personal ? 'Personal reminder' : 'Assign a task'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim().length < 3) return setError('Give the task a title')
          if (assignees.length === 0) return setError('Choose who should do it')
          createTask({ title: title.trim(), description: description.trim(), dueDate: due || null, assigneeIds: assignees, personal })
          onClose()
        }}
      >
        <Field label="Task"><Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={personal ? 'e.g. Call the registry about enrolment letters' : 'e.g. Complete the Prevent refresher'} autoFocus /></Field>
        {!personal && <Field label="Details (optional)"><Textarea id="task-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>}
        <Field label="Due date (optional)"><Input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        {!personal && (
          <Field label="Who" group>
            <div className="space-y-2">
              <Tabs
                value={audience}
                onChange={setAudience}
                options={[
                  ...(me!.role !== 'lead' ? [{ value: 'all' as const, label: 'All PATs' }] : []),
                  { value: 'campus' as const, label: 'A campus' },
                  { value: 'people' as const, label: 'Choose people' },
                ]}
              />
              {audience === 'campus' && me!.role !== 'lead' && (
                <Select id="task-campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
                  {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
              {audience === 'people' && (
                <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                  {pats.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={people.includes(u.id)} onChange={() => setPeople(people.includes(u.id) ? people.filter((x) => x !== u.id) : [...people, u.id])} />
                      {u.name} <span className="text-xs text-slate-400">{campusName(db, u.campusId)}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500">{assignees.length} {assignees.length === 1 ? 'person' : 'people'} will see this in their tasks.</p>
            </div>
          </Field>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{personal ? 'Add reminder' : 'Assign task'}</Button>
        </div>
      </form>
    </Modal>
  )
}
