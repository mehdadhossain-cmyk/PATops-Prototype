import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LsaModal, LsaStatusBadge } from '../components/Lsa'
import { Badge, Button, Card, CopyButton, Empty, Input, PageHeader, Select, Stat, Tabs, Textarea, cx } from '../components/ui'
import { previewLsas } from '../data/importer'
import { campusName, canManageStudents, courseName, fmtDate, intakeLabel, studentName, userName, visibleStaff } from '../data/logic'
import { intakeCodes, LSA_DUE_SOON_DAYS, LSA_SHEET_HEADER, lsaStatus, toSheetDate, visibleLsas, type LsaStatus } from '../data/lsa'
import type { DbState, Lsa } from '../data/types'
import { downloadCsv } from '../lib/csv'
import { useDb } from '../store/db'

type Tab = 'records' | 'pats' | 'upload'
const PAGE = 50

/** Course name as it appears on the sheet ("Business Management", not "BA (Hons) Business Management"). */
const sheetCourse = (name: string) => name.replace(/^(BA|BSc|BEng|LLB|MA|MSc)\s*\(Hons\)\s*/i, '')

function sheetRow(db: DbState, l: Lsa): string[] {
  const s = db.students.find((x) => x.id === l.studentId)!
  const g = db.groups.find((x) => x.id === s.groupId)
  const codes = intakeCodes(db, g?.intakeId)
  return [
    s.uniStudentId, studentName(s), g ? campusName(db, g.campusId) : '', codes.short, g ? sheetCourse(courseName(db, g.courseId)) : '',
    userName(db, g?.patId ?? null), toSheetDate(l.startDate), toSheetDate(l.endDate), toSheetDate(l.nextFollowUp), codes.standard, l.comments,
  ]
}

