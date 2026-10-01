import { useState } from 'react'
import { fmtDate, fmtDateTime, userName } from '../data/logic'
import { addDaysTo, addMonths, hrEmail, PROBATION_MONTHS, PROBATION_STATUS_LABEL, probationRows, standardEnd, type ProbationRow, type ProbationStatus } from '../data/probation'
import { PAT_LEVEL_LABEL, PAT_LEVELS, PROBATION_OUTCOME_LABEL, type PatLevel, type User } from '../data/types'
import { useDb } from '../store/db'
import { Badge, Button, Card, CopyButton, Field, Input, Textarea, cx } from './ui'

const statusTone: Record<ProbationStatus, 'slate' | 'blue' | 'amber' | 'red' | 'purple' | 'green'> = {
  not_started: 'slate', in_progress: 'blue', due_soon: 'amber', awaiting_decision: 'red', awaiting_hr: 'purple', complete: 'green',
}

export function ProbationBadge({ status }: { status: ProbationStatus }) {
  return <Badge tone={statusTone[status]}>{PROBATION_STATUS_LABEL[status]}</Badge>
}

/** Start → end → manager decision → confirmed to HR. */
export function ProbationTimeline({ row }: { row: ProbationRow }) {
  const { db } = useDb()
  const { user: u, probation: p, end, status } = row
  const today = new Date().toISOString().slice(0, 10)
  const steps: { label: string; detail: string; state: 'done' | 'current' | 'todo' | 'bad' }[] = [
    { label: 'Started', detail: fmtDate(u.startDate), state: u.startDate <= today ? 'done' : 'todo' },
    {
      label: p.extendedTo ? 'Probation ends (extended)' : `Probation ends (${PROBATION_MONTHS} months)`,
      detail: `${fmtDate(end)}${p.extendedTo ? ` · was ${fmtDate(standardEnd(u))}` : ''}`,
      state: end <= today ? 'done' : status === 'due_soon' ? 'current' : 'todo',
    },
    {
      label: 'Manager decision',
      detail: p.outcome ? `${PROBATION_OUTCOME_LABEL[p.outcome]} · ${fmtDate(p.decidedAt)} by ${userName(db, p.decidedBy)}` : status === 'awaiting_decision' ? `Due since ${fmtDate(end)}` : 'Not yet',
      state: p.outcome === 'not_passed' ? 'bad' : p.outcome ? 'done' : status === 'awaiting_decision' || status === 'due_soon' ? 'current' : 'todo',
    },
    {
      label: 'Confirmed to HR manager',
      detail: p.hrNotifiedAt ? `${fmtDate(p.hrNotifiedAt)} by ${userName(db, p.hrNotifiedBy)}` : status === 'awaiting_hr' ? 'Waiting to be sent' : 'Not yet',
      state: p.hrNotifiedAt ? 'done' : status === 'awaiting_hr' ? 'current' : 'todo',
    },
  ]
  const dot = { done: 'bg-emerald-500 text-white', current: 'bg-amber-400 text-white ring-4 ring-amber-100', todo: 'bg-slate-200 text-slate-500', bad: 'bg-rose-500 text-white' }
  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-2 sm:flex-col">
          {i < steps.length - 1 && <span className={cx('absolute hidden h-0.5 sm:top-3 sm:left-7 sm:right-0 sm:block', s.state === 'done' ? 'bg-emerald-300' : 'bg-slate-200')} />}
          <span className={cx('relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', dot[s.state])}>{s.state === 'done' ? '✓' : s.state === 'bad' ? '✕' : i + 1}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-xs text-slate-500">{s.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

type Choice = 'confirmed' | 'extend' | 'not_passed'

/** The manager's actions for one probation: decide (pass, extend, not passed), then confirm to HR. */
export function ProbationActions({ row }: { row: ProbationRow }) {
  const { db, me, decideProbation, extendProbation, reopenProbation, markProbationSentToHr } = useDb()
  const { user: u, status, end } = row
  const [choice, setChoice] = useState<Choice | null>(null)
  const [note, setNote] = useState('')
  const [until, setUntil] = useState(addMonths(end, 1))
  const [level, setLevel] = useState<PatLevel>(u.level === 'trainee' || !u.level ? 'junior' : u.level)
  const [error, setError] = useState('')
  if (!me) return null

  if (status === 'awaiting_hr') {
    const mail = hrEmail(db, row, me.name)
    const to = db.settings.hrManagerEmail
    return (
      <div className="space-y-3 rounded-lg bg-violet-50 p-4">
        <p className="text-sm font-medium text-violet-900">
          Next step: confirm the outcome to {db.settings.hrManagerName || 'the HR manager'}{to ? ` (${to})` : ''}.
        </p>
        <pre className="max-h-48 overflow-auto rounded-md border border-violet-200 bg-white p-3 text-xs whitespace-pre-wrap text-slate-700">Subject: {mail.subject}{'\n\n'}{mail.body}</pre>
        <div className="flex flex-wrap items-center gap-2">
          {to && <a href={`mailto:${to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">✉ Open in email</a>}
          <CopyButton text={`Subject: ${mail.subject}\n\n${mail.body}`} label="Copy text" className="px-3 py-2 text-sm" />
          <Button onClick={() => markProbationSentToHr(u.id)}>Mark as confirmed to HR</Button>
          <button className="text-xs text-slate-500 underline hover:text-slate-700" onClick={() => reopenProbation(u.id)}>Change decision</button>
        </div>
        {!to && <p className="text-xs text-amber-800">Add the HR manager's email in Settings to open a ready-made email.</p>}
      </div>
    )
  }
  if (status === 'complete' || status === 'not_started') return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="self-center text-sm text-slate-600">Decision:</span>
        {([['confirmed', 'Pass and confirm'], ['extend', 'Extend probation'], ['not_passed', 'Not passed']] as [Choice, string][]).map(([c, label]) => (
          <button key={c} type="button" onClick={() => { setChoice(c); setError('') }} className={cx('rounded-lg border px-3 py-1.5 text-sm', choice === c ? (c === 'not_passed' ? 'border-rose-600 bg-rose-600 text-white' : 'border-brand-600 bg-brand-600 text-white') : 'border-slate-300 bg-white hover:bg-slate-50')}>{label}</button>
        ))}
      </div>
      {status === 'in_progress' && !choice && <p className="text-xs text-slate-500">You'll get a reminder 2 weeks before {fmtDate(end)}. You can also decide early.</p>}
      {choice && (
        <form
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (choice === 'extend') {
              if (!until || until <= end) return setError(`The new end date must be after ${fmtDate(end)}`)
              extendProbation(u.id, until, note.trim())
            } else {
              if (choice === 'not_passed' && note.trim().length < 5) return setError('Add a short reason; it goes into the email to HR')
              decideProbation(u.id, choice, note.trim(), choice === 'confirmed' && level !== u.level ? level : null)
            }
            setChoice(null)
            setNote('')
          }}
        >
          {choice === 'extend' && (
            <Field label="Extend until">
              <div className="flex flex-wrap gap-2">
                <Input id={`pb-until-${u.id}`} type="date" value={until} min={addDaysTo(end, 1)} onChange={(e) => setUntil(e.target.value)} className="max-w-44" />
                {[1, 2, 3].map((m) => <Button key={m} type="button" variant="secondary" onClick={() => setUntil(addMonths(end, m))}>+{m} month{m > 1 ? 's' : ''}</Button>)}
              </div>
            </Field>
          )}
          {choice === 'confirmed' && (
            <Field label="PAT level after probation">
              <div className="flex gap-2">
                {PAT_LEVELS.map((l) => <button key={l} type="button" onClick={() => setLevel(l)} className={cx('rounded-lg border px-3 py-1.5 text-sm', level === l ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white')}>{PAT_LEVEL_LABEL[l]}</button>)}
              </div>
            </Field>
          )}
          <Field label={choice === 'not_passed' ? 'Reason' : 'Notes (optional)'} hint="Only the PAT Manager and Master Owner see this. It's included in the email to HR.">
            <Textarea id={`pb-note-${u.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" variant={choice === 'not_passed' ? 'danger' : 'primary'}>{choice === 'extend' ? 'Extend probation' : 'Record decision'}</Button>
            <Button type="button" variant="secondary" onClick={() => setChoice(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Probation card for a PAT's staff page (PAT Manager and Master Owner only). */
export function ProbationCard({ user }: { user: User }) {
  const { db } = useDb()
  const row = probationRows(db).find((r) => r.user.id === user.id)
  if (!row) return null
  const { probation: p, status } = row
  return (
    <Card title={<span className="flex items-center gap-2">Probation <ProbationBadge status={status} /></span>}>
      <ProbationTimeline row={row} />
      <div className="mt-4"><ProbationActions row={row} /></div>
      {p.events.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
          {p.events.slice().reverse().map((e, i) => (
            <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-slate-400">{fmtDateTime(e.at)}</span><span>{e.text} <span className="text-slate-400">· {userName(db, e.by)}</span></span></li>
          ))}
        </ul>
      )}
    </Card>
  )
}
