import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FollowUpBadge, FollowUpEditor, StudentLink } from '../components/NonSubmissions'
import { WellbeingBadge } from '../components/Wellbeing'
import { Badge, Button, Card, CopyButton, Empty, Field, Input, Modal, PageHeader, Progress, Select, Stat, Tabs, Textarea, cx } from '../components/ui'
import { nonSubmissionTemplate, previewNonSubmissions } from '../data/importer'
import { campusName, canManageStudents, fmtDate, fmtDateTime, intakeLabel, studentName, userName, visibleStaff } from '../data/logic'
import { attendanceSummary, RISK_THRESHOLD } from '../data/risk'
import { isResolved, itemPatId, progress, visibleNonSubmissions } from '../data/submissions'
import { FOLLOW_UP_LABEL, type DbState, type FollowUpStatus, type NonSubmission, type SubmissionPeriod } from '../data/types'
import { activePlanStudentIds } from '../data/wellbeing'
import { downloadCsv } from '../lib/csv'
import { useDb } from '../store/db'

type Tab = 'students' | 'pats' | 'upload'
type StatusFilter = '' | 'open' | 'resolved' | FollowUpStatus

export function NonSubmissionsPage() {
  const { db, me, savePeriod } = useDb()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('students')
  const [editingPeriod, setEditingPeriod] = useState<SubmissionPeriod | null>(null)
  const periods = [...db.submissionPeriods].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || b.deadline.localeCompare(a.deadline))
  const periodId = params.get('period') ?? periods[0]?.id ?? ''
  const period = db.submissionPeriods.find((p) => p.id === periodId)
  if (!me) return null
  const admin = canManageStudents(me.role)
  const items = visibleNonSubmissions(db, me, periodId)
  const prog = progress(items, period)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <PageHeader
        title="Non-submissions"
        subtitle="Students who missed an assessment deadline. PATs follow up each one; admins see the master view."
        actions={admin && (
          <Button onClick={() => setEditingPeriod({ id: `sp-${Date.now()}`, name: '', intakeIds: [], deadline: today, followUpBy: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), status: 'open', createdBy: me.id, createdAt: new Date().toISOString() })}>
            + New submission period
          </Button>
        )}
      />

      {periods.length === 0 ? (
        <Empty>No submission periods yet.</Empty>
      ) : (
        <>
          <Card className="mb-5">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Submission period">
                <Select id="ns-period" value={periodId} onChange={(e) => setParams({ period: e.target.value })} className="min-w-72">
                  {periods.map((p) => <option key={p.id} value={p.id}>{p.name} · due {fmtDate(p.deadline)}{p.status === 'closed' ? ' (closed)' : ''}</option>)}
                </Select>
              </Field>
              {period && (
                <div className="flex-1 text-sm text-slate-600">
                  <div>Intakes: {period.intakeIds.map((i) => intakeLabel(db, i)).join(', ')}</div>
                  <div>
                    Follow up by <span className={cx('font-medium', period.status === 'open' && period.followUpBy < today && 'text-rose-600')}>{fmtDate(period.followUpBy)}</span>
                    {period.status === 'closed' && <Badge tone="slate">Closed</Badge>}
                  </div>
                </div>
              )}
              {admin && period && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditingPeriod(period)}>Edit</Button>
                  <Button variant="secondary" onClick={() => savePeriod({ ...period, status: period.status === 'open' ? 'closed' : 'open' })}>{period.status === 'open' ? 'Close period' : 'Reopen'}</Button>
                </div>
              )}
            </div>
          </Card>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Missed submissions" value={prog.total} hint={`${new Set(items.map((i) => i.studentId)).size} students`} />
            <Stat label="Not contacted yet" value={prog.notContacted} tone={prog.overdue ? 'bad' : prog.notContacted ? 'warn' : 'good'} hint={prog.overdue ? `Follow-up date has passed` : undefined} />
            <Stat label="Followed up" value={`${prog.followedUpPct}%`} tone={prog.followedUpPct >= 90 ? 'good' : prog.followedUpPct >= 60 ? 'warn' : 'bad'} hint={<Progress value={prog.followedUpPct} tone={prog.followedUpPct >= 90 ? 'good' : prog.followedUpPct >= 60 ? 'warn' : 'bad'} />} />
            <Stat label="Resolved" value={`${prog.resolvedPct}%`} hint={`${prog.resolved} submitted late, extension, mitigating or withdrawn`} />
          </div>

          <div className="mb-4">
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: 'students', label: me.role === 'pat' ? 'My students' : 'Students' },
                ...(me.role !== 'pat' ? [{ value: 'pats' as Tab, label: 'By PAT' }] : []),
                ...(admin ? [{ value: 'upload' as Tab, label: 'Upload list' }] : []),
              ]}
            />
          </div>

          {tab === 'students' && period && <ItemList items={items} period={period} />}
          {tab === 'pats' && period && <ByPat items={items} period={period} />}
          {tab === 'upload' && period && <UploadList period={period} onDone={() => setTab('students')} />}
        </>
      )}

      {editingPeriod && <PeriodModal key={editingPeriod.id} initial={editingPeriod} onClose={() => setEditingPeriod(null)} onSaved={(id) => setParams({ period: id })} />}
    </div>
  )
}

