import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GroupModal } from '../components/GroupModal'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from '../components/ui'
import { can, fmtDate, visibleGroups } from '../data/logic'
import type { Intake, IntakeStatus } from '../data/types'
import { useDb } from '../store/db'

const statusTone = { planning: 'purple', active: 'green', closed: 'slate' } as const

export function IntakesPage() {
  const { db, me } = useDb()
  const [editing, setEditing] = useState<Intake | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const navigate = useNavigate()
  if (!me) return null
  const manage = can(me, 'academic')
  const groups = visibleGroups(db, me)
  const studentsByGroup = new Map<string, number>()
  for (const s of db.students) if (s.status === 'active') studentsByGroup.set(s.groupId, (studentsByGroup.get(s.groupId) ?? 0) + 1)

  return (
    <div>
      <PageHeader
        title="Intakes"
        subtitle="Each partner university's cohort starts. Open an intake to see its groups."
        actions={
          manage && (
            <Button
              onClick={() =>
                setEditing({ id: `in-${Date.now()}`, universityId: db.universities[0].id, name: '', startDate: '', endDate: '', status: 'planning' })
              }
            >
              + New intake
            </Button>
          )
        }
      />
      <div className="space-y-5">
        {db.universities.map((uni) => {
          const intakes = db.intakes.filter((i) => i.universityId === uni.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
          return (
            <Card key={uni.id} title={uni.name}>
              {intakes.length === 0 ? (
                <p className="text-sm text-slate-500">No intakes yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="py-2 pr-4">Intake</th>
                        <th className="py-2 pr-4">Starts</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4 text-right">Groups</th>
                        <th className="py-2 pr-4 text-right">Students</th>
                        <th className="py-2 pr-4 text-right">Groups without PAT</th>
                        {manage && <th />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {intakes.map((i) => {
                        const gs = groups.filter((g) => g.intakeId === i.id)
                        const students = gs.reduce((n, g) => n + (studentsByGroup.get(g.id) ?? 0), 0)
                        const noPat = gs.filter((g) => !g.patId).length
                        return (
                          <tr key={i.id} className="hover:bg-slate-50">
                            <td className="py-2.5 pr-4">
                              <Link to={`/groups?intake=${i.id}`} className="font-medium hover:text-brand-600">{i.name}</Link>
                            </td>
                            <td className="py-2.5 pr-4 text-slate-600">{fmtDate(i.startDate)}</td>
                            <td className="py-2.5 pr-4"><Badge tone={statusTone[i.status]}>{i.status}</Badge></td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">{gs.length}</td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">{students}</td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">
                              {noPat ? <Link to={`/groups?intake=${i.id}&pat=none`} className="font-medium text-amber-700 hover:underline">{noPat}</Link> : <span className="text-slate-400">0</span>}
                            </td>
                            {manage && (
                              <td className="py-2.5 text-right">
                                <span className="inline-flex gap-1">
                                  <Button variant="ghost" onClick={() => setAddingTo(i.id)}>+ Group</Button>
                                  <Button variant="ghost" onClick={() => setEditing(i)}>Edit</Button>
                                </span>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {editing && <IntakeModal key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      {addingTo && <GroupModal intakeId={addingTo} onClose={() => setAddingTo(null)} onSaved={(id) => navigate(`/groups/${id}`)} />}
    </div>
  )
}

function IntakeModal({ initial, onClose }: { initial: Intake; onClose: () => void }) {
  const { db, saveIntake } = useDb()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const isNew = !db.intakes.some((i) => i.id === initial.id)

  return (
    <Modal open title={isNew ? 'New intake' : `Edit intake · ${initial.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim() || !f.startDate) return setError('Name and start date are required')
          if (f.endDate && f.endDate <= f.startDate) return setError('End date must be after the start date')
          saveIntake({ ...f, name: f.name.trim() })
          onClose()
        }}
      >
        <Field label="Partner university">
          <Select id="intake-uni" value={f.universityId} onChange={(e) => setF({ ...f, universityId: e.target.value })} disabled={!isNew}>
            {db.universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Intake name" hint='For example "January 2027"'>
          <Input id="intake-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date"><Input id="intake-start" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="Expected end date"><Input id="intake-end" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
        <Field label="Status" hint="Planning: groups are being set up. Active: teaching has started.">
          <Select id="intake-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as IntakeStatus })}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save intake</Button>
        </div>
      </form>
    </Modal>
  )
}