export function LsaPage() {
  const { db, me } = useDb()
  const [tab, setTab] = useState<Tab>('records')
  const [editing, setEditing] = useState<Lsa | 'new' | null>(null)
  if (!me) return null
  const lsas = visibleLsas(db, me)
  const statuses = lsas.map((l) => lsaStatus(l))
  const count = (s: LsaStatus) => statuses.filter((x) => x === s).length
  const admin = canManageStudents(me.role)

  return (
    <div>
      <PageHeader
        title="LSAs"
        subtitle="Learning support agreements signed with students. PATs keep the dates and comments up to date; admins see every campus in one place."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCsv(`PAT_LSA_Records-${new Date().toISOString().slice(0, 10)}.csv`, [LSA_SHEET_HEADER, ...lsas.map((l) => sheetRow(db, l))])}>
              Export sheet (CSV)
            </Button>
            <Button onClick={() => setEditing('new')}>+ New LSA</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active LSAs" value={lsas.length - count('ended')} hint={`${lsas.length} recorded in total`} />
        <Stat label="Follow-up overdue" value={count('follow_up_overdue')} tone={count('follow_up_overdue') ? 'bad' : 'good'} />
        <Stat label={`Follow-up due in ${LSA_DUE_SOON_DAYS} days`} value={count('follow_up_due')} tone={count('follow_up_due') ? 'warn' : 'default'} />
        <Stat label="Ended" value={count('ended')} />
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'records', label: 'Records' },
            ...(me.role !== 'pat' ? [{ value: 'pats' as Tab, label: 'By PAT' }] : []),
            ...(admin ? [{ value: 'upload' as Tab, label: 'Upload existing sheet' }] : []),
          ]}
        />
      </div>

      {tab === 'records' && <Records lsas={lsas} onEdit={setEditing} />}
      {tab === 'pats' && <ByPat lsas={lsas} />}
      {tab === 'upload' && <Upload onDone={() => setTab('records')} />}

      {editing && <LsaModal lsa={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Records({ lsas, onEdit }: { lsas: Lsa[]; onEdit: (l: Lsa) => void }) {
  const { db, me } = useDb()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | 'open' | LsaStatus>('open')
  const [campus, setCampus] = useState('')
  const [intake, setIntake] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const studentById = useMemo(() => new Map(db.students.map((s) => [s.id, s])), [db.students])
  const groupById = useMemo(() => new Map(db.groups.map((g) => [g.id, g])), [db.groups])
  const order: Record<LsaStatus, number> = { follow_up_overdue: 0, follow_up_due: 1, active: 2, ended: 3 }

  const rows = lsas
    .filter((l) => {
      const st = lsaStatus(l)
      return status === 'open' ? st !== 'ended' : !status || st === status
    })
    .filter((l) => {
      const g = groupById.get(studentById.get(l.studentId)?.groupId ?? '')
      return (!campus || g?.campusId === campus) && (!intake || g?.intakeId === intake)
    })
    .filter((l) => {
      if (!q) return true
      const s = studentById.get(l.studentId)!
      return `${studentName(s)} ${s.uniStudentId} ${l.comments}`.toLowerCase().includes(q.toLowerCase())
    })
    .sort((a, b) => order[lsaStatus(a)] - order[lsaStatus(b)] || (a.nextFollowUp ?? '9').localeCompare(b.nextFollowUp ?? '9'))

  return (
    <Card title={`${rows.length} LSA${rows.length === 1 ? '' : 's'}`}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input id="lsa-q" placeholder="Search name, student ID or comment…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        <Select id="lsa-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Not ended</option>
          <option value="follow_up_overdue">Follow-up overdue</option>
          <option value="follow_up_due">Follow-up due soon</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="">All</option>
        </Select>
        {(me?.role === 'admin' || me?.role === 'manager') && (
          <Select id="lsa-campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
            <option value="">All campuses</option>
            {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Select id="lsa-intake" value={intake} onChange={(e) => setIntake(e.target.value)}>
          <option value="">All intakes</option>
          {db.intakes.map((i) => <option key={i.id} value={i.id}>{intakeLabel(db, i.id)}</option>)}
        </Select>
      </div>
      {rows.length === 0 ? (
        <Empty>No LSAs match these filters.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-3">Student ID</th>
                <th className="py-2 pr-3">Student name</th>
                <th className="py-2 pr-3">Campus</th>
                <th className="py-2 pr-3">Intake</th>
                <th className="py-2 pr-3">Course</th>
                <th className="py-2 pr-3">PAT</th>
                <th className="py-2 pr-3">Start</th>
                <th className="py-2 pr-3">End</th>
                <th className="py-2 pr-3">Next follow-up</th>
                <th className="py-2 pr-3">Comments</th>
                <th className="py-2 pr-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, limit).map((l) => {
                const s = studentById.get(l.studentId)!
                const g = groupById.get(s.groupId)
                const st = lsaStatus(l)
                return (
                  <tr key={l.id} className="align-top hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{s.uniStudentId}</td>
                    <td className="py-2.5 pr-3"><Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link></td>
                    <td className="py-2.5 pr-3">{g ? campusName(db, g.campusId) : ''}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap" title={intakeCodes(db, g?.intakeId).standard}>{intakeCodes(db, g?.intakeId).short}</td>
                    <td className="py-2.5 pr-3">{g ? sheetCourse(courseName(db, g.courseId)) : ''}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{userName(db, g?.patId ?? null)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{fmtDate(l.startDate)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{l.endDate ? fmtDate(l.endDate) : '—'}</td>
                    <td className={cx('py-2.5 pr-3 whitespace-nowrap', st === 'follow_up_overdue' && 'font-medium text-rose-600', st === 'follow_up_due' && 'text-amber-700')}>{l.nextFollowUp ? fmtDate(l.nextFollowUp) : '—'}</td>
                    <td className="max-w-64 py-2.5 pr-3 text-slate-600">{l.comments || <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 pr-3"><LsaStatusBadge l={l} /></td>
                    <td className="py-2.5 text-right"><Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onEdit(l)}>Update</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more ({rows.length - limit} remaining)</Button></div>
      )}
      <p className="mt-3 text-xs text-slate-500">Student, campus, intake, course and PAT come from the student record automatically. Hover the intake to see the standardised form.</p>
    </Card>
  )
}

function ByPat({ lsas }: { lsas: Lsa[] }) {
  const { db, me } = useDb()
  const patOf = (l: Lsa) => db.groups.find((g) => g.id === db.students.find((s) => s.id === l.studentId)?.groupId)?.patId ?? 'none'
  const byPat = new Map<string, Lsa[]>()
  for (const l of lsas) byPat.set(patOf(l), [...(byPat.get(patOf(l)) ?? []), l])
  const staffIds = new Set(visibleStaff(db, me!).map((u) => u.id))
  const rows = [...byPat.entries()]
    .filter(([id]) => id === 'none' || staffIds.has(id))
    .map(([id, list]) => {
      const st = list.map((l) => lsaStatus(l))
      return { id, active: st.filter((s) => s !== 'ended').length, overdue: st.filter((s) => s === 'follow_up_overdue').length, due: st.filter((s) => s === 'follow_up_due').length, ended: st.filter((s) => s === 'ended').length }
    })
    .sort((a, b) => b.overdue - a.overdue || b.active - a.active)
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-100"><th className="py-2 pr-4">PAT</th><th className="py-2 pr-4 text-right">Active</th><th className="py-2 pr-4 text-right">Follow-up overdue</th><th className="py-2 pr-4 text-right">Due in {LSA_DUE_SOON_DAYS} days</th><th className="py-2 pr-4 text-right">Ended</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const u = db.users.find((x) => x.id === r.id)
              return (
                <tr key={r.id}>
                  <td className="py-2.5 pr-4">{u ? <><Link to={`/staff/${u.id}`} className="font-medium hover:text-brand-600">{u.name}</Link><div className="text-xs text-slate-500">{campusName(db, u.campusId)}</div></> : <span className="text-amber-700">No PAT assigned</span>}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{r.active}</td>
                  <td className={cx('py-2.5 pr-4 text-right tabular-nums', r.overdue > 0 && 'font-medium text-rose-600')}>{r.overdue}</td>
                  <td className={cx('py-2.5 pr-4 text-right tabular-nums', r.due > 0 && 'text-amber-700')}>{r.due}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">{r.ended}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">This replaces combining each PAT's LSA sheet into a master sheet: it's always current.</p>
    </Card>
  )
}

function Upload({ onDone }: { onDone: () => void }) {
  const { db, importLsas } = useDb()
  const [text, setText] = useState('')
  const [source, setSource] = useState('pasted data')
  const preview = useMemo(() => (text.trim() ? previewLsas(db, text) : null), [db, text])
  const valid = preview?.rows.filter((r) => r.data) ?? []
  const example = useMemo(() => exampleSheet(db), [db])

  return (
    <div className="space-y-5">
      <Card title="Bring in an existing PAT LSA records sheet">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">Use the sheet as it is. Rows are matched on Student ID (uni ID); name, campus, intake, course and PAT are only cross-checked. Dates are M/D/YYYY, as in the sheet. Empty rows are ignored.</span>
              <CopyButton text={LSA_SHEET_HEADER.join(',')} label="Copy header" />
            </div>
            <code className="block overflow-x-auto whitespace-pre font-mono">{LSA_SHEET_HEADER.join(',')}</code>
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
            <Button variant="ghost" onClick={() => { setText(example); setSource('example sheet') }}>Load example sheet</Button>
          </div>
          <Textarea id="lsa-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); setSource('pasted data') }} className="font-mono text-xs" placeholder="Paste the sheet here, including the header row…" />
        </div>
      </Card>
      {preview && (
        <Card title="Check and confirm" actions={<Button disabled={valid.length === 0} onClick={() => { importLsas(valid.map((r) => r.data!), source); setText(''); onDone() }}>Import {valid.length} LSA{valid.length === 1 ? '' : 's'}</Button>}>
          {preview.missingColumns.length > 0 ? (
            <p className="text-sm text-rose-700">Missing columns: <strong>{preview.missingColumns.join(', ')}</strong>.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <Badge tone="green">{preview.rows.filter((r) => r.action === 'create').length} new</Badge>
                <Badge tone="blue">{preview.rows.filter((r) => r.action === 'update').length} updates</Badge>
                <Badge tone={preview.rows.some((r) => r.action === 'skip') ? 'red' : 'slate'}>{preview.rows.filter((r) => r.action === 'skip').length} with errors (skipped)</Badge>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {[...preview.rows].sort((a, b) => b.errors.length - a.errors.length || b.warnings.length - a.warnings.length).map((r) => (
                      <tr key={r.rowNo} className={cx(r.errors.length > 0 && 'bg-rose-50/60')}>
                        <td className="py-1.5 pr-4 tabular-nums text-slate-500">{r.rowNo}</td>
                        <td className="py-1.5 pr-4">{r.label}</td>
                        <td className="py-1.5 pr-4">{r.action === 'create' ? <Badge tone="green">New</Badge> : r.action === 'update' ? <Badge tone="blue">Update</Badge> : <Badge tone="red">Skip</Badge>}</td>
                        <td className="py-1.5 pr-4 text-xs">
                          {r.data && <div className="text-slate-500">Start {fmtDate(r.data.startDate)}{r.data.endDate && ` · end ${fmtDate(r.data.endDate)}`}{r.data.nextFollowUp && ` · follow-up ${fmtDate(r.data.nextFollowUp)}`}</div>}
                          {r.errors.map((e) => <div key={e} className="text-rose-700">✕ {e}</div>)}
                          {r.warnings.map((w) => <div key={w} className="text-amber-700">⚠ {w}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

/** A sheet in the same shape as PAT_LSA_RecordsSalford.csv, built from demo students. */
function exampleSheet(db: DbState): string {
  const salford = new Set(db.groups.filter((g) => g.campusId === 'c-salford').map((g) => g.id))
  const withLsa = new Set(db.lsas.map((l) => l.studentId))
  const pool = db.students.filter((s) => s.status === 'active' && salford.has(s.groupId) && !withLsa.has(s.id)).slice(0, 4)
  const existing = db.lsas.find((l) => salford.has(db.students.find((s) => s.id === l.studentId)?.groupId ?? ''))
  const d = (n: number) => toSheetDate(new Date(Date.now() + n * 86400000).toISOString().slice(0, 10))
  const lines = [LSA_SHEET_HEADER.join(',')]
  for (const [i, s] of pool.entries()) {
    const g = db.groups.find((x) => x.id === s.groupId)!
    const codes = intakeCodes(db, g.intakeId)
    lines.push([s.uniStudentId, studentName(s), 'Salford', codes.short, sheetCourse(courseName(db, g.courseId)), userName(db, g.patId), d(-30 - i * 7), '', d(20 + i * 5), codes.standard, i === 1 ? 'This is a new test comment!' : ''].join(','))
  }
  if (existing) {
    const row = sheetRow(db, existing)
    row[8] = d(35)
    row[10] = 'Updated from the old sheet'
    lines.push(row.map((c) => (c.includes(',') ? `"${c}"` : c)).join(','))
  }
  lines.push('9999999,Unknown Student,Salford,Jan-26,Business Management,,6/16/2026,,1/26/2027,UOW JAN 26,')
  lines.push(`${pool[0]?.uniStudentId ?? ''},${pool[0] ? studentName(pool[0]) : ''},Salford,Jan-26,Business Management,,13/45/2026,,,UOW JAN 26,`)
  lines.push(',,,,,,,,,,', ',,,,,,,,,,')
  return lines.join('\n')
}