const PAGE = 50

function ItemList({ items, period }: { items: NonSubmission[]; period: SubmissionPeriod }) {
  const { db, me } = useDb()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [campus, setCampus] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const onPlan = useMemo(() => activePlanStudentIds(db), [db])
  const studentById = useMemo(() => new Map(db.students.map((s) => [s.id, s])), [db.students])
  const groupById = useMemo(() => new Map(db.groups.map((g) => [g.id, g])), [db.groups])
  const staff = me?.role !== 'pat'

  const rows = items
    .filter((n) => (status === 'open' ? !isResolved(n.status) : status === 'resolved' ? isResolved(n.status) : !status || n.status === status))
    .filter((n) => !campus || groupById.get(studentById.get(n.studentId)?.groupId ?? '')?.campusId === campus)
    .filter((n) => {
      if (!q) return true
      const s = studentById.get(n.studentId)
      return `${s ? studentName(s) : ''} ${s?.ebsPersonCode} ${n.assessment}`.toLowerCase().includes(q.toLowerCase())
    })
    .sort((a, b) => Number(b.status === 'not_contacted') - Number(a.status === 'not_contacted') || (studentById.get(a.studentId)?.lastName ?? '').localeCompare(studentById.get(b.studentId)?.lastName ?? ''))

  const exportCsv = () =>
    downloadCsv(`non-submissions-${period.name.replace(/\W+/g, '-').toLowerCase()}.csv`, [
      ['Student', 'EBS Person Code', 'Uni Student ID', 'Group', 'Campus', 'PAT', 'Assessment', 'Status', 'Note', 'Expected date', 'Updated', 'Updated by', `Attendance %`],
      ...rows.map((n) => {
        const s = studentById.get(n.studentId)!
        const g = groupById.get(s.groupId)
        return [studentName(s), s.ebsPersonCode, s.uniStudentId, g?.code ?? '', g ? campusName(db, g.campusId) : '', userName(db, g?.patId ?? null), n.assessment, FOLLOW_UP_LABEL[n.status], n.note, n.expectedDate ?? '', n.updatedAt ? fmtDateTime(n.updatedAt) : '', userName(db, n.updatedBy), attendanceSummary(db, s.id).current ?? '']
      }),
    ])

  return (
    <Card title={`${rows.length} missed submission${rows.length === 1 ? '' : 's'}`} actions={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input id="ns-q" placeholder="Search student or assessment…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        <Select id="ns-status-filter" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setLimit(PAGE) }}>
          <option value="open">Still open</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
          {(Object.keys(FOLLOW_UP_LABEL) as FollowUpStatus[]).map((k) => <option key={k} value={k}>{FOLLOW_UP_LABEL[k]}</option>)}
        </Select>
        {(me?.role === 'admin' || me?.role === 'manager') && (
          <Select id="ns-campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
            <option value="">All campuses</option>
            {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty>Nothing here. ✓</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.slice(0, limit).map((n) => {
            const s = studentById.get(n.studentId)!
            const g = groupById.get(s.groupId)
            const att = attendanceSummary(db, s.id)
            return (
              <li key={n.id} className="py-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                  <div className="min-w-56 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StudentLink id={s.id} />
                      {onPlan.has(s.id) && <WellbeingBadge />}
                      {att.atRisk && <Badge tone="red">Attendance {att.current}%</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono">{g?.code}</span> · {s.phone}
                      {staff && ` · PAT ${userName(db, g?.patId ?? null)}`}
                    </div>
                  </div>
                  <div className="min-w-56 flex-1 text-sm">{n.assessment}</div>
                  <div className="w-44"><FollowUpBadge status={n.status} /></div>
                  <div className="w-36 text-right">
                    {period.status === 'open' && editing !== n.id && (
                      <Button variant={n.status === 'not_contacted' ? 'primary' : 'secondary'} className="px-3 py-1.5 text-xs" onClick={() => setEditing(n.id)}>
                        {n.status === 'not_contacted' ? 'Record follow-up' : 'Update'}
                      </Button>
                    )}
                  </div>
                </div>
                {(n.note || n.updatedAt) && editing !== n.id && (
                  <p className="mt-1 text-sm text-slate-600">
                    {n.note}
                    <span className="ml-2 text-xs text-slate-400">
                      {n.expectedDate && `Expected ${fmtDate(n.expectedDate)} · `}
                      {n.updatedAt && `${fmtDateTime(n.updatedAt)} · ${userName(db, n.updatedBy)}`}
                    </span>
                  </p>
                )}
                {editing === n.id && <div className="mt-2"><FollowUpEditor item={n} onDone={() => setEditing(null)} /></div>}
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > limit && (
        <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more ({rows.length - limit} remaining)</Button></div>
      )}
      <p className="mt-3 text-xs text-slate-500">Students at risk (attendance below {RISK_THRESHOLD}%) and students on a wellbeing plan are marked so they can be prioritised.</p>
    </Card>
  )
}

function ByPat({ items, period }: { items: NonSubmission[]; period: SubmissionPeriod }) {
  const { db, me } = useDb()
  const byPat = new Map<string, NonSubmission[]>()
  for (const n of items) {
    const p = itemPatId(db, n) ?? 'none'
    byPat.set(p, [...(byPat.get(p) ?? []), n])
  }
  const staffIds = new Set(visibleStaff(db, me!).map((u) => u.id))
  const rows = [...byPat.entries()]
    .filter(([id]) => id === 'none' || staffIds.has(id))
    .map(([id, list]) => ({ id, prog: progress(list, period) }))
    .sort((a, b) => a.prog.followedUpPct - b.prog.followedUpPct)

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4">PAT</th>
              <th className="py-2 pr-4 text-right">Missed</th>
              <th className="py-2 pr-4 text-right">Not contacted</th>
              <th className="py-2 pr-4 text-right">In progress</th>
              <th className="py-2 pr-4 text-right">Resolved</th>
              <th className="py-2 pr-4 w-52">Followed up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ id, prog }) => {
              const u = db.users.find((x) => x.id === id)
              return (
                <tr key={id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4">
                    {u ? <Link to={`/staff/${u.id}`} className="font-medium hover:text-brand-600">{u.name}</Link> : <span className="text-amber-700">No PAT assigned</span>}
                    {u && <div className="text-xs text-slate-500">{campusName(db, u.campusId)}</div>}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{prog.total}</td>
                  <td className={cx('py-2.5 pr-4 text-right tabular-nums', prog.notContacted > 0 && 'font-medium text-rose-600')}>{prog.notContacted}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{prog.inProgress}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-700">{prog.resolved}</td>
                  <td className="py-2.5 pr-4">
                    <div className="mb-1 text-xs text-slate-500">{prog.followedUpPct}%</div>
                    <Progress value={prog.followedUpPct} tone={prog.followedUpPct >= 90 ? 'good' : prog.followedUpPct >= 60 ? 'warn' : 'bad'} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">This replaces the master sheet: it updates as soon as a PAT records a follow-up.</p>
    </Card>
  )
}

function UploadList({ period, onDone }: { period: SubmissionPeriod; onDone: () => void }) {
  const { db, importNonSubmissions } = useDb()
  const [text, setText] = useState('')
  const [source, setSource] = useState('pasted data')
  const preview = useMemo(() => (text.trim() ? previewNonSubmissions(db, period.id, text) : null), [db, period.id, text])
  const valid = preview?.rows.filter((r) => r.data) ?? []

  return (
    <div className="space-y-5">
      <Card title={`Add non-submissions to "${period.name}"`}>
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">One row per student per missed assessment. Needs EBS person code or uni student ID, and the assessment.</span>
              <CopyButton text={nonSubmissionTemplate} label="Copy template" />
            </div>
            <code className="block overflow-x-auto whitespace-pre font-mono">{nonSubmissionTemplate}</code>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Choose CSV file…
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const r = new FileReader()
                r.onload = () => { setText(String(r.result ?? '')); setSource(f.name) }
                r.readAsText(f)
              }} />
            </label>
            <span className="text-sm text-slate-400">or paste below</span>
            <Button variant="ghost" onClick={() => { setText(sampleList(db, period)); setSource('example data') }}>Load example data</Button>
          </div>
          <Textarea id="ns-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); setSource('pasted data') }} className="font-mono text-xs" placeholder="Paste the non-submission report here, including the header row…" />
        </div>
      </Card>
      {preview && (
        <Card
          title="Check and confirm"
          actions={<Button disabled={valid.length === 0} onClick={() => { importNonSubmissions(period.id, valid.map((r) => r.data!), source); setText(''); onDone() }}>Add {valid.length} to the list</Button>}
        >
          {preview.missingColumns.length > 0 ? (
            <p className="text-sm text-rose-700">Missing columns: <strong>{preview.missingColumns.join(', ')}</strong>.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {[...preview.rows].sort((a, b) => b.errors.length - a.errors.length || b.warnings.length - a.warnings.length).map((r) => (
                    <tr key={r.rowNo} className={cx(r.errors.length > 0 && 'bg-rose-50/60')}>
                      <td className="py-1.5 pr-4 tabular-nums text-slate-500">{r.rowNo}</td>
                      <td className="py-1.5 pr-4">{r.label}</td>
                      <td className="py-1.5 pr-4 text-xs">
                        {r.errors.map((e) => <div key={e} className="text-rose-700">✕ {e}</div>)}
                        {r.warnings.map((w) => <div key={w} className="text-amber-700">⚠ {w}</div>)}
                        {!r.errors.length && !r.warnings.length && <span className="text-slate-400">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function sampleList(db: DbState, period: SubmissionPeriod): string {
  const listed = new Set(db.nonSubmissions.filter((n) => n.periodId === period.id).map((n) => n.studentId))
  const groupIds = new Set(db.groups.filter((g) => period.intakeIds.includes(g.intakeId)).map((g) => g.id))
  const pool = db.students.filter((s) => s.status === 'active' && groupIds.has(s.groupId) && !listed.has(s.id)).slice(0, 8)
  const lines = ['Person Code\tStudent Name\tModule / Assessment']
  for (const s of pool) lines.push(`${s.ebsPersonCode}\t${s.firstName} ${s.lastName}\tResit: Academic Skills Portfolio`)
  lines.push('0000000\tUnknown Student\tResit: Academic Skills Portfolio')
  if (pool[0]) lines.push(`${pool[0].ebsPersonCode}\t${pool[0].firstName} ${pool[0].lastName}\tResit: Academic Skills Portfolio`)
  return lines.join('\n')
}

function PeriodModal({ initial, onClose, onSaved }: { initial: SubmissionPeriod; onClose: () => void; onSaved: (id: string) => void }) {
  const { db, savePeriod } = useDb()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const isNew = !db.submissionPeriods.some((p) => p.id === initial.id)
  return (
    <Modal open title={isNew ? 'New submission period' : `Edit · ${initial.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim()) return setError('Give the period a name')
          if (f.intakeIds.length === 0) return setError('Choose at least one intake')
          if (!f.deadline || !f.followUpBy || f.followUpBy < f.deadline) return setError('The follow-up date must be on or after the deadline')
          savePeriod({ ...f, name: f.name.trim() })
          onSaved(f.id)
          onClose()
        }}
      >
        <Field label="Name" hint='e.g. "Semester 2 assessment 1"'><Input id="sp-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Intakes" group>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {db.intakes.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.intakeIds.includes(i.id)} onChange={() => setF({ ...f, intakeIds: f.intakeIds.includes(i.id) ? f.intakeIds.filter((x) => x !== i.id) : [...f.intakeIds, i.id] })} />
                {intakeLabel(db, i.id)}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Submission deadline"><Input id="sp-deadline" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
          <Field label="PATs follow up by"><Input id="sp-followup" type="date" value={f.followUpBy} onChange={(e) => setF({ ...f, followUpBy: e.target.value })} /></Field>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save period</Button>
        </div>
      </form>
    </Modal>
  )
}
