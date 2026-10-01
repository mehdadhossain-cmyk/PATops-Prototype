import { useState } from 'react'
import { groupSessions, scheduleFields } from '../data/allocation'
import { intakeLabel } from '../data/logic'
import { SLOTS, SLOT_LABEL, WEEKDAYS, type ClassSession, type Group, type Slot, type Weekday } from '../data/types'
import { useDb } from '../store/db'
import { Button, Field, Input, Modal, Select, cx } from './ui'

/** Create a group on an intake, or edit one. The PAT is set from the group page or the allocation board. */
export function GroupModal({ group, intakeId, onClose, onSaved }: { group?: Group; intakeId?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const { db, saveGroup } = useDb()
  const firstIntake = intakeId ?? db.intakes.find((i) => i.status !== 'closed')?.id ?? db.intakes[0]?.id ?? ''
  const [f, setF] = useState({
    code: group?.code ?? '',
    intakeId: group?.intakeId ?? firstIntake,
    courseId: group?.courseId ?? '',
    campusId: group?.campusId ?? db.campuses[0]?.id ?? '',
    room: group?.room ?? '',
    expected: group?.expectedStudents?.toString() ?? '',
  })
  const [sessions, setSessions] = useState<ClassSession[]>(group ? groupSessions(group) : [])
  const [error, setError] = useState('')
  const intake = db.intakes.find((i) => i.id === f.intakeId)
  const courses = db.courses.filter((c) => c.universityId === intake?.universityId)
  const courseId = courses.some((c) => c.id === f.courseId) ? f.courseId : (courses[0]?.id ?? '')
  const has = (d: Weekday, s: Slot) => sessions.some((x) => x.day === d && x.slots.includes(s))
  const toggle = (d: Weekday, s: Slot) => {
    const cur = sessions.find((x) => x.day === d)?.slots ?? []
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
    setSessions([...sessions.filter((x) => x.day !== d), ...(next.length ? [{ day: d, slots: next }] : [])])
    setError('')
  }

  return (
    <Modal open title={group ? `Edit group · ${group.code}` : 'New group'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const code = f.code.trim().toUpperCase()
          if (!code) return setError('Give the group a code')
          if (db.groups.some((g) => g.code.toUpperCase() === code && g.id !== group?.id)) return setError(`There is already a group called ${code}`)
          if (!intake) return setError('Choose an intake')
          if (!courseId) return setError('This intake’s university has no courses yet. Add one in Settings first.')
          if (!f.campusId) return setError('Choose a campus')
          if (sessions.length === 0) return setError('Tick at least one class session')
          const expected = f.expected.trim() ? Number(f.expected) : null
          if (expected !== null && (!Number.isInteger(expected) || expected < 0)) return setError('Expected students must be a whole number')
          const sched = scheduleFields(sessions)
          // The sheet's original "Group Day" text no longer describes the group once its sessions change.
          const sameSessions = group && JSON.stringify(scheduleFields(groupSessions(group)).sessions) === JSON.stringify(sched.sessions)
          const saved: Group = {
            ...(group ?? { id: `g-${Date.now().toString(36)}`, patId: null }),
            ...sched,
            code,
            intakeId: intake.id,
            courseId,
            campusId: f.campusId,
            room: f.room.trim() || undefined,
            expectedStudents: expected,
            rawDays: sameSessions ? group?.rawDays : undefined,
          }
          saveGroup(saved)
          onSaved?.(saved.id)
          onClose()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Group code" hint="e.g. UOW-BM-JAN27-A"><Input id="group-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoFocus /></Field>
          <Field label="Intake">
            <Select id="group-intake" value={f.intakeId} onChange={(e) => setF({ ...f, intakeId: e.target.value })}>
              {db.intakes.map((i) => <option key={i.id} value={i.id}>{intakeLabel(db, i.id)}{i.status === 'closed' ? ' (closed)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Course">
            <Select id="group-course" value={courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
              {courses.length === 0 && <option value="">No courses for this university</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Campus">
            <Select id="group-campus" value={f.campusId} onChange={(e) => setF({ ...f, campusId: e.target.value })}>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Room (optional)"><Input id="group-room" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
          <Field label="Expected students (optional)" hint="Used for allocation until students are imported"><Input id="group-expected" type="number" min={0} value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} /></Field>
        </div>
        <Field label="Class sessions" group hint="Morning 09:00–13:00 · Afternoon 13:00–17:00 · Evening 17:00–21:00">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr><th />{WEEKDAYS.map((d) => <th key={d} className="px-1 pb-1 text-xs font-medium text-slate-500">{d}</th>)}</tr>
              </thead>
              <tbody>
                {SLOTS.map((s) => (
                  <tr key={s}>
                    <td className="pr-2 text-xs text-slate-500">{SLOT_LABEL[s]}</td>
                    {WEEKDAYS.map((d) => (
                      <td key={d} className="p-0.5">
                        <button type="button" aria-pressed={has(d, s)} aria-label={`${d} ${SLOT_LABEL[s]}`} onClick={() => toggle(d, s)} className={cx('h-8 w-11 rounded-md border text-xs', has(d, s) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-300 hover:bg-slate-50')}>
                          {has(d, s) ? '✓' : ''}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Field>
        {group?.rawDays && <p className="text-xs text-slate-500">Allocation sheet text: “{group.rawDays}”. It's dropped if you change the sessions.</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{group ? 'Save group' : 'Create group'}</Button>
        </div>
      </form>
    </Modal>
  )
}
