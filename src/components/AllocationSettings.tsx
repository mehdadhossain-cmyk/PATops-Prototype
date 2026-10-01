import { useState } from 'react'
import { defaultHours, profileFor } from '../data/allocation'
import type { User } from '../data/types'
import { useDb } from '../store/db'
import { Button, Card, Field, Input, Textarea } from './ui'

/** Per-PAT allocation settings (what used to be written in the allocation notes tab). */
export function AllocationSettings({ user, editable }: { user: User; editable: boolean }) {
  const { db, saveAllocationProfile } = useDb()
  const p = profileFor(db, user.id)
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({
    availableFrom: p.availableFrom ?? '',
    maxStudents: p.maxStudents?.toString() ?? '',
    minStudents: p.minStudents?.toString() ?? '',
    targetGroups: p.targetGroups?.toString() ?? '',
    uniTargets: Object.entries(p.uniTargets).map(([k, v]) => `${k} ${v}`).join(', '),
    preferred: p.preferredCampusIds,
    notes: p.notes,
  })
  const [error, setError] = useState('')
  const num = (s: string) => (s.trim() ? Number(s) : null)
  const summary = [
    `Hours ${p.workHours || `${defaultHours(user)} (from shift)`} (see working pattern)`,
    p.availableFrom && `available from ${p.availableFrom}`,
    `max ${p.maxStudents ?? 200} students`,
    p.minStudents && `at least ${p.minStudents} students`,
    p.targetGroups && `target ${p.targetGroups} groups`,
    Object.keys(p.uniTargets).length && `mix ${Object.entries(p.uniTargets).map(([k, v]) => `${v} ${k}`).join(' + ')}`,
    p.preferredCampusIds.length && `also ${p.preferredCampusIds.map((id) => db.campuses.find((c) => c.id === id)?.name).join(', ')}`,
  ].filter(Boolean)

  return (
    <Card title="Allocation settings" actions={editable && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}>
      {!editing ? (
        <div className="text-sm text-slate-600">
          <p>{summary.join(' · ')}</p>
          {p.notes && <p className="mt-1 text-slate-500">{p.notes}</p>}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const targets: Record<string, number> = {}
            for (const part of f.uniTargets.split(',').map((x) => x.trim()).filter(Boolean)) {
              const m = part.match(/^([A-Za-z]+)\s*[:x ]?\s*(\d+)$/)
              if (!m) return setError(`Can't read "${part}"; use e.g. "CCCU 2, UOW 1"`)
              targets[m[1].toUpperCase()] = Number(m[2])
            }
            saveAllocationProfile({
              userId: user.id, workHours: p.workHours, availableFrom: f.availableFrom || null, maxStudents: num(f.maxStudents), minStudents: num(f.minStudents),
              targetGroups: num(f.targetGroups), uniTargets: targets, preferredCampusIds: f.preferred, notes: f.notes.trim(),
            })
            setEditing(false)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Available from"><Input id="ap-from" type="date" value={f.availableFrom} onChange={(e) => setF({ ...f, availableFrom: e.target.value })} /></Field>
            <Field label="Target groups"><Input id="ap-target" type="number" min={0} value={f.targetGroups} onChange={(e) => setF({ ...f, targetGroups: e.target.value })} /></Field>
            <Field label="Max students" hint="Blank = 200"><Input id="ap-max" type="number" min={0} value={f.maxStudents} onChange={(e) => setF({ ...f, maxStudents: e.target.value })} /></Field>
            <Field label="Min students"><Input id="ap-min" type="number" min={0} value={f.minStudents} onChange={(e) => setF({ ...f, minStudents: e.target.value })} /></Field>
            <Field label="University mix" hint="e.g. CCCU 2, UOW 1"><Input id="ap-mix" value={f.uniTargets} onChange={(e) => setF({ ...f, uniTargets: e.target.value })} /></Field>
          </div>
          <Field label="Can also work at" group>
            <div className="flex flex-wrap gap-3">
              {db.campuses.filter((c) => c.id !== user.campusId).map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={f.preferred.includes(c.id)} onChange={() => setF({ ...f, preferred: f.preferred.includes(c.id) ? f.preferred.filter((x) => x !== c.id) : [...f.preferred, c.id] })} />
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Notes"><Textarea id="ap-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2"><Button type="submit">Save</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      )}
    </Card>
  )
}
