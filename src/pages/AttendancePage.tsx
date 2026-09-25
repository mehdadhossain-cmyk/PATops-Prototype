import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, CopyButton, Field, Input, PageHeader, Textarea, cx } from '../components/ui'
import { attendanceTemplate, previewAttendance } from '../data/importer'
import { fmtDate, fmtDateTime, userName } from '../data/logic'
import { attendanceIndex, RISK_THRESHOLD } from '../data/risk'
import { lastFriday } from '../data/seedAttendance'
import type { DbState } from '../data/types'
import { useDb } from '../store/db'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function AttendancePage() {
  const { db, importAttendance } = useDb()
  const [week, setWeek] = useState(() => iso(lastFriday()))
  const future = week > iso(new Date())
  const [text, setText] = useState('')
  const [source, setSource] = useState('pasted data')
  const [done, setDone] = useState<string | null>(null)

  const preview = useMemo(() => (text.trim() ? previewAttendance(db, text, RISK_THRESHOLD, week) : null), [db, text, week])
  const valid = preview?.rows.filter((r) => r.data) ?? []
  const skipped = preview?.rows.filter((r) => !r.data).length ?? 0
  const newlyBelow = valid.filter((r) => r.warnings.some((w) => w.startsWith('Falls below') || w.startsWith('Below'))).length
  const backAbove = valid.filter((r) => r.warnings.some((w) => w.startsWith('Back above'))).length
  const activeStudents = db.students.filter((s) => s.status === 'active').length
  const alreadyUploaded = db.attendanceUploads.some((u) => u.weekEnding === week)

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => { setText(String(reader.result ?? '')); setSource(file.name); setDone(null) }
    reader.readAsText(file)
  }

  const uploads = [...db.attendanceUploads].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding))

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Weekly attendance"
        subtitle={`Upload each week's attendance report. Students below ${RISK_THRESHOLD}% overall are flagged as at risk for their PAT and the retention team.`}
        actions={<Link to="/at-risk"><Button variant="secondary">View at-risk students</Button></Link>}
      />

      {done && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">✓ {done} <Link to="/at-risk" className="font-medium underline">View at-risk students</Link></div>}

      <Card title="1. Choose the week and the report">
        <div className="space-y-4">
          <Field label="Week ending" error={future ? 'This date is in the future' : undefined} hint={alreadyUploaded ? 'This week has already been uploaded. Importing again replaces those figures.' : 'The date the report runs up to (usually a Friday).'}>
            <Input id="att-week" type="date" value={week} onChange={(e) => { setWeek(e.target.value); setDone(null) }} className="max-w-xs" />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">Needs a student identifier (EBS person code or uni student ID) and the overall attendance %</span>
              <CopyButton text={attendanceTemplate} label="Copy template" />
            </div>
            <code className="block overflow-x-auto whitespace-pre font-mono">{attendanceTemplate}</code>
            <p className="mt-2">Other columns in the report are ignored, so you can paste the whole sheet. Percentages like 72, 72% and 0.72 all work.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Choose CSV file…
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <span className="text-sm text-slate-400">or paste below</span>
            <Button variant="ghost" onClick={() => { setText(sampleWeek(db)); setSource('example data'); setDone(null) }}>Load example data</Button>
          </div>
          <Textarea id="att-text" rows={6} value={text} onChange={(e) => { setText(e.target.value); setSource('pasted data'); setDone(null) }} className="font-mono text-xs" placeholder="Paste the attendance report here, including the header row…" />
        </div>
      </Card>

      {preview && (
        <Card
          title="2. Check and confirm"
          actions={
            <Button
              disabled={valid.length === 0 || !week || future}
              onClick={() => {
                importAttendance(week, valid.map((r) => r.data!), source)
                setDone(`Imported attendance for ${valid.length} students, week ending ${fmtDate(week)}. ${newlyBelow} newly below ${RISK_THRESHOLD}%, ${backAbove} back above.`)
                setText('')
              }}
            >
              Import {valid.length} students
            </Button>
          }
        >
          {preview.missingColumns.length > 0 ? (
            <p className="text-sm text-rose-700">Missing columns: <strong>{preview.missingColumns.join(', ')}</strong>.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2 text-sm">
                <Badge tone="blue">{valid.length} students</Badge>
                <Badge tone="red">{newlyBelow} newly below {RISK_THRESHOLD}%</Badge>
                <Badge tone="green">{backAbove} back above {RISK_THRESHOLD}%</Badge>
                <Badge tone={skipped ? 'red' : 'slate'}>{skipped} rows with errors (skipped)</Badge>
                {valid.length < activeStudents && <Badge tone="amber">{activeStudents - valid.length} active students not in this file</Badge>}
              </div>
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-100"><th className="py-2 pr-4">Row</th><th className="py-2 pr-4">Student</th><th className="py-2 pr-4 text-right">Attendance</th><th className="py-2 pr-4">Notes</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...preview.rows]
                      .sort((a, b) => b.errors.length - a.errors.length || b.warnings.length - a.warnings.length)
                      .slice(0, 300)
                      .map((r) => (
                        <tr key={r.rowNo} className={cx(r.errors.length > 0 && 'bg-rose-50/60')}>
                          <td className="py-1.5 pr-4 tabular-nums text-slate-500">{r.rowNo}</td>
                          <td className="py-1.5 pr-4">{r.label}</td>
                          <td className={cx('py-1.5 pr-4 text-right tabular-nums', r.data && r.data.overall < RISK_THRESHOLD && 'font-medium text-rose-600')}>{r.data ? `${r.data.overall}%` : '—'}</td>
                          <td className="py-1.5 pr-4 text-xs">
                            {r.errors.map((e) => <div key={e} className="text-rose-700">✕ {e}</div>)}
                            {r.warnings.map((w) => <div key={w} className={w.startsWith('Back') ? 'text-emerald-700' : 'text-amber-700'}>{w.startsWith('Back') ? '▲' : '⚠'} {w}</div>)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {preview.rows.length > 300 && <p className="mt-2 text-xs text-slate-500">Showing the first 300 rows (rows with errors and changes first).</p>}
              </div>
            </>
          )}
        </Card>
      )}

      <Card title="Upload history">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100"><th className="py-2 pr-4">Week ending</th><th className="py-2 pr-4 text-right">Students</th><th className="py-2 pr-4 text-right">Below {RISK_THRESHOLD}%</th><th className="py-2 pr-4">Uploaded</th><th className="py-2 pr-4">Source</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uploads.map((u) => {
                const below = db.attendance.filter((a) => a.weekEnding === u.weekEnding && a.overall < RISK_THRESHOLD).length
                return (
                  <tr key={u.id}>
                    <td className="py-2 pr-4 font-medium">{fmtDate(u.weekEnding)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{u.rows.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-rose-600">{below}</td>
                    <td className="py-2 pr-4 text-slate-600">{fmtDateTime(u.uploadedAt)} · {userName(db, u.uploadedBy)}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{u.source}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/** Next week's report built from each student's latest figure with small changes. */
function sampleWeek(db: DbState): string {
  const idx = attendanceIndex(db.attendance)
  const lines = ['Person Code\tName\tCourse\tOverall Attendance']
  let i = 0
  for (const s of db.students) {
    if (s.status !== 'active') continue
    const last = idx.get(s.id)?.at(-1)?.overall
    i++
    // Students in brand-new intakes get their first figure; everyone else moves a little.
    const swing = i % 23 === 0 ? -12 : i % 31 === 0 ? 9 : ((i * 37) % 7) - 3.5
    const v = last === undefined ? (i % 9 === 0 ? 50 : 100 - (i % 5) * 4) : Math.max(0, Math.min(100, Math.round((last + swing) * 10) / 10))
    lines.push(`${s.ebsPersonCode}\t${s.firstName} ${s.lastName}\t${db.groups.find((g) => g.id === s.groupId)?.code ?? ''}\t${v}%`)
  }
  lines.push('9999999\tUnknown Person\tXX\t80%')
  lines.push(`${lines[1].split('\t')[0]}\tDuplicate row\t\t70%`)
  return lines.join('\n')
}
