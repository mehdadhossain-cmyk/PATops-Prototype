import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaseActionButtons, CaseStatusBadge, CycleLegend, CycleStrip, SendFormModal } from '../components/Wellbeing'
import { Badge, Button, Card, Empty, PageHeader, Progress, Select, Stat, Tabs, cx } from '../components/ui'
import { campusName, fmtDate, studentName, userName, visibleStaff } from '../data/logic'
import { WELLBEING_CATEGORY_LABEL, type WellbeingCase } from '../data/types'
import { caseActions, casePatId, compliance, LOG_DEADLINE_DAYS, MEETING_GRACE_DAYS, visibleCases, type WellbeingAction } from '../data/wellbeing'
import { useDb } from '../store/db'

type Tab = 'actions' | 'plans' | 'referrals' | 'closed' | 'pats'

export function WellbeingPage() {
  const { db, me } = useDb()
  const [tab, setTab] = useState<Tab>('actions')
  const [campus, setCampus] = useState('')
  const [sending, setSending] = useState(false)

  const cases = useMemo(() => {
    if (!me) return []
    const all = visibleCases(db, me)
    if (!campus) return all
    return all.filter((c) => {
      const s = db.students.find((x) => x.id === c.studentId)
      return db.groups.find((g) => g.id === s?.groupId)?.campusId === campus
    })
  }, [db, me, campus])
  if (!me) return null
  const staff = me.role !== 'pat'

  const actions = cases
    .flatMap((c) => caseActions(c, db.wellbeingMeetings))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || +a.date - +b.date)
  const comp = compliance(cases, db.wellbeingMeetings)
  const active = cases.filter((c) => c.status === 'approved')
  const referrals = cases.filter((c) => c.status === 'form_sent' || c.status === 'submitted')
  const closed = cases.filter((c) => c.status === 'closed' || c.status === 'declined')

  return (
    <div>
      <PageHeader
        title="Wellbeing"
        subtitle="Students on a wellbeing plan need a recorded Teams meeting every two weeks, logged in the wellbeing team's system. PATops tracks that each step happens, not what was discussed."
        actions={<Button onClick={() => setSending(true)}>+ Wellbeing form sent</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students on a plan" value={comp.activePlans} hint={`${referrals.length} referrals in progress`} />
        <Stat
          label="Meetings held and logged"
          value={`${comp.percent}%`}
          tone={comp.percent >= 85 ? 'good' : comp.percent >= 65 ? 'warn' : 'bad'}
          hint={`${comp.complete} of ${comp.pastMeetings} fortnights so far`}
        />
        <Stat label="Meetings not held" value={comp.overdueMeetings} tone={comp.overdueMeetings ? 'bad' : 'good'} hint={`More than ${MEETING_GRACE_DAYS} days past due`} />
        <Stat label="Waiting to be logged" value={comp.logsOutstanding} tone={comp.logsOutstanding ? 'warn' : 'good'} hint={`Log within ${LOG_DEADLINE_DAYS} days of the meeting`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'actions', label: `Action needed (${actions.filter((a) => a.kind !== 'awaiting_decision').length})` },
            { value: 'plans', label: `Active plans (${active.length})` },
            { value: 'referrals', label: `Referrals (${referrals.length})` },
            { value: 'closed', label: `Closed / declined (${closed.length})` },
            ...(staff ? [{ value: 'pats' as Tab, label: 'By PAT' }] : []),
          ]}
        />
        {(me.role === 'admin' || me.role === 'manager') && (
          <Select id="wb-campus" value={campus} onChange={(e) => setCampus(e.target.value)} className="max-w-xs">
            <option value="">All campuses</option>
            {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>

      {tab === 'actions' && <ActionList actions={actions.filter((a) => a.kind !== 'awaiting_decision')} showPat={staff} />}
      {tab === 'plans' && <CaseTable cases={active} showPat={staff} />}
      {tab === 'referrals' && <CaseTable cases={referrals} showPat={staff} />}
      {tab === 'closed' && <CaseTable cases={closed} showPat={staff} />}
      {tab === 'pats' && <ByPat cases={cases} />}

      <SendFormModal key={String(sending)} open={sending} onClose={() => setSending(false)} />
    </div>
  )
}

const actionTone: Record<WellbeingAction['kind'], 'red' | 'amber' | 'blue' | 'purple'> = {
  chase_form: 'amber',
  awaiting_decision: 'purple',
  meeting_due: 'blue',
  meeting_overdue: 'red',
  log_pending: 'amber',
  log_overdue: 'red',
}
const actionTitle: Record<WellbeingAction['kind'], string> = {
  chase_form: 'Chase form',
  awaiting_decision: 'Awaiting decision',
  meeting_due: 'Meeting due',
  meeting_overdue: 'Meeting not held',
  log_pending: 'Log meeting',
  log_overdue: 'Log overdue',
}

function ActionList({ actions, showPat }: { actions: WellbeingAction[]; showPat: boolean }) {
  const { db } = useDb()
  if (actions.length === 0) return <Card><Empty>Nothing needs action right now. ✓</Empty></Card>
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {actions.map((a, i) => {
          const s = db.students.find((x) => x.id === a.studentId)!
          const c = db.wellbeingCases.find((x) => x.id === a.caseId)!
          return (
            <li key={`${a.caseId}-${a.kind}-${i}`} className="flex flex-wrap items-center gap-3 py-3">
              <div className="w-36 shrink-0"><Badge tone={actionTone[a.kind]}>{actionTitle[a.kind]}</Badge></div>
              <div className="min-w-0 flex-1">
                <Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link>
                {showPat && <span className="text-sm text-slate-500"> · PAT {userName(db, casePatId(db, c))}</span>}
                <div className="text-sm text-slate-600">{a.label} · {fmtDate(a.date)}</div>
              </div>
              <CaseActionButtons c={c} compact />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function CaseTable({ cases, showPat }: { cases: WellbeingCase[]; showPat: boolean }) {
  const { db } = useDb()
  if (cases.length === 0) return <Card><Empty>No students here.</Empty></Card>
  const sorted = [...cases].sort((a, b) => b.formSentAt.localeCompare(a.formSentAt))
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-4">Student</th>
              {showPat && <th className="py-2 pr-4">PAT</th>}
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Key date</th>
              <th className="py-2 pr-4">Fortnights</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((c) => {
              const s = db.students.find((x) => x.id === c.studentId)!
              const g = db.groups.find((x) => x.id === s.groupId)
              const keyDate =
                c.status === 'form_sent' ? `Sent ${fmtDate(c.formSentAt)}` :
                c.status === 'submitted' ? `Returned ${fmtDate(c.submittedAt)}` :
                c.status === 'approved' ? `Since ${fmtDate(c.planStart)}` :
                c.status === 'declined' ? `Declined ${fmtDate(c.decisionAt)}` : `Closed ${fmtDate(c.closedAt)}`
              return (
                <tr key={c.id} className="align-top hover:bg-slate-50">
                  <td className="py-2.5 pr-4">
                    <Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link>
                    <div className="font-mono text-xs text-slate-400">{g?.code}</div>
                  </td>
                  {showPat && <td className="py-2.5 pr-4 text-slate-600">{userName(db, casePatId(db, c))}</td>}
                  <td className="py-2.5 pr-4"><CaseStatusBadge c={c} /></td>
                  <td className="py-2.5 pr-4 text-slate-600">{WELLBEING_CATEGORY_LABEL[c.category]}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-slate-600">{keyDate}</td>
                  <td className="py-2.5 pr-4"><CycleStrip c={c} /></td>
                  <td className="py-2.5 text-right"><CaseActionButtons c={c} compact /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3"><CycleLegend /></div>
    </Card>
  )
}

function ByPat({ cases }: { cases: WellbeingCase[] }) {
  const { db, me } = useDb()
  const pats = visibleStaff(db, me!).filter((u) => u.role === 'pat' && u.status === 'active')
  const rows = pats
    .map((u) => {
      const mine = cases.filter((c) => casePatId(db, c) === u.id)
      return { u, comp: compliance(mine, db.wellbeingMeetings), open: mine.filter((c) => c.status === 'form_sent' || c.status === 'submitted').length }
    })
    .filter((r) => r.comp.activePlans > 0 || r.open > 0 || r.comp.pastMeetings > 0)
    .sort((a, b) => (a.comp.pastMeetings ? a.comp.percent : 101) - (b.comp.pastMeetings ? b.comp.percent : 101))

  return (
    <Card>
      {rows.length === 0 ? (
        <Empty>No PATs have wellbeing students.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-4">PAT</th>
                <th className="py-2 pr-4 text-right">On a plan</th>
                <th className="py-2 pr-4 text-right">Referrals</th>
                <th className="py-2 pr-4 w-52">Held and logged</th>
                <th className="py-2 pr-4 text-right">Not held</th>
                <th className="py-2 pr-4 text-right">Waiting to be logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ u, comp, open }) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4">
                    <Link to={`/staff/${u.id}`} className="font-medium hover:text-brand-600">{u.name}</Link>
                    <div className="text-xs text-slate-500">{campusName(db, u.campusId)}</div>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{comp.activePlans}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{open}</td>
                  <td className="py-2.5 pr-4">
                    {comp.pastMeetings === 0 ? (
                      <span className="text-xs text-slate-400">No meetings due yet</span>
                    ) : (
                      <>
                        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{comp.percent}%</span><span className="tabular-nums">{comp.complete}/{comp.pastMeetings}</span></div>
                        <Progress value={comp.percent} tone={comp.percent >= 85 ? 'good' : comp.percent >= 65 ? 'warn' : 'bad'} />
                      </>
                    )}
                  </td>
                  <td className={cx('py-2.5 pr-4 text-right tabular-nums', comp.overdueMeetings > 0 && 'font-medium text-rose-600')}>{comp.overdueMeetings}</td>
                  <td className={cx('py-2.5 pr-4 text-right tabular-nums', comp.logsOutstanding > 0 && 'font-medium text-amber-700')}>{comp.logsOutstanding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
