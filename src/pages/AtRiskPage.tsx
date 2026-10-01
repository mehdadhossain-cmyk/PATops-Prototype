import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../components/AttendanceChart'
import { AttendanceValue, StageBadge } from '../components/Risk'
import { WellbeingBadge } from '../components/Wellbeing'
import { Button, Card, Empty, Input, PageHeader, Select, Stat, Tabs, cx } from '../components/ui'
import { campusName, can, daysSince, fmtDate, intakeLabel, seesAllCampuses, studentName, userName, visibleStudents } from '../data/logic'
import { latestWeekEnding, NO_ACTION_DAYS, RISK_THRESHOLD, riskRows, type RiskRow } from '../data/risk'
import { STAGE_LABEL, type RetentionStage } from '../data/types'
import { activePlanStudentIds } from '../data/wellbeing'
import { downloadCsv } from '../lib/csv'
import { useDb } from '../store/db'

type Tab = 'risk' | 'recovering'
const PAGE = 50

export function AtRiskPage() {
  const { db, me } = useDb()
  const [tab, setTab] = useState<Tab>('risk')
  const [q, setQ] = useState('')
  const [campus, setCampus] = useState('')
  const [intake, setIntake] = useState('')
  const [stage, setStage] = useState<RetentionStage | ''>('')
  const [onlyNew, setOnlyNew] = useState(false)
  const [onlyStale, setOnlyStale] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const { atRisk, recovering } = useMemo(() => (me ? riskRows(db, me) : { atRisk: [], recovering: [] }), [db, me])
  const groupById = useMemo(() => new Map(db.groups.map((g) => [g.id, g])), [db.groups])
  const onPlan = useMemo(() => activePlanStudentIds(db), [db])
  if (!me) return null
  const staff = me.role !== 'pat'
  const activeCount = visibleStudents(db, me).filter((s) => s.status === 'active').length
  const week = latestWeekEnding(db)

  const rows = (tab === 'risk' ? atRisk : recovering)
    .filter((r) => !q || `${studentName(r.student)} ${r.student.ebsPersonCode}`.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !campus || groupById.get(r.student.groupId)?.campusId === campus)
    .filter((r) => !intake || groupById.get(r.student.groupId)?.intakeId === intake)
    .filter((r) => !stage || r.stage === stage)
    .filter((r) => !onlyNew || r.att.newlyAtRisk)
    .filter((r) => !onlyStale || r.noRecentAction)
    .sort((a, b) => (a.att.current ?? 0) - (b.att.current ?? 0))

  const exportCsv = () =>
    downloadCsv(`at-risk-${week ?? 'students'}.csv`, [
      ['Student', 'EBS Person Code', 'Uni Student ID', 'Group', 'Campus', 'PAT', 'Attendance %', 'Change', 'Weeks below', 'Stage', 'Last action', 'On wellbeing plan'],
      ...rows.map((r) => {
        const g = groupById.get(r.student.groupId)
        return [studentName(r.student), r.student.ebsPersonCode, r.student.uniStudentId, g?.code ?? '', g ? campusName(db, g.campusId) : '', userName(db, g?.patId ?? null),
          r.att.current ?? '', r.att.change ?? '', r.att.weeksBelow, STAGE_LABEL[r.stage], r.lastAction ? fmtDate(r.lastAction) : 'None', onPlan.has(r.student.id) ? 'Yes' : '']
      }),
    ])

  return (
    <div>
      <PageHeader
        title="At-risk students"
        subtitle={`Students whose overall attendance is below ${RISK_THRESHOLD}%${week ? `, from the week ending ${fmtDate(week)}` : ''}. PATs and admins share one retention history per student.`}
        actions={
          <>
            {can(me, 'attendance') && <Link to="/attendance"><Button variant="secondary">Upload attendance</Button></Link>}
            <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="At risk now" value={atRisk.length} tone={atRisk.length ? 'bad' : 'good'} hint={`${activeCount ? Math.round((atRisk.length / activeCount) * 100) : 0}% of ${activeCount.toLocaleString()} active students`} />
        <Stat label="Newly at risk this week" value={atRisk.filter((r) => r.att.newlyAtRisk).length} tone="warn" />
        <Stat label={`No action in ${NO_ACTION_DAYS} days`} value={atRisk.filter((r) => r.noRecentAction).length} tone={atRisk.some((r) => r.noRecentAction) ? 'bad' : 'good'} hint="No retention note or contact" />
        <Stat label="Back above threshold" value={recovering.length} tone="good" hint="Still open: confirm and resolve" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs value={tab} onChange={(t) => { setTab(t); setLimit(PAGE) }} options={[{ value: 'risk', label: `At risk (${atRisk.length})` }, { value: 'recovering', label: `Back above ${RISK_THRESHOLD}% (${recovering.length})` }]} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Newly at risk</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyStale} onChange={(e) => setOnlyStale(e.target.checked)} /> No action in {NO_ACTION_DAYS} days</label>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input id="risk-q" placeholder="Search name or EBS code…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
          {seesAllCampuses(me.role) && (
            <Select id="risk-campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select id="risk-intake" value={intake} onChange={(e) => setIntake(e.target.value)}>
            <option value="">All intakes</option>
            {db.intakes.map((i) => <option key={i.id} value={i.id}>{intakeLabel(db, i.id)}</option>)}
          </Select>
          <Select id="risk-stage-filter" value={stage} onChange={(e) => setStage(e.target.value as RetentionStage | '')}>
            <option value="">All stages</option>
            {(Object.keys(STAGE_LABEL) as RetentionStage[]).map((k) => <option key={k} value={k}>{STAGE_LABEL[k]}</option>)}
          </Select>
        </div>

        {rows.length === 0 ? (
          <Empty>{tab === 'risk' ? 'No at-risk students match these filters.' : 'Nobody is waiting to be resolved.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4">Student</th>
                  {staff && <th className="py-2 pr-4">PAT</th>}
                  <th className="py-2 pr-4">Attendance</th>
                  <th className="py-2 pr-4">Last 10 weeks</th>
                  <th className="py-2 pr-4 text-right">Weeks below</th>
                  <th className="py-2 pr-4">Stage</th>
                  <th className="py-2 pr-4">Last action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, limit).map((r) => <Row key={r.student.id} r={r} staff={staff} onPlan={onPlan.has(r.student.id)} />)}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > limit && (
          <div className="mt-4 text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more ({rows.length - limit} remaining)</Button>
          </div>
        )}
      </Card>
    </div>
  )
}

function Row({ r, staff, onPlan }: { r: RiskRow; staff: boolean; onPlan: boolean }) {
  const { db } = useDb()
  const g = db.groups.find((x) => x.id === r.student.groupId)
  const since = daysSince(r.lastAction)
  return (
    <tr className="hover:bg-slate-50">
      <td className="py-2.5 pr-4">
        <Link to={`/students/${r.student.id}`} className="font-medium hover:text-brand-600">{studentName(r.student)}</Link>
        {r.att.newlyAtRisk && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">NEW</span>}
        {onPlan && <span className="ml-2"><WellbeingBadge /></span>}
        <div className="font-mono text-xs text-slate-400">{g?.code}</div>
      </td>
      {staff && <td className="py-2.5 pr-4 text-slate-600">{userName(db, g?.patId ?? null)}</td>}
      <td className="py-2.5 pr-4"><AttendanceValue value={r.att.current} change={r.att.change} /></td>
      <td className="py-2.5 pr-4"><Sparkline history={r.att.history} /></td>
      <td className="py-2.5 pr-4 text-right tabular-nums">{r.att.weeksBelow}</td>
      <td className="py-2.5 pr-4"><StageBadge stage={r.stage} /></td>
      <td className={cx('py-2.5 pr-4 whitespace-nowrap', r.noRecentAction ? 'font-medium text-rose-600' : 'text-slate-600')}>
        {r.lastAction ? `${fmtDate(r.lastAction)} (${since}d)` : 'None'}
      </td>
    </tr>
  )
}
