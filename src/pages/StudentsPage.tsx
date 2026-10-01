import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StudentStatusBadge } from '../components/StatusBadges'
import { Button, Card, Empty, Input, PageHeader, Select } from '../components/ui'
import { campusName, can, seesAllCampuses, studentName, userName, visibleGroups, visibleStudents } from '../data/logic'
import type { StudentStatus } from '../data/types'
import { WellbeingBadge } from '../components/Wellbeing'
import { activePlanStudentIds } from '../data/wellbeing'
import { useDb } from '../store/db'

const PAGE = 50

export function StudentsPage() {
  const { db, me } = useDb()
  const [q, setQ] = useState('')
  const [groupId, setGroupId] = useState('')
  const [campus, setCampus] = useState('')
  const [status, setStatus] = useState<StudentStatus | ''>('active')
  const [limit, setLimit] = useState(PAGE)

  const groups = useMemo(() => (me ? visibleGroups(db, me) : []), [db, me])
  const groupById = useMemo(() => new Map(db.groups.map((g) => [g.id, g])), [db.groups])
  const onPlan = useMemo(() => activePlanStudentIds(db), [db])

  const rows = useMemo(() => {
    if (!me) return []
    const qy = q.trim().toLowerCase()
    return visibleStudents(db, me)
      .filter((s) => !status || s.status === status)
      .filter((s) => !groupId || s.groupId === groupId)
      .filter((s) => !campus || groupById.get(s.groupId)?.campusId === campus)
      .filter(
        (s) =>
          !qy ||
          `${s.firstName} ${s.lastName} ${s.ebsPersonCode} ${s.uniStudentId} ${s.personalEmail} ${s.uniEmail} ${s.phone}`.toLowerCase().includes(qy),
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  }, [db, me, q, status, groupId, campus, groupById])

  if (!me) return null

  return (
    <div>
      <PageHeader
        title={me.role === 'pat' ? 'My students' : 'Students'}
        subtitle="Search by name, EBS person code, uni student ID, email or phone."
        actions={can(me, 'academic') && <Link to="/import"><Button variant="secondary">Import data</Button></Link>}
      />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input id="students-q" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} autoFocus />
          <Select id="students-group" value={groupId} onChange={(e) => { setGroupId(e.target.value); setLimit(PAGE) }}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
          </Select>
          {seesAllCampuses(me.role) && (
            <Select id="students-campus" value={campus} onChange={(e) => { setCampus(e.target.value); setLimit(PAGE) }}>
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select id="students-status" value={status} onChange={(e) => { setStatus(e.target.value as StudentStatus | ''); setLimit(PAGE) }}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="interrupted">Interrupted</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
        </div>
        <p className="mb-2 text-xs text-slate-500">{rows.length.toLocaleString()} students</p>
        {rows.length === 0 ? (
          <Empty>No students match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">EBS code</th>
                  <th className="py-2 pr-4">Uni ID</th>
                  <th className="py-2 pr-4">Group</th>
                  {me.role !== 'pat' && <th className="py-2 pr-4">PAT</th>}
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, limit).map((s) => {
                  const g = groupById.get(s.groupId)
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link>{onPlan.has(s.id) && <span className="ml-2"><WellbeingBadge /></span>}
                        <div className="text-xs text-slate-400">{s.uniEmail || s.personalEmail}</div>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs tabular-nums">{s.ebsPersonCode}</td>
                      <td className="py-2 pr-4 font-mono text-xs tabular-nums">{s.uniStudentId}</td>
                      <td className="py-2 pr-4">
                        {g && <Link to={`/groups/${g.id}`} className="font-mono text-xs text-brand-700 hover:underline">{g.code}</Link>}
                        <div className="text-xs text-slate-400">{g && campusName(db, g.campusId)}</div>
                      </td>
                      {me.role !== 'pat' && <td className="py-2 pr-4 text-slate-600">{userName(db, g?.patId ?? null)}</td>}
                      <td className="py-2 pr-4 tabular-nums whitespace-nowrap">{s.phone}</td>
                      <td className="py-2 pr-4"><StudentStatusBadge status={s.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && (
          <div className="mt-4 text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE * 4)}>Show more ({rows.length - limit} remaining)</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
