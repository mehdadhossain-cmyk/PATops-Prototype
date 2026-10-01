import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GroupModal } from '../components/GroupModal'
import { Badge, Button, Card, Empty, Input, PageHeader, Progress, Select, Stat } from '../components/ui'
import {
  campusName,
  can,
  courseName,
  fmtSchedule,
  groupStudents,
  intakeLabel,
  PAT_STUDENT_CAP,
  patGroups,
  patStudentCount,
  userName,
  visibleGroups,
} from '../data/logic'
import type { User } from '../data/types'
import { useDb } from '../store/db'

export function GroupsPage() {
  const { me } = useDb()
  if (!me) return null
  return me.role === 'pat' ? <MyGroups me={me} /> : <AllGroups me={me} />
}

function MyGroups({ me }: { me: User }) {
  const { db } = useDb()
  const groups = patGroups(db, me.id)
  const total = patStudentCount(db, me.id)

  return (
    <div>
      <PageHeader title="My groups" subtitle="The student groups you are PAT for. Open a group to see student contact details." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Groups" value={groups.length} />
        <Stat label="Active students" value={total} hint={<><Progress value={(total / PAT_STUDENT_CAP) * 100} tone={total > PAT_STUDENT_CAP ? 'bad' : 'good'} /><span className="mt-1 block">Limit is {PAT_STUDENT_CAP} students per PAT</span></>} />
        <Stat label="Teaching days" value={[...new Set(groups.flatMap((g) => g.classDays))].length || '—'} hint={[...new Set(groups.flatMap((g) => g.classDays))].join(', ')} />
      </div>
      {groups.length === 0 ? (
        <Empty>You haven't been allocated a group yet. Your PAT Admins will let you know once you're allocated.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const students = groupStudents(db, g.id, true)
            const active = students.filter((s) => s.status === 'active').length
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold text-brand-700">{g.code}</div>
                    <div className="mt-0.5 font-medium">{courseName(db, g.courseId)}</div>
                  </div>
                  <Badge tone={g.shift === 'morning' ? 'amber' : 'purple'}>{g.shift}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-slate-500">Intake</dt><dd>{intakeLabel(db, g.intakeId)}</dd>
                  <dt className="text-slate-500">Classes</dt><dd>{fmtSchedule(g)}</dd>
                  <dt className="text-slate-500">Campus</dt><dd>{campusName(db, g.campusId)}</dd>
                  <dt className="text-slate-500">Students</dt>
                  <dd>{active} active{students.length > active && <span className="text-slate-400"> · {students.length - active} inactive</span>}</dd>
                </dl>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AllGroups({ me }: { me: User }) {
  const { db } = useDb()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  const f = {
    intake: params.get('intake') ?? '',
    campus: params.get('campus') ?? '',
    course: params.get('course') ?? '',
    pat: params.get('pat') ?? '',
    q: params.get('q') ?? '',
  }
  const set = (k: keyof typeof f, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of db.students) if (s.status === 'active') m.set(s.groupId, (m.get(s.groupId) ?? 0) + 1)
    return m
  }, [db.students])

  const all = visibleGroups(db, me)
  const rows = all
    .filter((g) => !f.intake || g.intakeId === f.intake)
    .filter((g) => !f.campus || g.campusId === f.campus)
    .filter((g) => !f.course || g.courseId === f.course)
    .filter((g) => (f.pat === 'none' ? !g.patId : !f.pat || g.patId === f.pat))
    .filter((g) => !f.q || g.code.toLowerCase().includes(f.q.toLowerCase()) || userName(db, g.patId).toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, b) => a.code.localeCompare(b.code))

  const studentTotal = rows.reduce((n, g) => n + (counts.get(g.id) ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Groups"
        subtitle={me.role === 'lead' ? `Groups taught at ${campusName(db, me.campusId)}` : 'All teaching groups across campuses and intakes'}
        actions={can(me, 'academic') && <Button onClick={() => setCreating(true)}>+ New group</Button>}
      />
      {creating && <GroupModal intakeId={f.intake || undefined} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/groups/${id}`)} />}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Groups shown" value={rows.length} />
        <Stat label="Active students" value={studentTotal.toLocaleString()} />
        <Stat label="Without a PAT" value={rows.filter((g) => !g.patId).length} tone={rows.some((g) => !g.patId) ? 'warn' : 'good'} />
      </div>
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input id="groups-q" placeholder="Search code or PAT…" value={f.q} onChange={(e) => set('q', e.target.value)} />
          <Select id="groups-intake" value={f.intake} onChange={(e) => set('intake', e.target.value)}>
            <option value="">All intakes</option>
            {db.intakes.map((i) => <option key={i.id} value={i.id}>{intakeLabel(db, i.id)}</option>)}
          </Select>
          {me.role !== 'lead' && (
            <Select id="groups-campus" value={f.campus} onChange={(e) => set('campus', e.target.value)}>
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select id="groups-course" value={f.course} onChange={(e) => set('course', e.target.value)}>
            <option value="">All courses</option>
            {db.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select id="groups-pat" value={f.pat === 'none' ? 'none' : ''} onChange={(e) => set('pat', e.target.value)}>
            <option value="">Any PAT status</option>
            <option value="none">Without a PAT</option>
          </Select>
        </div>
        {rows.length === 0 ? (
          <Empty>No groups match these filters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4">Group</th>
                  <th className="py-2 pr-4">Course</th>
                  <th className="py-2 pr-4">Intake</th>
                  <th className="py-2 pr-4">Campus</th>
                  <th className="py-2 pr-4">Classes</th>
                  <th className="py-2 pr-4 text-right">Students</th>
                  <th className="py-2 pr-4">PAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4"><Link to={`/groups/${g.id}`} className="font-mono font-medium text-brand-700 hover:underline">{g.code}</Link></td>
                    <td className="py-2.5 pr-4 text-slate-600">{courseName(db, g.courseId)}</td>
                    <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{intakeLabel(db, g.intakeId)}</td>
                    <td className="py-2.5 pr-4">{campusName(db, g.campusId)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap"><Badge tone={g.shift === 'morning' ? 'amber' : 'purple'}>{g.shift}</Badge> <span className="text-slate-600">{fmtSchedule(g)}</span></td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{counts.get(g.id) ?? 0}</td>
                    <td className="py-2.5 pr-4">{g.patId ? <Link to={`/staff/${g.patId}`} className="hover:text-brand-600">{userName(db, g.patId)}</Link> : <Badge tone="amber">No PAT</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
