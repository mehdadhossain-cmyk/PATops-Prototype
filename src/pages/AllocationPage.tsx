import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AllocationBoard } from '../components/AllocationBoard'
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Stat, Tabs, cx } from '../components/ui'
import { buildContext, currentProblems } from '../data/allocation'
import { findHeader, previewAllocationImport, type AllocationImportPreview } from '../data/allocationImport'
import { exampleAllocationWorkbook } from '../data/allocationSheets'
import { canManageStudents, fmtDate, intakeLabel, userName } from '../data/logic'
import { saveFile } from '../lib/download'
import { buildXlsx } from '../lib/xlsx'
import { readXlsx, type ReadSheet } from '../lib/xlsxRead'
import { useDb } from '../store/db'

export function AllocationBoardPage() {
  const { id } = useParams()
  const { db } = useDb()
  const draft = db.allocationDrafts.find((d) => d.id === id)
  if (!draft) return <p>Draft not found.</p>
  return (
    <div>
      <div className="mb-2 text-sm"><Link to="/allocation" className="text-brand-600 hover:underline">← PAT allocation</Link></div>
      <PageHeader
        title={draft.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{draft.status === 'draft' ? <Badge tone="amber">Draft</Badge> : <Badge tone="green">Published</Badge>} Created by {userName(db, draft.createdBy)} · updated {fmtDate(draft.updatedAt)} · nothing changes for PATs until it's published</span>}
      />
      <AllocationBoard draft={draft} />
    </div>
  )
}

type Tab = 'drafts' | 'import'

export function AllocationPage() {
  const { db, me } = useDb()
  const [tab, setTab] = useState<Tab>('drafts')
  const [creating, setCreating] = useState(false)
  if (!me) return null
  const admin = canManageStudents(me.role)
  const ctx = buildContext(db, null)
  const live = currentProblems(ctx, db.groups.map((g) => g.id))
  const noPat = db.groups.filter((g) => !g.patId && db.intakes.find((i) => i.id === g.intakeId)?.status !== 'closed')

  return (
    <div>
      <PageHeader
        title="PAT allocation"
        subtitle="Allocate PATs to groups on a drag-and-drop board that checks every rule as you go. Work in a draft, let auto-allocate suggest the rest, then publish."
        actions={admin && <Button onClick={() => setCreating(true)}>+ New draft</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Groups without a PAT" value={noPat.length} tone={noPat.length ? 'warn' : 'good'} />
        <Stat label="Live placements breaking a rule" value={live.size} tone={live.size ? 'bad' : 'good'} hint="Clash, day off, over 2 groups a day, over 200 students…" />
        <Stat label="Drafts in progress" value={db.allocationDrafts.filter((d) => d.status === 'draft').length} />
      </div>
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'drafts', label: 'Drafts' }, ...(admin ? [{ value: 'import' as Tab, label: 'Import allocation sheet' }] : [])]} />
      </div>
      {tab === 'drafts' && <Drafts />}
      {tab === 'import' && <ImportSheet />}
      {creating && <NewDraftModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function Drafts() {
  const { db, me, deleteDraft } = useDb()
  const [confirm, setConfirm] = useState<string | null>(null)
  const drafts = [...db.allocationDrafts].sort((a, b) => Number(a.status === 'published') - Number(b.status === 'published') || b.updatedAt.localeCompare(a.updatedAt))
  if (drafts.length === 0) return <Card><Empty>No drafts yet. Start one, or import the academic team's allocation sheet.</Empty></Card>
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {drafts.map((d) => {
          const ctx = buildContext(db, d)
          const unalloc = d.groupIds.filter((g) => !ctx.patOf.get(g)).length
          const problems = currentProblems(ctx, d.groupIds).size
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
              <div className="min-w-60 flex-1">
                <Link to={`/allocation/${d.id}`} className="font-medium hover:text-brand-600">{d.name}</Link>
                <div className="text-xs text-slate-500">{d.groupIds.length} groups · updated {fmtDate(d.updatedAt)} by {userName(db, d.createdBy)}</div>
              </div>
              {d.status === 'draft' ? <Badge tone="amber">Draft</Badge> : <Badge tone="green">Published {fmtDate(d.publishedAt)}</Badge>}
              <span className={cx('text-sm', unalloc ? 'text-amber-700' : 'text-emerald-700')}>{unalloc} unallocated</span>
              <span className={cx('text-sm', problems ? 'text-rose-600' : 'text-slate-500')}>{problems} breaking a rule</span>
              <Link to={`/allocation/${d.id}`}><Button variant="secondary">Open board</Button></Link>
              {me && canManageStudents(me.role) && d.status === 'draft' && (
                confirm === d.id ? (
                  <span className="flex gap-2"><Button variant="danger" onClick={() => deleteDraft(d.id)}>Delete</Button><Button variant="secondary" onClick={() => setConfirm(null)}>Keep</Button></span>
                ) : <Button variant="ghost" onClick={() => setConfirm(d.id)}>Delete</Button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function NewDraftModal({ onClose }: { onClose: () => void }) {
  const { db, createDraft } = useDb()
  const navigate = useNavigate()
  const planning = db.intakes.filter((i) => i.status === 'planning').map((i) => i.id)
  const [name, setName] = useState(`${db.intakes.find((i) => i.id === planning[0])?.name ?? 'New'} allocation`)
  const [intakes, setIntakes] = useState<string[]>(planning)
  const [withUnallocated, setWithUnallocated] = useState(true)
  const groupIds = db.groups.filter((g) => intakes.includes(g.intakeId) || (withUnallocated && !g.patId && db.intakes.find((i) => i.id === g.intakeId)?.status !== 'closed')).map((g) => g.id)
  return (
    <Modal open title="New allocation draft" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name"><Input id="draft-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Groups to allocate" group>
          <div className="space-y-1.5">
            {db.intakes.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={intakes.includes(i.id)} onChange={() => setIntakes(intakes.includes(i.id) ? intakes.filter((x) => x !== i.id) : [...intakes, i.id])} />
                {intakeLabel(db, i.id)} <span className="text-xs text-slate-400">({db.groups.filter((g) => g.intakeId === i.id).length} groups, {i.status})</span>
              </label>
            ))}
            <label className="flex items-center gap-2 border-t border-slate-100 pt-2 text-sm">
              <input type="checkbox" checked={withUnallocated} onChange={(e) => setWithUnallocated(e.target.checked)} /> Also include every other group that has no PAT
            </label>
          </div>
        </Field>
        <p className="text-sm text-slate-600">{groupIds.length} groups will be on the board. Everything else a PAT teaches still counts towards their rules.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || groupIds.length === 0} onClick={() => { const id = createDraft(name.trim(), groupIds); onClose(); navigate(`/allocation/${id}`) }}>Create and open board</Button>
        </div>
      </div>
    </Modal>
  )
}

function ImportSheet() {
  const { db, applyAllocationImport } = useDb()
  const navigate = useNavigate()
  const [sheets, setSheets] = useState<ReadSheet[] | null>(null)
  const [source, setSource] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [updatePatterns, setUpdatePatterns] = useState(true)
  const [draftName, setDraftName] = useState('')
  const [filter, setFilter] = useState<'issues' | 'all'>('issues')
  const [error, setError] = useState('')

  const load = (bytes: Uint8Array, name: string) => {
    try {
      const s = readXlsx(bytes)
      setSheets(s)
      setSource(name)
      setSelected(s.filter((x) => findHeader(x) && !/previous|^sheet\d/i.test(x.name)).map((x) => x.name))
      setDraftName(`Imported: ${name.replace(/\.xlsx$/i, '')}`)
      setError('')
    } catch {
      setError('That file could not be read. Save it as .xlsx from Excel and try again.')
    }
  }
  const preview = useMemo<AllocationImportPreview | null>(() => (sheets ? previewAllocationImport(db, sheets, selected, { updatePatterns }) : null), [db, sheets, selected, updatePatterns])
  const counts = preview ? { ok: preview.rows.filter((r) => r.level === 'ok').length, warning: preview.rows.filter((r) => r.level === 'warning').length, error: preview.rows.filter((r) => r.level === 'error').length } : null

  return (
    <div className="space-y-5">
      <Card title="1. Choose the allocation workbook">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Upload the sheet exactly as the academic team sends it (one tab per campus, with Group Day, Campus, PAT, Working Hours and Day Off columns).
            Class days like “Mon Eve/Tues Evening” or “Monday Full Day/Tuesday Morning” are read automatically. The file is read in your browser and isn't uploaded anywhere.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Choose .xlsx file…
              <input type="file" accept=".xlsx" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(new Uint8Array(await f.arrayBuffer()), f.name) }} />
            </label>
            <Button variant="secondary" onClick={() => load(buildXlsx(exampleAllocationWorkbook(db)), 'Example allocation sheet.xlsx')}>Try the example sheet</Button>
            <Button variant="ghost" onClick={() => void saveFile('Example allocation sheet.xlsx', new Blob([buildXlsx(exampleAllocationWorkbook(db)) as BlobPart]))}>Download the example</Button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Card>

      {sheets && preview && counts && (
        <>
          <Card title={`2. Tabs in ${source}`}>
            <div className="flex flex-wrap gap-2">
              {sheets.map((s) => {
                const ok = !!findHeader(s)
                return (
                  <label key={s.name} className={cx('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm', !ok && 'opacity-50', selected.includes(s.name) ? 'border-brand-500 bg-brand-50' : 'border-slate-300')}>
                    <input type="checkbox" disabled={!ok} checked={selected.includes(s.name)} onChange={() => setSelected(selected.includes(s.name) ? selected.filter((x) => x !== s.name) : [...selected, s.name])} />
                    {s.name.trim()} {!ok && <span className="text-xs">(no Group Day column)</span>}
                  </label>
                )
              })}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={updatePatterns} onChange={(e) => setUpdatePatterns(e.target.checked)} /> Update each matched PAT's working hours and days off from the sheet</label>
          </Card>

          <Card
            title="3. Check and import"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Input id="import-draft-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-64" />
                <Button
                  disabled={preview.groups.length === 0 || !draftName.trim()}
                  onClick={() => {
                    const id = applyAllocationImport({ ...preview, draftName: draftName.trim(), source })
                    if (id) navigate(`/allocation/${id}`)
                  }}
                >
                  Import {preview.groups.length} groups into a draft
                </Button>
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <Badge tone="green">{counts.ok} rows ready</Badge>
              <Badge tone="amber">{counts.warning} with notes</Badge>
              <Badge tone={counts.error ? 'red' : 'slate'}>{counts.error} can't be imported</Badge>
              {preview.newUniversities.length > 0 && <Badge tone="blue">New universities: {preview.newUniversities.map((u) => u.shortName).join(', ')}</Badge>}
              {preview.newCourses.length > 0 && <Badge tone="blue">{preview.newCourses.length} new courses</Badge>}
              {preview.newIntakes.length > 0 && <Badge tone="blue">{preview.newIntakes.length} new intakes</Badge>}
              {preview.userPatches.length > 0 && <Badge tone="purple">{preview.userPatches.length} PAT working patterns updated</Badge>}
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Groups are created (or updated) straight away. The PATs named on the sheet go into a draft, so nobody's allocation changes until you publish it. Unmatched PAT names are left unallocated for you to place on the board.
            </p>
            {preview.patternNotes.length > 0 && (
              <details className="mb-3 text-sm"><summary className="cursor-pointer text-amber-800">{preview.patternNotes.length} PATs have different working patterns on different rows</summary><ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{preview.patternNotes.map((n) => <li key={n}>{n}</li>)}</ul></details>
            )}
            <div className="mb-2"><Tabs value={filter} onChange={setFilter} options={[{ value: 'issues', label: 'Rows with notes or errors' }, { value: 'all', label: 'All rows' }]} /></div>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-100"><th className="py-2 pr-3">Tab / row</th><th className="py-2 pr-3">Group</th><th className="py-2 pr-3">Class days (as read)</th><th className="py-2 pr-3">Campus</th><th className="py-2 pr-3">PAT</th><th className="py-2 pr-3">Notes</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.filter((r) => filter === 'all' || r.level !== 'ok').slice(0, 400).map((r) => (
                    <tr key={`${r.sheet}-${r.rowNo}`} className={cx('align-top', r.level === 'error' && 'bg-rose-50/60')}>
                      <td className="py-1.5 pr-3 text-xs whitespace-nowrap text-slate-500">{r.sheet.trim()} · {r.rowNo}</td>
                      <td className="py-1.5 pr-3">{r.label}</td>
                      <td className="py-1.5 pr-3 text-xs">{r.days}</td>
                      <td className="py-1.5 pr-3">{r.campus}</td>
                      <td className="py-1.5 pr-3">{r.patId ? userName(db, r.patId) : <span className="text-slate-400">{r.patName || '—'}</span>}</td>
                      <td className="py-1.5 pr-3 text-xs">{r.messages.map((m) => <div key={m} className={r.level === 'error' ? 'text-rose-700' : 'text-amber-800'}>{r.level === 'error' ? '✕' : '⚠'} {m}</div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
