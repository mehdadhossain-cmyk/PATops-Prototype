import { useState } from 'react'
import { fmtDate, fmtDateTime, userName } from '../data/logic'
import { attendanceSummary, canDecideRetention, retentionStage, RISK_THRESHOLD } from '../data/risk'
import { CHANNEL_LABEL, OUTCOME_LABEL, REASON_LABEL, ROLE_LABEL, STAGE_LABEL, type RetentionStage } from '../data/types'
import { useDb } from '../store/db'
import { AttendanceChart } from './AttendanceChart'
import { CHANNEL_ICON } from './Comms'
import { Badge, Button, Card, Field, Select, Textarea, cx } from './ui'

const stageTone: Record<RetentionStage, 'slate' | 'blue' | 'amber' | 'purple' | 'red' | 'green'> = {
  new: 'red',
  pat_contacted: 'amber',
  admin_review: 'purple',
  action_plan: 'blue',
  withdrawal_recommended: 'red',
  resolved: 'green',
  withdrawn: 'slate',
}

export function StageBadge({ stage }: { stage: RetentionStage }) {
  return <Badge tone={stageTone[stage]}>{STAGE_LABEL[stage]}</Badge>
}

export function AttendanceValue({ value, change }: { value: number | null; change?: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={cx('font-medium', value < RISK_THRESHOLD ? 'text-rose-600' : 'text-slate-900')}>{value}%</span>
      {change !== undefined && change !== null && change !== 0 && (
        <span className={cx('ml-1.5 text-xs', change < 0 ? 'text-rose-600' : 'text-emerald-600')}>{change < 0 ? '▼' : '▲'} {Math.abs(change)}</span>
      )}
    </span>
  )
}

/** Attendance chart plus the shared PAT/admin retention history for one student. */
export function RetentionPanel({ studentId }: { studentId: string }) {
  const { db, me, addRiskNote } = useDb()
  const [text, setText] = useState('')
  const [stage, setStage] = useState<RetentionStage | ''>('')
  const [error, setError] = useState('')
  const s = db.students.find((x) => x.id === studentId)!
  const g = db.groups.find((x) => x.id === s.groupId)
  const intake = db.intakes.find((i) => i.id === g?.intakeId)
  const att = attendanceSummary(db, studentId)
  const current = retentionStage(db, studentId)
  const decider = me ? canDecideRetention(me.role) : false
  const hasNotes = db.riskNotes.some((n) => n.studentId === studentId)

  // One timeline: retention notes plus direct contacts about attendance or wellbeing.
  const items = [
    ...db.riskNotes.filter((n) => n.studentId === studentId).map((n) => ({ kind: 'note' as const, at: n.at, n })),
    ...db.comms
      .filter((c) => c.studentId === studentId && !c.voidedAt && (c.reason === 'attendance' || c.reason === 'wellbeing' || c.reason === 'assessment'))
      .map((c) => ({ kind: 'comm' as const, at: c.at, c })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const stageOptions = (Object.keys(STAGE_LABEL) as RetentionStage[]).filter((k) => decider || (k !== 'resolved' && k !== 'withdrawn'))

  return (
    <Card
      title="Attendance and retention"
      className="lg:col-span-3"
      actions={(att.atRisk || hasNotes) && <StageBadge stage={current} />}
    >
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>Overall attendance: <AttendanceValue value={att.current} change={att.change} /></span>
        {att.weekEnding && <span className="text-slate-500">as of week ending {fmtDate(att.weekEnding)}</span>}
        {att.atRisk && <span className="font-medium text-rose-600">⚠ At risk · {att.weeksBelow} week{att.weeksBelow === 1 ? '' : 's'} below {RISK_THRESHOLD}%</span>}
      </div>
      <AttendanceChart history={att.history} intakeStart={intake?.startDate ?? null} />

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h3 className="mb-2 text-sm font-medium">Retention history</h3>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No retention notes or attendance-related contact yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {items.map((it) =>
                it.kind === 'note' ? (
                  <li key={it.n.id} className="relative">
                    <span className="absolute top-1 -left-[26px] h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{fmtDateTime(it.n.at)}</span>
                      <span>· {userName(db, it.n.authorId)} ({ROLE_LABEL[db.users.find((u) => u.id === it.n.authorId)?.role ?? 'pat']})</span>
                      {it.n.stage && <StageBadge stage={it.n.stage} />}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-800">{it.n.text}</p>
                  </li>
                ) : (
                  <li key={it.c.id} className="relative">
                    <span className="absolute top-1 -left-[26px] h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                    <div className="text-xs text-slate-500">
                      {fmtDateTime(it.c.at)} · {CHANNEL_ICON[it.c.channel]} {CHANNEL_LABEL[it.c.channel]} · {REASON_LABEL[it.c.reason]}
                      {it.c.outcome !== 'reached' && ` · ${OUTCOME_LABEL[it.c.outcome]}`} · {userName(db, it.c.authorId)} (call log)
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{it.c.summary}</p>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
        <form
          className="space-y-3 lg:col-span-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim().length < 5) return setError('Write a short note so the history explains what happened')
            if (stage === 'withdrawn' && !decider) return setError('Only PAT Admins or the PAT Manager can record a withdrawal')
            addRiskNote(studentId, text.trim(), stage || null)
            setText('')
            setStage('')
            setError('')
          }}
        >
          <h3 className="text-sm font-medium">Add to the retention history</h3>
          <Field label="Note" hint="This history is used when deciding whether the student continues or is withdrawn.">
            <Textarea id="risk-note" rows={4} value={text} onChange={(e) => { setText(e.target.value); setError('') }} placeholder="What happened, what was agreed, next step…" />
          </Field>
          <Field label="Move to stage (optional)">
            <Select id="risk-stage" value={stage} onChange={(e) => setStage(e.target.value as RetentionStage | '')}>
              <option value="">Keep current stage ({STAGE_LABEL[current]})</option>
              {stageOptions.filter((k) => k !== current).map((k) => <option key={k} value={k}>{STAGE_LABEL[k]}</option>)}
            </Select>
          </Field>
          {stage === 'withdrawn' && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-800">This also marks the student as withdrawn across PATops.</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit">Add note</Button>
        </form>
      </div>
    </Card>
  )
}
