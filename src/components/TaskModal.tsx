import { useState } from 'react'
import { campusName, seesAllCampuses, visibleStaff } from '../data/logic'
import type { AssignedTask, User } from '../data/types'
import { useDb } from '../store/db'
import { Button, ConfirmButton, Field, Input, Modal, Select, Tabs, Textarea } from './ui'

/** Create or edit a personal reminder or an assigned task. */
export function TaskModal({ personal, task, onClose }: { personal: boolean; task?: AssignedTask; onClose: () => void }) {
  const { db, me, createTask, updateTask, deleteTask } = useDb()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [due, setDue] = useState(task?.dueDate ?? '')
  const [audience, setAudience] = useState<'all' | 'campus' | 'people'>(task ? 'people' : me!.role === 'lead' ? 'campus' : 'all')
  const [campus, setCampus] = useState(me!.campusId ?? db.campuses[0].id)
  const [people, setPeople] = useState<string[]>(task && !task.personal ? task.assigneeIds : [])
  const [error, setError] = useState('')
  const pats = visibleStaff(db, me!).filter((u) => (u.role === 'pat' || u.role === 'lead') && u.status !== 'inactive' && u.id !== me!.id)
  // Keep anyone already on the task in the list, even if they're no longer visible or active.
  const choosable = [...pats, ...(task?.assigneeIds ?? []).map((id) => db.users.find((u) => u.id === id)).filter((u): u is User => !!u && !pats.includes(u) && !task?.personal)]
  const assignees = personal ? [me!.id] : audience === 'all' ? pats.filter((u) => u.role === 'pat').map((u) => u.id) : audience === 'campus' ? pats.filter((u) => u.role === 'pat' && u.campusId === campus).map((u) => u.id) : people
  const doneBy = task ? task.completions.filter((c) => !assignees.includes(c.userId)).length : 0

  return (
    <Modal open title={task ? (personal ? 'Edit reminder' : 'Edit assigned task') : personal ? 'Personal reminder' : 'Assign a task'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim().length < 3) return setError('Give the task a title')
          if (assignees.length === 0) return setError('Choose who should do it')
          const input = { title: title.trim(), description: description.trim(), dueDate: due || null, assigneeIds: assignees }
          if (task) updateTask(task.id, input)
          else createTask({ ...input, personal })
          onClose()
        }}
      >
        <Field label="Task"><Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={personal ? 'e.g. Call the registry about enrolment letters' : 'e.g. Complete the Prevent refresher'} autoFocus /></Field>
        <Field label={personal ? 'Notes (optional)' : 'Details (optional)'}><Textarea id="task-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Due date (optional)"><Input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        {!personal && (
          <Field label="Who" group>
            <div className="space-y-2">
              <Tabs
                value={audience}
                onChange={setAudience}
                options={[
                  ...(seesAllCampuses(me!.role) ? [{ value: 'all' as const, label: 'All PATs' }] : []),
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
                <>
                  <div className="flex gap-3 text-xs">
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => setPeople(choosable.map((u) => u.id))}>Select all</button>
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => setPeople([])}>Clear</button>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                    {choosable.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={people.includes(u.id)} onChange={() => setPeople(people.includes(u.id) ? people.filter((x) => x !== u.id) : [...people, u.id])} />
                        {u.name} <span className="text-xs text-slate-400">{campusName(db, u.campusId)}</span>
                        {task?.completions.some((c) => c.userId === u.id) && <span className="text-xs text-emerald-600">done</span>}
                      </label>
                    ))}
                  </div>
                </>
              )}
              <p className="text-xs text-slate-500">
                {assignees.length} {assignees.length === 1 ? 'person' : 'people'} will see this in their tasks.
                {doneBy > 0 && <span className="text-amber-700"> {doneBy} who already completed it will be removed.</span>}
              </p>
            </div>
          </Field>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {task && <ConfirmButton label={personal ? 'Delete reminder' : 'Delete task'} confirmLabel={personal ? 'Delete this reminder?' : `Delete for all ${task.assigneeIds.length}?`} yesLabel="Delete" variant="secondary" onConfirm={() => { deleteTask(task.id); onClose() }} />}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit">{task ? 'Save changes' : personal ? 'Add reminder' : 'Assign task'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
