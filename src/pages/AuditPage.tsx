import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, Card, Empty, Field, Input, PageHeader, cx } from '../components/ui'
import { RoleBadge, StaffStatusBadge } from '../components/StatusBadges'
import { auditFileBase, buildAuditPack, rangeLabel, type AuditRange } from '../data/audit'
import { campusName, fmtStamp, userName, visibleStaff } from '../data/logic'
import type { User } from '../data/types'
import { auditReportHtml, auditWorkbook } from '../lib/auditExport'
import { inHostedViewer, saveFile } from '../lib/download'
import { useDb } from '../store/db'

/** Who may export whose audit pack: admins/manager anyone, leads their campus, everyone themselves. */
export function canExportAudit(viewer: User, target: User): boolean {
  if (viewer.id === target.id) return true
  if (viewer.role === 'admin' || viewer.role === 'manager') return true
  return viewer.role === 'lead' && viewer.campusId === target.campusId
}

/** /audit: choose a person. */
export function AuditIndexPage() {
  const { db, me } = useDb()
  const [q, setQ] = useState('')
  if (!me) return null
  const people = visibleStaff(db, me)
    .filter((u) => canExportAudit(me, u))
    .filter((u) => !q || `${u.name} ${u.email} ${campusName(db, u.campusId)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="max-w-4xl">
      <PageHeader title="Audit export" subtitle="Export everything PATops holds about a member of staff's work, as a printable report and a spreadsheet." />
      <Card>
        <Input id="audit-q" placeholder="Search staff…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" autoFocus />
        {people.length === 0 ? (
          <Empty>No staff match.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {people.slice(0, 60).map((u) => (
              <li key={u.id}>
                <Link to={`/audit/${u.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                  <Avatar name={u.name} size="sm" />
                  <span className="flex-1"><span className="block font-medium">{u.name}</span><span className="text-xs text-slate-500">{campusName(db, u.campusId)} · {u.email}</span></span>
                  <RoleBadge role={u.role} />
                  <span className="text-sm text-brand-600">Open audit pack →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/** /audit/:id: preview, date range, and the two export formats. */
export function AuditPackPage() {
  const { id } = useParams()
  const { db, me, recordAuditExport } = useDb()
  const navigate = useNavigate()
  const [range, setRange] = useState<AuditRange>({ from: null, to: null })
  const [status, setStatus] = useState<string | null>(null)
  const target = db.users.find((u) => u.id === (id === 'me' ? me?.id : id))
  const pack = useMemo(() => (me && target ? buildAuditPack(db, target.id, range, me.id) : null), [db, me, target, range])
  if (!me || !target || !pack) return <p>Person not found.</p>
  if (!canExportAudit(me, target)) return <p>You don't have access to this person's audit pack.</p>

  const base = auditFileBase(pack)
  const label = rangeLabel(range)
  const hosted = inHostedViewer()
  const done = (fmt: string, outcome: string) => {
    if (outcome === 'saved') {
      recordAuditExport(target.id, fmt, label)
      setStatus(`${fmt} saved. The export has been recorded in ${target.name}'s activity history.`)
    } else setStatus(outcome === 'declined' ? 'Download cancelled.' : 'The file could not be saved here.')
  }
  const total = pack.sections.reduce((n, s) => n + s.rows.length, 0)

  return (
    <div>
      <div className="mb-2 text-sm print:hidden">
        <button onClick={() => navigate(-1)} className="text-brand-600 hover:underline">← Back</button>
      </div>
      <div className="print:hidden">
        <PageHeader
          title={`Audit pack · ${target.name}`}
          subtitle={<span className="flex flex-wrap items-center gap-2"><RoleBadge role={target.role} /><StaffStatusBadge status={target.status} /> {campusName(db, target.campusId)} · {total} records in {pack.sections.length} sections</span>}
        />
        <Card className="mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="From"><Input id="audit-from" type="date" value={range.from ?? ''} onChange={(e) => setRange({ ...range, from: e.target.value || null })} /></Field>
            <Field label="To"><Input id="audit-to" type="date" value={range.to ?? ''} onChange={(e) => setRange({ ...range, to: e.target.value || null })} /></Field>
            {(range.from || range.to) && <Button variant="ghost" onClick={() => setRange({ from: null, to: null })}>All records</Button>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => done('Spreadsheet (.xlsx)', await saveFile(`${base}.xlsx`, new Blob([auditWorkbook(db, pack) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })))}
              >
                Download spreadsheet (.xlsx)
              </Button>
              <Button variant="secondary" onClick={async () => done('Report (.html)', await saveFile(`${base}.html`, auditReportHtml(db, pack), 'text/html'))}>
                Download report (.html)
              </Button>
              {!hosted && (
                <Button onClick={() => { recordAuditExport(target.id, 'printed report', label); window.print() }}>Print / save as PDF</Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            The spreadsheet has a summary tab plus one tab per section. The report is a single document that opens in any browser and prints cleanly (landscape A4)
            {hosted ? '. In this hosted preview, download the report and print it from your browser.' : '; use Print to save it as a PDF.'}
          </p>
          {status && <p className="mt-2 text-sm text-emerald-700">{status}</p>}
        </Card>
      </div>

      <ReportView pack={pack} />
    </div>
  )
}

/** The on-screen (and printable) report. */
function ReportView({ pack }: { pack: ReturnType<typeof buildAuditPack> }) {
  const { db } = useDb()
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <header className="mb-5 border-b-4 border-brand-700 pb-3">
        <div className="text-xs font-semibold tracking-widest text-brand-700 uppercase">PAT team · PATops audit pack</div>
        <h1 className="text-2xl font-semibold">{pack.person.name}</h1>
        <div className="text-sm text-slate-500">{rangeLabel(pack.range)} · generated {fmtStamp(pack.generatedAt)} by {userName(db, pack.generatedBy)}</div>
        <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-800">Contains personal data about staff and students. Handle and store under your organisation's data protection policy.</div>
      </header>
      <dl className="mb-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {pack.facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-dotted border-slate-200 py-1"><dt className="text-slate-500">{k}</dt><dd className="text-right">{v}</dd></div>
        ))}
      </dl>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {pack.summary.map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">{s.label}</div>
            <div className="text-lg font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      <nav className="mb-6 print:hidden">
        <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {pack.sections.map((s, i) => (
            <li key={s.id}><a href={`#audit-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`audit-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-brand-600 hover:underline">{i + 1}. {s.title}</a> <span className="text-slate-400">({s.rows.length})</span></li>
          ))}
        </ol>
      </nav>
      {pack.sections.map((s, i) => (
        <section key={s.id} id={`audit-${s.id}`} className="mb-7 scroll-mt-4">
          <h2 className="text-base font-semibold">{i + 1}. {s.title} <span className="text-xs font-normal text-slate-400">{s.rows.length} {s.rows.length === 1 ? 'row' : 'rows'}</span></h2>
          <p className="mb-2 text-xs text-slate-500">{s.description}</p>
          {s.rows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No records.</p>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="bg-slate-100 text-left">{s.columns.map((c) => <th key={c} className="border-b border-slate-300 px-2 py-1.5 font-semibold whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {s.rows.map((r, ri) => (
                    <tr key={ri} className={cx('break-inside-avoid', ri % 2 === 1 && 'bg-slate-50/60')}>
                      {r.map((c, ci) => <td key={ci} className="border-b border-slate-100 px-2 py-1 align-top">{c ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </article>
  )
}
