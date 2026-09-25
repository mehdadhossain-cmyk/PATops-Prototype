import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StudentStatusBadge } from '../components/StatusBadges'
import { Button, Card, CopyButton, Field, Input, PageHeader, Select } from '../components/ui'
import { campusName, canManageStudents, courseName, fmtSchedule, intakeLabel, studentName, userName, visibleStudents } from '../data/logic'
import type { Student, StudentStatus } from '../data/types'
import { useDb } from '../store/db'

export function StudentDetailPage() {
  const { id } = useParams()
  const { db, me } = useDb()
  const [editing, setEditing] = useState(false)
  if (!me) return null
  const s = visibleStudents(db, me).find((x) => x.id === id)
  if (!s) return <p>Student not found or not visible to you.</p>
  const g = db.groups.find((x) => x.id === s.groupId)
  const manage = canManageStudents(me.role)

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link to={g ? `/groups/${g.id}` : '/students'} className="text-brand-600 hover:underline">← {g ? g.code : 'Students'}</Link>
      </div>
      <PageHeader
        title={studentName(s)}
        subtitle={<span className="flex items-center gap-2"><StudentStatusBadge status={s.status} /> EBS {s.ebsPersonCode} · Uni ID {s.uniStudentId}</span>}
        actions={manage && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit record</Button>}
      />

      {editing ? (
        <EditStudent key={s.id} student={s} onDone={() => setEditing(false)} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Contact details" className="lg:col-span-2">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Contact label="Phone" value={s.phone} />
              <Contact label="Personal email" value={s.personalEmail} />
              <Contact label="Uni email" value={s.uniEmail} />
              <Contact label="Emergency contact" value={s.emergencyContactName ? `${s.emergencyContactName} · ${s.emergencyContactPhone}` : ''} copy={s.emergencyContactPhone} />
              <Contact label="EBS person code" value={s.ebsPersonCode} />
              <Contact label="Uni student ID" value={s.uniStudentId} />
            </dl>
          </Card>
          <Card title="Group">
            {g ? (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-slate-500">Group</dt><dd><Link to={`/groups/${g.id}`} className="font-mono text-brand-700 hover:underline">{g.code}</Link></dd></div>
                <div><dt className="text-slate-500">Course</dt><dd>{courseName(db, g.courseId)}</dd></div>
                <div><dt className="text-slate-500">Intake</dt><dd>{intakeLabel(db, g.intakeId)}</dd></div>
                <div><dt className="text-slate-500">Classes</dt><dd>{fmtSchedule(g)} · {campusName(db, g.campusId)}</dd></div>
                <div><dt className="text-slate-500">PAT</dt><dd>{userName(db, g.patId)}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Not in a group.</p>
            )}
          </Card>
          <Card title="Support record" className="lg:col-span-3">
            <p className="text-sm text-slate-500">
              Coming in the next steps: call log, attendance and risk status, wellbeing plan, non-submissions and LSAs for this student, all in one timeline.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}

function Contact({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <span className="break-all tabular-nums">{value || '—'}</span>
        {value && <CopyButton text={copy ?? value} />}
      </dd>
    </div>
  )
}

function EditStudent({ student, onDone }: { student: Student; onDone: () => void }) {
  const { db, updateStudent } = useDb()
  const [f, setF] = useState(student)
  const [error, setError] = useState('')
  const set = <K extends keyof Student>(k: K, v: Student[K]) => setF((x) => ({ ...x, [k]: v }))
  const text = (k: keyof Student, label: string) => (
    <Field label={label}>
      <Input id={`student-${k}`} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  )

  return (
    <Card title="Edit student record">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.firstName.trim() || !f.lastName.trim() || !f.ebsPersonCode.trim() || !f.uniStudentId.trim()) return setError('Name, EBS person code and uni student ID are required')
          const clash = db.students.find((x) => x.id !== f.id && (x.ebsPersonCode === f.ebsPersonCode.trim() || x.uniStudentId === f.uniStudentId.trim()))
          if (clash) return setError(`That EBS code or uni ID already belongs to ${studentName(clash)}`)
          updateStudent(f.id, f)
          onDone()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {text('firstName', 'First name')}
          {text('lastName', 'Last name')}
          {text('ebsPersonCode', 'EBS person code')}
          {text('uniStudentId', 'Uni student ID')}
          {text('personalEmail', 'Personal email')}
          {text('uniEmail', 'Uni email')}
          {text('phone', 'Phone')}
          {text('emergencyContactName', 'Emergency contact name')}
          {text('emergencyContactPhone', 'Emergency contact phone')}
          <Field label="Group">
            <Select id="student-group" value={f.groupId} onChange={(e) => set('groupId', e.target.value)}>
              {db.groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select id="student-status" value={f.status} onChange={(e) => set('status', e.target.value as StudentStatus)}>
              <option value="active">Active</option>
              <option value="interrupted">Interrupted</option>
              <option value="withdrawn">Withdrawn</option>
            </Select>
          </Field>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}
