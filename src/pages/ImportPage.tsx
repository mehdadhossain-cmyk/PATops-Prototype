import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, CopyButton, Field, PageHeader, Select, Tabs, Textarea, cx } from '../components/ui'
import { groupTemplate, previewGroups, previewStudents, studentTemplate, type Preview, type PreviewRow } from '../data/importer'
import { intakeLabel } from '../data/logic'
import type { DbState } from '../data/types'
import { useDb } from '../store/db'

type Kind = 'students' | 'groups'

export function ImportPage() {
  const [kind, setKind] = useState<Kind>('students')
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Import data"
        subtitle="Upload a CSV, or copy the cells in Excel and paste them here. Nothing is saved until you confirm the import."
        actions={<Tabs value={kind} onChange={setKind} options={[{ value: 'students', label: 'Students' }, { value: 'groups', label: 'Groups' }]} />}
      />
      {kind === 'students' ? <Importer key="s" kind="students" /> : <Importer key="g" kind="groups" />}
    </div>
  )
}

function Importer({ kind }: { kind: Kind }) {
  const { db, importStudents, importGroups } = useDb()
  const planning = db.intakes.find((i) => i.status === 'planning') ?? db.intakes[0]
  const [intakeId, setIntakeId] = useState(planning.id)
  const [text, setText] = useState('')
  const [source, setSource] = useState('pasted data')
  const [done, setDone] = useState<string | null>(null)

  const preview = useMemo<Preview<unknown> | null>(() => {
    if (!text.trim()) return null
    return kind === 'students' ? previewStudents(db, text) : previewGroups(db, intakeId, text)
  }, [db, text, kind, intakeId])

  const valid = preview?.rows.filter((r) => r.data) ?? []
  const counts = {
    create: preview?.rows.filter((r) => r.action === 'create').length ?? 0,
    update: preview?.rows.filter((r) => r.action === 'update').length ?? 0,
    skip: preview?.rows.filter((r) => r.action === 'skip').length ?? 0,
  }

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? ''))
      setSource(file.name)
      setDone(null)
    }
    reader.readAsText(file)
  }

  const confirm = () => {
    if (kind === 'students') importStudents(valid.map((r) => r.data) as never, source)
    else importGroups(valid.map((r) => r.data) as never, `${source} (${intakeLabel(db, intakeId)})`)
    setDone(`Imported ${valid.length} ${kind}: ${counts.create} new, ${counts.update} updated${counts.skip ? `, ${counts.skip} rows skipped` : ''}.`)
    setText('')
  }

  const template = kind === 'students' ? studentTemplate : groupTemplate

  return (
    <div className="space-y-5">
      {done && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          ✓ {done}{' '}
          <Link to={kind === 'students' ? '/students' : `/groups?intake=${intakeId}`} className="font-medium underline">View {kind}</Link>
        </div>
      )}

      <Card title={kind === 'students' ? '1. Student list' : '1. Intake and group list'}>
        <div className="space-y-4">
          {kind === 'groups' && (
            <Field label="Intake these groups belong to" hint="Use the academic team's group list for a new intake, e.g. January 2027.">
              <Select id="import-intake" value={intakeId} onChange={(e) => setIntakeId(e.target.value)} className="max-w-sm">
                {db.intakes.map((i) => <option key={i.id} value={i.id}>{intakeLabel(db, i.id)} ({i.status})</option>)}
              </Select>
            </Field>
          )}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">Expected columns (the header names are flexible)</span>
              <CopyButton text={template} label="Copy template" />
            </div>
            <code className="block overflow-x-auto whitespace-pre font-mono">{template}</code>
            {kind === 'students' && <p className="mt-2">Students are matched on <strong>EBS person code</strong>: existing students are updated (e.g. moved to a new group), new codes are added.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Choose CSV file…
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <span className="text-sm text-slate-400">or paste below</span>
            <Button variant="ghost" onClick={() => { setText(kind === 'students' ? sampleStudents(db) : sampleGroups(db, intakeId)); setSource('example data'); setDone(null) }}>
              Load example data
            </Button>
          </div>
          <Textarea
            id="import-text"
            rows={7}
            value={text}
            onChange={(e) => { setText(e.target.value); setSource('pasted data'); setDone(null) }}
            placeholder="Paste rows from Excel here, including the header row…"
            className="font-mono text-xs"
          />
        </div>
      </Card>

      {preview && (
        <Card
          title="2. Check and confirm"
          actions={
            <Button onClick={confirm} disabled={valid.length === 0}>
              Import {valid.length} valid row{valid.length === 1 ? '' : 's'}
            </Button>
          }
        >
          {preview.missingColumns.length > 0 ? (
            <p className="text-sm text-rose-700">Missing required columns: <strong>{preview.missingColumns.join(', ')}</strong>. Check that the first row contains the headers.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2 text-sm">
                <Badge tone="green">{counts.create} new</Badge>
                <Badge tone="blue">{counts.update} updates</Badge>
                <Badge tone={counts.skip ? 'red' : 'slate'}>{counts.skip} with errors (skipped)</Badge>
              </div>
              <PreviewTable rows={preview.rows} />
            </>
          )}
        </Card>
      )}
    </div>
  )
}

