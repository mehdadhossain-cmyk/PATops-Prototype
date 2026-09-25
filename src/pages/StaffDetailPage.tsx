import { Link, useParams } from 'react-router-dom'
import { ModuleStatusBadge, RoleBadge, StaffStatusBadge } from '../components/StatusBadges'
import { Avatar, Button, Card, Empty, PageHeader, Progress, Stat } from '../components/ui'
import {
  activeModules,
  campusName,
  canManageStaff,
  fmtDate,
  fmtDateTime,
  isProfileComplete,
  moduleDueDate,
  moduleStatus,
  needsTraining,
  progressFor,
  trainingSummary,
  visibleStaff,
} from '../data/logic'
import { useDb } from '../store/db'

export function StaffDetailPage() {
  const { id } = useParams()
  const { db, me, setStaffStatus } = useDb()
  if (!me) return null
  const u = visibleStaff(db, me).find((x) => x.id === id)
  if (!u) return <p>Staff member not found or not visible to you.</p>

  const manage = canManageStaff(me.role)
  const t = needsTraining(u) ? trainingSummary(db, u) : null
  const now = new Date()
  const history = db.audit.filter((e) => e.subjectUserId === u.id).slice().reverse()
  const nameOf = (uid: string) => db.users.find((x) => x.id === uid)?.name ?? 'System'

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link to="/staff" className="text-brand-600 hover:underline">← Staff</Link>
      </div>
      <PageHeader
        title={u.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <RoleBadge role={u.role} /> <StaffStatusBadge status={u.status} /> {u.email} · {campusName(db, u.campusId)}
          </span>
        }
        actions={
          manage && (
            <>
              <Link to={`/staff/${u.id}/edit`}><Button variant="secondary">Edit profile</Button></Link>
              {u.status === 'onboarding' && t?.complete && (
                <Button onClick={() => setStaffStatus(u.id, 'active')}>Mark ready and active</Button>
              )}
              {u.status === 'active' && <Button variant="secondary" onClick={() => setStaffStatus(u.id, 'inactive')}>Deactivate</Button>}
              {u.status === 'inactive' && <Button variant="secondary" onClick={() => setStaffStatus(u.id, 'active')}>Reactivate</Button>}
            </>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-1">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={u.name} size="lg" />
            <div className="text-sm">
              <div>Started {fmtDate(u.startDate)}</div>
              <div className="text-slate-500">
                {isProfileComplete(u) ? `Profile completed ${fmtDate(u.profileCompletedAt)}` : 'Profile not yet completed'}
              </div>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <Row k="Phone" v={u.phone || '—'} />
            <Row k="Shift" v={<span className="capitalize">{u.shift ?? '—'}</span>} />
            <Row k="Work days" v={u.workDays.join(', ') || '—'} />
            <Row k="Emergency contact" v={u.emergencyContact ? `${u.emergencyContact.name} (${u.emergencyContact.relationship || 'n/a'}) · ${u.emergencyContact.phone}` : '—'} />
            {u.bio && <Row k="Bio" v={u.bio} />}
          </dl>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {t && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Training" value={`${t.percent}%`} hint={<Progress value={t.percent} />} />
                <Stat label="Overdue modules" value={t.overdue.length} tone={t.overdue.length ? 'bad' : 'good'} />
                <Stat label="Failed quiz attempts" value={t.failedAttempts} tone={t.failedAttempts ? 'warn' : 'default'} hint="Can flag topics needing a follow-up chat" />
              </div>
              <Card title="Training record">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="py-2 pr-3">Module</th>
                        <th className="py-2 pr-3">Due</th>
                        <th className="py-2 pr-3">Read</th>
                        <th className="py-2 pr-3">Quiz</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeModules(db).map((m) => {
                        const p = progressFor(db, u.id, m.id)
                        const st = moduleStatus(p)
                        const due = moduleDueDate(u, m)
                        return (
                          <tr key={m.id}>
                            <td className="py-2 pr-3 font-medium">{m.title}</td>
                            <td className="py-2 pr-3 text-slate-600">{fmtDate(due)}</td>
                            <td className="py-2 pr-3 text-slate-600">{p?.acknowledgedAt ? fmtDate(p.acknowledgedAt) : '—'}</td>
                            <td className="py-2 pr-3 text-slate-600">
                              {p?.attempts.length ? p.attempts.map((a) => `${a.score}%`).join(' → ') : m.quiz.length ? '—' : 'none'}
                            </td>
                            <td className="py-2 pr-3"><ModuleStatusBadge status={st} overdue={st !== 'completed' && due < now} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          <Card title="Activity history">
            {history.length === 0 ? (
              <Empty>No activity recorded in this demo session yet. Actions taken in the app appear here and will form the one-click audit export.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-32 shrink-0 text-slate-400">{fmtDateTime(e.at)}</span>
                    <span>
                      {e.message} <span className="text-slate-400">· by {nameOf(e.actorId)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2">{v}</dd>
    </div>
  )
}
