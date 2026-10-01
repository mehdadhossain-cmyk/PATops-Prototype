import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LevelBadge, RoleBadge, StaffStatusBadge } from '../components/StatusBadges'
import { Avatar, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, Select } from '../components/ui'
import { campusName, creatableRoles, needsTraining, trainingSummary, visibleStaff } from '../data/logic'
import { PAT_LEVEL_LABEL, PAT_LEVELS, ROLE_LABEL, type Role, type StaffStatus } from '../data/types'
import { useDb } from '../store/db'
import { WeekDays } from '../components/WorkPattern'

export function StaffPage() {
  const { db, me } = useDb()
  const [q, setQ] = useState('')
  const [campus, setCampus] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    if (!me) return []
    const qy = q.toLowerCase()
    return visibleStaff(db, me)
      .filter((u) => !qy || u.name.toLowerCase().includes(qy) || u.email.includes(qy))
      .filter((u) => !campus || u.campusId === campus)
      .filter((u) => !role || u.role === role)
      .filter((u) => !status || u.status === status)
      .filter((u) => !level || u.level === level)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db, me, q, campus, role, status, level])

  if (!me) return null
  const manage = creatableRoles(me).length > 0

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle={me.role === 'lead' ? `PAT team at ${campusName(db, me.campusId)}` : `${db.users.length} people across ${db.campuses.length} campuses`}
        actions={manage && <Button onClick={() => setCreating(true)}>+ New staff account</Button>}
      />

      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          {me.role !== 'lead' && (
            <Select value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(['invited', 'onboarding', 'active', 'inactive'] as StaffStatus[]).map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="PAT level">
            <option value="">All PAT levels</option>
            {PAT_LEVELS.map((l) => <option key={l} value={l}>{PAT_LEVEL_LABEL[l]} PATs</option>)}
          </Select>
        </div>

        {rows.length === 0 ? (
          <Empty>No staff match these filters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Campus</th>
                  <th className="py-2 pr-4">Shift / days</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 w-44">Training</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => {
                  const t = needsTraining(u) ? trainingSummary(db, u) : null
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4">
                        <Link to={`/staff/${u.id}`} className="flex items-center gap-2.5">
                          <Avatar name={u.name} size="sm" />
                          <span>
                            <span className="block font-medium text-slate-900 hover:text-brand-600">{u.name}</span>
                            <span className="block text-xs text-slate-500">{u.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4"><span className="inline-flex flex-wrap gap-1"><RoleBadge role={u.role} /><LevelBadge level={u.level} /></span></td>
                      <td className="py-2.5 pr-4">{campusName(db, u.campusId)}</td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {u.shift ? <span className="capitalize">{u.shift}</span> : '—'}
                        {u.workDays.length > 0 && <div className="mt-0.5"><WeekDays workDays={u.workDays} /></div>}
                      </td>
                      <td className="py-2.5 pr-4"><StaffStatusBadge status={u.status} /></td>
                      <td className="py-2.5 pr-4">
                        {t ? (
                          <div>
                            <div className="mb-1 flex justify-between text-xs text-slate-500">
                              <span>{t.completed}/{t.required}</span>
                              {t.overdue.length > 0 && <span className="text-rose-600">{t.overdue.length} overdue</span>}
                            </div>
                            <Progress value={t.percent} />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">n/a</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewStaffModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function NewStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, me, createStaff } = useDb()
  const navigate = useNavigate()
  const roles = me ? creatableRoles(me) : []
  const empty = { name: '', email: '', role: 'pat' as Role, campusId: db.campuses[0]?.id ?? '', startDate: new Date().toISOString().slice(0, 10) }
  const [f, setF] = useState(empty)
  const [touched, setTouched] = useState(false)

  const emailTaken = db.users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())
  const errors = {
    name: !f.name.trim() ? 'Required' : '',
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? 'Enter a valid email' : emailTaken ? 'An account with this email already exists' : '',
    startDate: !f.startDate ? 'Required' : '',
  }
  const campusRequired = f.role === 'pat' || f.role === 'lead'

  return (
    <Modal open={open} title="Create staff account" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (Object.values(errors).some(Boolean)) return
          const u = createStaff({
            name: f.name.trim(),
            email: f.email.trim().toLowerCase(),
            role: f.role,
            campusId: campusRequired ? f.campusId : null,
            startDate: f.startDate,
          })
          setF(empty)
          setTouched(false)
          onClose()
          navigate(`/staff/${u.id}`)
        }}
      >
        <p className="text-sm text-slate-500">
          The new joiner receives an invite (simulated), sets up their profile on first sign-in, and their training package is assigned automatically. New PATs start as Trainee; set their working pattern on their staff page.
        </p>
        <Field label="Full name" error={touched ? errors.name : undefined}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Work email" error={touched ? errors.email : undefined}>
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.ac.uk" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Start date" error={touched ? errors.startDate : undefined} hint={f.role === 'pat' ? 'Training due dates and the 4-month probation count from this' : 'Training due dates count from this'}>
            <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </Field>
        </div>
        {campusRequired && (
          <Field label="Campus">
            <Select value={f.campusId} onChange={(e) => setF({ ...f, campusId: e.target.value })}>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create account</Button>
        </div>
      </form>
    </Modal>
  )
}
