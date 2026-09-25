import { useCallback, useMemo, useState } from 'react'
import { LogContactModal, Toast } from '../components/Comms'
import { Link, useParams } from 'react-router-dom'
import { StudentStatusBadge } from '../components/StatusBadges'
import { Badge, Button, Card, CopyButton, Empty, Field, Input, PageHeader, Select, Tabs } from '../components/ui'
import {
  campusName,
  canManageStudents,
  courseName,
  daysSince,
  fmtDate,
  lastReachedByStudent,
  fmtSchedule,
  groupStudents,
  intakeLabel,
  PAT_STUDENT_CAP,
  patGroups,
  patStudentCount,
  studentName,
  userName,
  visibleGroups,
} from '../data/logic'
import type { Group, User } from '../data/types'
import { downloadCsv } from '../lib/csv'
import { WellbeingBadge } from '../components/Wellbeing'
import { AttendanceValue } from '../components/Risk'
import { attendanceSummary } from '../data/risk'
import { activePlanStudentIds } from '../data/wellbeing'
import { useDb } from '../store/db'

export function GroupDetailPage() {
  const { id } = useParams()
  const { db, me } = useDb()
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'active' | 'all'>('active')
  const [selected, setSelected] = useState<string[]>([])
  const [logging, setLogging] = useState<{ mode: 'individual' | 'announcement'; ids: string[] } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const lastReached = useMemo(() => lastReachedByStudent(db.comms), [db.comms])
  const onPlan = useMemo(() => activePlanStudentIds(db), [db])
  if (!me) return null
  const g = visibleGroups(db, me).find((x) => x.id === id)
  if (!g) return <p>Group not found or not visible to you.</p>

  const all = groupStudents(db, g.id, true)
  const students = all
    .filter((s) => show === 'all' || s.status === 'active')
    .filter((s) => !q || `${studentName(s)} ${s.ebsPersonCode} ${s.uniStudentId}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
  const active = all.filter((s) => s.status === 'active')
  const emails = active.map((s) => s.uniEmail || s.personalEmail).filter(Boolean).join('; ')

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link to="/groups" className="text-brand-600 hover:underline">← {me.role === 'pat' ? 'My groups' : 'Groups'}</Link>
      </div>
      <PageHeader
        title={g.code}
        subtitle={`${courseName(db, g.courseId)} · ${intakeLabel(db, g.intakeId)} · ${campusName(db, g.campusId)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setLogging({ mode: 'announcement', ids: [] })}>📣 Log announcement</Button>
            {active.length > 0 && <CopyButton text={emails} label={`Copy ${active.length} emails`} className="px-3 py-2 text-sm" />}
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv(`${g.code}-students.csv`, [
                  ['Name', 'EBS Person Code', 'Uni Student ID', 'Personal Email', 'Uni Email', 'Phone', 'Emergency Contact', 'Emergency Phone', 'Status'],
                  ...all.map((s) => [studentName(s), s.ebsPersonCode, s.uniStudentId, s.personalEmail, s.uniEmail, s.phone, s.emergencyContactName, s.emergencyContactPhone, s.status]),
                ])
              }
            >
              Export CSV
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card title="Timetable">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Shift</dt><dd><Badge tone={g.shift === 'morning' ? 'amber' : 'purple'}>{g.shift}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Classes</dt><dd>{fmtSchedule(g)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Active students</dt><dd className="tabular-nums">{active.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Inactive</dt><dd className="tabular-nums">{all.length - active.length}</dd></div>
          </dl>
        </Card>
        <PatCard group={g} me={me} />
      </div>

      <Card title={`Students (${students.length})`}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input id="group-student-q" placeholder="Search name or ID…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Tabs value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} />
          {selected.length > 0 && (
            <Button onClick={() => setLogging({ mode: 'individual', ids: selected })}>Log contact for {selected.length} selected</Button>
          )}
        </div>
        {students.length === 0 ? (
          <Empty>No students{q ? ' match your search' : ' in this group yet. PAT Admins add them from Import data'}.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={students.length > 0 && students.every((s) => selected.includes(s.id))}
                      onChange={(e) => setSelected(e.target.checked ? students.map((s) => s.id) : [])}
                    />
                  </th>
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">EBS code</th>
                  <th className="py-2 pr-4">Uni ID</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Emails</th>
                  <th className="py-2 pr-4">Emergency contact</th>
                  <th className="py-2 pr-4">Attendance</th>
                  <th className="py-2 pr-4">Last reached</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-slate-50">
                    <td className="py-2.5 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${studentName(s)}`}
                        checked={selected.includes(s.id)}
                        onChange={() => setSelected(selected.includes(s.id) ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
                      />
                    </td>
                    <td className="py-2.5 pr-4"><Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link>{onPlan.has(s.id) && <span className="ml-2"><WellbeingBadge /></span>}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{s.ebsPersonCode}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs tabular-nums">{s.uniStudentId}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums">{s.phone}</td>
                    <td className="py-2.5 pr-4 text-xs text-slate-600">
                      <div>{s.personalEmail}</div>
                      <div className="text-slate-400">{s.uniEmail}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-600">
                      <div>{s.emergencyContactName || '—'}</div>
                      <div className="tabular-nums text-slate-400">{s.emergencyContactPhone}</div>
                    </td>
                    <td className="py-2.5 pr-4 text-sm">{(() => { const a = attendanceSummary(db, s.id); return <AttendanceValue value={a.current} change={a.change} /> })()}</td>
                    <td className="py-2.5 pr-4 text-xs whitespace-nowrap">
                      {(() => {
                        const at = lastReached.get(s.id)
                        const d = daysSince(at)
                        return at ? <span className={d! > 30 ? 'text-amber-700' : 'text-slate-600'}>{fmtDate(at)}</span> : <span className="text-rose-600">Never</span>
                      })()}
                    </td>
                    <td className="py-2.5 pr-4"><StudentStatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <LogContactModal
        key={logging ? `${logging.mode}-${logging.ids.join()}` : 'closed'}
        open={!!logging}
        initialMode={logging?.mode}
        studentIds={logging?.ids}
        groupIds={logging?.mode === 'announcement' ? [g.id] : []}
        onClose={(msg) => { setLogging(null); if (msg) { setToast(msg); setSelected([]) } }}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}

/** Shows the group's PAT. Admins can reassign manually; the checks mirror the allocation rules as warnings only. */
function PatCard({ group: g, me }: { group: Group; me: User }) {
  const { db, setGroupPat } = useDb()
  const [changing, setChanging] = useState(false)
  const [choice, setChoice] = useState(g.patId ?? '')
  const pat = db.users.find((u) => u.id === g.patId)
  const manage = canManageStudents(me.role)

  const candidates = db.users
    .filter((u) => u.role === 'pat' && u.status !== 'inactive' && u.status !== 'invited')
    .sort((a, b) => Number(b.campusId === g.campusId) - Number(a.campusId === g.campusId) || a.name.localeCompare(b.name))

  const chosen = db.users.find((u) => u.id === choice)
  const warnings: string[] = []
  if (chosen && chosen.id !== g.patId) {
    if (chosen.campusId !== g.campusId) warnings.push(`Based at ${campusName(db, chosen.campusId)}, not ${campusName(db, g.campusId)}`)
    if (chosen.shift && chosen.shift !== g.shift) warnings.push(`Works the ${chosen.shift} shift, but this group is taught in the ${g.shift}`)
    const offDays = g.classDays.filter((d) => !chosen.workDays.includes(d))
    if (offDays.length) warnings.push(`Doesn't work on ${offDays.join(', ')}`)
    const theirGroups = patGroups(db, chosen.id)
    for (const d of g.classDays) {
      const n = theirGroups.filter((x) => x.classDays.includes(d)).length
      if (n >= 2) warnings.push(`Already has ${n} groups on ${d} (max 2)`)
    }
    const after = patStudentCount(db, chosen.id) + groupStudents(db, g.id).length
    if (after > PAT_STUDENT_CAP) warnings.push(`Would have ${after} students (limit ${PAT_STUDENT_CAP})`)
  }

  return (
    <Card title="PAT" className="lg:col-span-2" actions={manage && !changing && <Button variant="secondary" onClick={() => setChanging(true)}>{pat ? 'Change PAT' : 'Assign PAT'}</Button>}>
      {!changing ? (
        pat ? (
          <div className="text-sm">
            <Link to={me.role === 'pat' ? '/profile' : `/staff/${pat.id}`} className="font-medium hover:text-brand-600">{pat.name}</Link>
            <div className="text-slate-500">{pat.email} · {pat.phone}</div>
            <div className="mt-1 text-slate-500">
              {patGroups(db, pat.id).length} groups · {patStudentCount(db, pat.id)} / {PAT_STUDENT_CAP} students
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700">This group doesn't have a PAT yet.</p>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Manual assignment for corrections. Automated allocation for new intakes is a separate feature. The checks below follow the allocation rules and are shown as warnings only.
          </p>
          <Field label="PAT">
            <Select id="group-pat" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">No PAT</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {campusName(db, u.campusId)} · {u.shift ?? '—'} · {patStudentCount(db, u.id)} students
                </option>
              ))}
            </Select>
          </Field>
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
          <div className="flex gap-2">
            <Button onClick={() => { setGroupPat(g.id, choice || null); setChanging(false) }}>Save</Button>
            <Button variant="secondary" onClick={() => { setChoice(g.patId ?? ''); setChanging(false) }}>Cancel</Button>
          </div>
          {g.patId && choice !== g.patId && <p className="text-xs text-slate-500">Replacing {userName(db, g.patId)}. Both PATs' histories will record the change.</p>}
        </div>
      )}
    </Card>
  )
}