function PreviewTable({ rows }: { rows: PreviewRow<unknown>[] }) {
  const sorted = [...rows].sort((a, b) => Number(!!b.errors.length) - Number(!!a.errors.length) || b.warnings.length - a.warnings.length)
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="py-2 pr-4">Row</th>
            <th className="py-2 pr-4">Record</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r) => (
            <tr key={r.rowNo} className={cx(r.errors.length > 0 && 'bg-rose-50/60')}>
              <td className="py-2 pr-4 tabular-nums text-slate-500">{r.rowNo}</td>
              <td className="py-2 pr-4 font-medium">{r.label}</td>
              <td className="py-2 pr-4">
                {r.action === 'create' && <Badge tone="green">New</Badge>}
                {r.action === 'update' && <Badge tone="blue">Update</Badge>}
                {r.action === 'skip' && <Badge tone="red">Skip</Badge>}
              </td>
              <td className="py-2 pr-4 text-xs">
                {r.errors.map((e) => <div key={e} className="text-rose-700">✕ {e}</div>)}
                {r.warnings.map((w) => <div key={w} className="text-amber-700">⚠ {w}</div>)}
                {!r.errors.length && !r.warnings.length && <span className="text-slate-400">OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Example data so the flow can be tried without a real spreadsheet -------

function sampleStudents(db: DbState): string {
  const target = db.groups.find((g) => g.intakeId === 'in-wlv-2701') ?? db.groups[0]
  const mover = db.students.find((s) => s.status === 'active')!
  const header = 'Person Code\tStudent ID\tForename\tSurname\tEmail\tUni Email\tMobile\tNext of Kin\tNext of Kin Phone\tGroup'
  const rows = [
    ['3999101', '2601101', 'Elena', 'Marin', 'elena.marin@gmail.com', '2601101@wlv.ac.uk', '07700900201', 'Vlad Marin', '07700900202', target.code],
    ['3999102', '2601102', 'Kwabena', 'Owusu', 'k.owusu@outlook.com', '2601102@wlv.ac.uk', '07700900203', 'Ama Owusu', '07700900204', target.code],
    ['3999103', '2601103', 'Sana', 'Iqbal', 'sana.iqbal@gmail.com', '2601103@wlv.ac.uk', '07700900205', '', '', target.code],
    ['3999104', '2601104', 'Tomasz', 'Nowak', 'not-an-email', '', '07700900206', 'Anna Nowak', '07700900207', target.code],
    ['3999105', '2601105', 'Grace', 'Adeyemi', 'grace.a@gmail.com', '', '07700900208', 'Tolu Adeyemi', '07700900209', 'XX-UNKNOWN-G99'],
    [mover.ebsPersonCode, mover.uniStudentId, mover.firstName, mover.lastName, mover.personalEmail, mover.uniEmail, mover.phone, mover.emergencyContactName, mover.emergencyContactPhone, target.code],
  ]
  return [header, ...rows.map((r) => r.join('\t'))].join('\n')
}

function sampleGroups(db: DbState, intakeId: string): string {
  const intake = db.intakes.find((i) => i.id === intakeId)!
  const course = db.courses.find((c) => c.universityId === intake.universityId)?.name ?? 'Unknown'
  const tag = intake.name.slice(0, 1).toUpperCase() + intake.startDate.slice(2, 4)
  return [
    'Group Code,Course,Campus,Shift,Class Days,Start Time,End Time',
    `NEW-${tag}-SAL-G01,${course},Salford,Morning,Mon & Tue,09:30,13:30`,
    `NEW-${tag}-SAL-G02,${course},Salford,Evening,Wed/Thu,17:30,21:00`,
    `NEW-${tag}-DER-G01,${course},Derby,,Monday Wednesday,18:00,21:00`,
    `NEW-${tag}-NEW-G01,${course},Newcastle,Morning,Fri,13:30,09:30`,
    `NEW-${tag}-XYZ-G01,${course},Leeds,Morning,Tue,09:30,13:30`,
  ].join('\n')
}
