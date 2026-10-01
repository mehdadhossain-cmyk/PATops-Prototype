import { useState } from 'react'
import { defaultHours, parseHours, profileFor } from '../data/allocation'
import { WEEKDAYS, type Shift, type User, type Weekday } from '../data/types'
import { useDb } from '../store/db'
import { Button, Card, Field, Input, cx } from './ui'

/** Days of the week with days off in red. */
export function WeekDays({ workDays }: { workDays: Weekday[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {WEEKDAYS.map((d) => (
        <span key={d} title={workDays.includes(d) ? 'Working day' : 'Day off'} className={cx('rounded px-1.5 py-0.5 text-xs font-medium', workDays.includes(d) ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-700 line-through')}>
          {d}
        </span>
      ))}
    </span>
  )
}

/**
 * Shift, working days and hours. PATs can't change their own; only people the
 * PAT Manager or Master Owner has given "Working days & hours" access can.
 */
export function WorkPatternCard({ user, editable }: { user: User; editable: boolean }) {
  const { db, saveWorkPattern } = useDb()
  const prof = profileFor(db, user.id)
  const [editing, setEditing] = useState(false)
  const [shift, setShift] = useState<Shift | null>(user.shift)
  const [days, setDays] = useState<Weekday[]>(user.workDays)
  const [hours, setHours] = useState(prof.workHours ?? '')
  const [error, setError] = useState('')
  const toggle = (d: Weekday) => setDays(days.includes(d) ? days.filter((x) => x !== d) : WEEKDAYS.filter((w) => w === d || days.includes(w)))
  const set = !!user.shift || user.workDays.length > 0

  return (
    <Card title="Working pattern" actions={editable && !editing && <Button variant="secondary" onClick={() => { setShift(user.shift); setDays(user.workDays); setHours(prof.workHours ?? ''); setEditing(true) }}>{set ? 'Edit' : 'Set pattern'}</Button>}>
      {!editing ? (
        set ? (
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><dt className="w-24 text-slate-500">Shift</dt><dd className="capitalize">{user.shift ?? '—'}</dd></div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><dt className="w-24 text-slate-500">Days</dt><dd><WeekDays workDays={user.workDays} /></dd></div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><dt className="w-24 text-slate-500">Hours</dt><dd>{prof.workHours || (user.shift ? `${defaultHours(user)} (from shift)` : '—')}</dd></div>
            {!editable && <p className="pt-1 text-xs text-slate-500">Set by the PAT Admins. Contact them if it needs to change.</p>}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{editable ? 'No working pattern yet. Set it so this person can be allocated groups.' : 'Not set yet. The PAT Admins will add your shift, working days and hours.'}</p>
        )
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!shift) return setError('Choose a shift')
            if (days.length === 0) return setError('Choose at least one working day')
            if (hours.trim() && !parseHours(hours)) return setError('Working hours look like 09:00-17:00')
            saveWorkPattern(user.id, { shift, workDays: days, workHours: hours.trim() || null })
            setEditing(false)
            setError('')
          }}
        >
          <Field group label="Shift">
            <div className="flex gap-2">
              {(['morning', 'evening'] as Shift[]).map((s) => (
                <button type="button" key={s} onClick={() => setShift(s)} className={cx('rounded-lg border px-4 py-2 text-sm capitalize', shift === s ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 hover:bg-slate-50')}>{s}</button>
              ))}
            </div>
          </Field>
          <Field group label="Working days" hint="Days not selected are days off.">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button type="button" key={d} aria-pressed={days.includes(d)} onClick={() => toggle(d)} className={cx('w-14 rounded-lg border py-2 text-sm', days.includes(d) ? 'border-brand-600 bg-brand-600 text-white' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100')}>{d}</button>
              ))}
            </div>
          </Field>
          <Field label="Working hours" hint={shift ? `Blank = ${defaultHours({ ...user, shift })} from the ${shift} shift` : undefined}>
            <Input id="wp-hours" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="09:00-17:00" className="max-w-48" />
          </Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2"><Button type="submit">Save</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      )}
    </Card>
  )
}
