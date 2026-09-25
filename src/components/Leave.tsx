import { useMemo, useState } from 'react'
import { campusName, fmtDate, fmtDateTime, userName } from '../data/logic'
import { canDecide, coverCandidates, needsLeadApproval, sessionsToCover, slotsFor, weekdayOf, workingDays } from '../data/leave'
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, type LeaveRequest, type LeaveType } from '../data/types'
import { useDb } from '../store/db'
import { Badge, Button, Field, Input, Modal, Select, Textarea, cx } from './ui'

export function LeaveStatusBadge({ r }: { r: LeaveRequest }) {
  const tone = { awaiting_cover: 'amber', awaiting_lead: 'purple', awaiting_manager: 'blue', approved: 'green', rejected: 'red', cancelled: 'slate' } as const
  return <Badge tone={tone[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge>
}

export const fmtRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`)

/** Submitted → cover → lead → manager, with who and when. */
export function LeaveTimeline({ r }: { r: LeaveRequest }) {
  const { db } = useDb()
  const requester = db.users.find((u) => u.id === r.requesterId)!
  const slots = slotsFor(db, r.id)
  const accepted = slots.filter((s) => s.status === 'accepted').length
  const declined = slots.some((s) => s.status === 'declined')
  const lead = needsLeadApproval(db, requester)
  type Step = { label: string; state: 'done' | 'current' | 'todo' | 'failed' | 'skipped'; detail: string }
  const done = (cond: boolean) => (cond ? 'done' : 'todo')
  const steps: Step[] = [
    { label: 'Requested', state: 'done', detail: fmtDateTime(r.createdAt) },
    {
      label: 'Cover accepted',
      state: slots.length === 0 ? 'skipped' : accepted === slots.length ? 'done' : r.status === 'awaiting_cover' ? (declined ? 'failed' : 'current') : done(false),
      detail: slots.length === 0 ? 'No classes to cover' : `${accepted} of ${slots.length} sessions${declined ? ' · one declined' : ''}`,
    },
    ...(lead
      ? [{
          label: 'PAT Lead',
          state: r.leadDecision ? (r.leadDecision.approved ? 'done' : 'failed') : r.status === 'awaiting_lead' ? 'current' : 'todo',
          detail: r.leadDecision ? `${r.leadDecision.approved ? 'Approved' : 'Rejected'} by ${userName(db, r.leadDecision.by)} · ${fmtDate(r.leadDecision.at)}` : '',
        } as Step]
      : []),
    {
      label: 'PAT Manager',
      state: r.managerDecision ? (r.managerDecision.approved ? 'done' : 'failed') : r.status === 'awaiting_manager' ? 'current' : 'todo',
      detail: r.managerDecision ? `${r.managerDecision.approved ? 'Approved' : 'Rejected'} by ${userName(db, r.managerDecision.by)} · ${fmtDate(r.managerDecision.at)}` : '',
    },
  ]
  const dot = { done: 'bg-emerald-500 text-white', current: 'bg-brand-600 text-white', todo: 'bg-slate-200 text-slate-500', failed: 'bg-rose-500 text-white', skipped: 'bg-slate-200 text-slate-400' }
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.label} className={cx('rounded-lg border p-2.5 text-sm', s.state === 'current' ? 'border-brand-500 bg-brand-50' : 'border-slate-200')}>
          <div className="flex items-center gap-2">
            <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold', dot[s.state])}>{s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : i + 1}</span>
            <span className="font-medium">{s.label}</span>
          </div>
          {s.detail && <div className="mt-1 text-xs text-slate-500">{s.detail}</div>}
        </li>
      ))}
    </ol>
  )
}

/** Full request: dates, covers, decisions and the actions available to the viewer. */
export function LeaveDetailModal({ leaveId, onClose }: { leaveId: string; onClose: () => void }) {
  const { db, me, decideLeave, cancelLeave, replaceCover } = useDb()
  const [note, setNote] = useState('')
  const [replacing, setReplacing] = useState<string | null>(null)
  const [choice, setChoice] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const r = db.leaveRequests.find((x) => x.id === leaveId)
  if (!r || !me) return null
  const requester = db.users.find((u) => u.id === r.requesterId)!
  const slots = slotsFor(db, r.id)
  const mine = me.id === r.requesterId
  const decider = canDecide(db, me, r)
  const days = workingDays(requester, r.startDate, r.endDate).length
  const open = ['awaiting_cover', 'awaiting_lead', 'awaiting_manager', 'approved'].includes(r.status)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Modal open title={`${LEAVE_TYPE_LABEL[r.type]} · ${requester.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <LeaveStatusBadge r={r} />
          <span className="font-medium">{fmtRange(r.startDate, r.endDate)}</span>
          <span className="text-slate-500">{days} working day{days === 1 ? '' : 's'} · {campusName(db, requester.campusId)}</span>
          {r.reason && <span className="basis-full text-slate-600">Reason: {r.reason}</span>}
        </div>
        <LeaveTimeline r={r} />

        <div>
          <h3 className="mb-2 text-sm font-medium">Classes to cover</h3>
          {slots.length === 0 ? (
            <p className="text-sm text-slate-500">No classes fall in these dates, so no cover is needed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-100"><th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Group</th><th className="py-1.5 pr-3">Cover</th><th className="py-1.5 pr-3">Response</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slots.map((s) => {
                    const g = db.groups.find((x) => x.id === s.groupId)!
                    return (
                      <tr key={s.id} className="align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{weekdayOf(s.date)} {fmtDate(s.date)}</td>
                        <td className="py-2 pr-3"><span className="font-mono text-xs">{g.code}</span><div className="text-xs text-slate-500">{g.startTime}–{g.endTime}</div></td>
                        <td className="py-2 pr-3">{userName(db, s.coverPatId)}</td>
                        <td className="py-2 pr-3">
                          <Badge tone={s.status === 'accepted' ? 'green' : s.status === 'declined' ? 'red' : 'amber'}>{s.status === 'pending' ? 'Waiting' : s.status === 'accepted' ? 'Accepted' : 'Declined'}</Badge>
                          {s.note && <div className="mt-1 text-xs text-slate-500">“{s.note}”</div>}
                        </td>
                        <td className="py-2 text-right">
                          {mine && r.status === 'awaiting_cover' && s.status !== 'accepted' && replacing !== s.id && (
                            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => { setReplacing(s.id); setChoice('') }}>Ask someone else</Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {replacing && (() => {
            const s = slots.find((x) => x.id === replacing)!
            const g = db.groups.find((x) => x.id === s.groupId)!
            const others = slots.filter((x) => x.id !== s.id).map((x) => ({ date: x.date, groupId: x.groupId, coverPatId: x.coverPatId }))
            const cands = coverCandidates(db, { date: s.date, group: g }, r.requesterId, others).filter((c) => c.user.id !== s.coverPatId)
            const picked = cands.find((c) => c.user.id === choice)
            return (
              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                <Field label={`New cover for ${g.code} on ${fmtDate(s.date)}`}>
                  <Select id="replace-cover" value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">Choose a PAT…</option>
                    {cands.map((c) => <option key={c.user.id} value={c.user.id} disabled={c.blocked}>{c.user.name}{c.warnings.length ? ` · ${c.warnings.join('; ')}` : ' · available'}</option>)}
                  </Select>
                </Field>
                {picked && picked.warnings.length > 0 && <p className="text-xs text-amber-700">⚠ {picked.warnings.join(' · ')}</p>}
                <div className="flex gap-2">
                  <Button disabled={!choice} onClick={() => { replaceCover(s.id, choice); setReplacing(null) }}>Send request</Button>
                  <Button variant="secondary" onClick={() => setReplacing(null)}>Cancel</Button>
                </div>
              </div>
            )
          })()}
        </div>

        {(r.leadDecision?.note || r.managerDecision?.note) && (
          <div className="space-y-1 text-sm">
            {r.leadDecision?.note && <p><span className="text-slate-500">PAT Lead:</span> {r.leadDecision.note}</p>}
            {r.managerDecision?.note && <p><span className="text-slate-500">PAT Manager:</span> {r.managerDecision.note}</p>}
          </div>
        )}

        {decider && (
          <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <h3 className="text-sm font-medium">Your decision as {r.status === 'awaiting_lead' ? 'PAT Lead' : 'PAT Manager'}</h3>
            <Textarea id="leave-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note (required when rejecting)" />
            <div className="flex gap-2">
              <Button onClick={() => { decideLeave(r.id, true, note.trim()); onClose() }}>Approve</Button>
              <Button variant="danger" disabled={note.trim().length < 3} onClick={() => { decideLeave(r.id, false, note.trim()); onClose() }}>Reject</Button>
            </div>
          </div>
        )}

        {mine && open && r.endDate >= today && (
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
            {!confirmCancel ? (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel this request</Button>
            ) : (
              <>
                <span>Cancel this leave request? Your covers will be released.</span>
                <Button variant="danger" onClick={() => { cancelLeave(r.id); onClose() }}>Yes, cancel it</Button>
                <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep it</Button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

/** Three-step request: dates → covers → review. */
export function NewLeaveModal({ onClose }: { onClose: (msg?: string) => void }) {
  const { db, me, submitLeave } = useDb()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [type, setType] = useState<LeaveType>('annual')
  const [start, setStart] = useState(addDays(14))
  const [end, setEnd] = useState(addDays(15))
  const [reason, setReason] = useState('')
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const sessions = useMemo(() => (me ? sessionsToCover(db, me.id, start, end) : []), [db, me, start, end])
  if (!me) return null
  const key = (s: { date: string; group: { id: string } }) => `${s.date}|${s.group.id}`
  const days = workingDays(me, start, end).length
  const draft = (except?: string) => sessions.filter((s) => key(s) !== except && covers[key(s)]).map((s) => ({ date: s.date, groupId: s.group.id, coverPatId: covers[key(s)] }))
  const today = addDays(0)

  const suggest = () => {
    const next: Record<string, string> = {}
    for (const s of sessions) {
      const d = sessions.filter((x) => next[key(x)]).map((x) => ({ date: x.date, groupId: x.group.id, coverPatId: next[key(x)] }))
      const best = coverCandidates(db, s, me.id, d).find((c) => !c.blocked)
      if (best) next[key(s)] = best.user.id
    }
    setCovers(next)
    setError('')
  }

  return (
    <Modal open title="Request leave" onClose={() => onClose()} wide>
      <div className="mb-4 flex gap-2 text-xs">
        {['Dates', 'Covers', 'Review'].map((l, i) => (
          <span key={l} className={cx('rounded-full px-3 py-1 font-medium', step === i + 1 ? 'bg-brand-600 text-white' : step > i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
            {i + 1}. {l}
          </span>
        ))}
      </div>

      {step === 1 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!start || !end || end < start) return setError('The end date must be on or after the start date')
            if (start < today) return setError('Leave must start today or later')
            if (days === 0) return setError("None of these dates are your working days")
            setError('')
            setStep(sessions.length ? 2 : 3)
          }}
        >
          <Field label="Type of leave">
            <Select id="leave-type" value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
              {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day off"><Input id="leave-start" type="date" min={today} value={start} onChange={(e) => { setStart(e.target.value); setCovers({}) }} /></Field>
            <Field label="Last day off"><Input id="leave-end" type="date" min={start} value={end} onChange={(e) => { setEnd(e.target.value); setCovers({}) }} /></Field>
          </div>
          <Field label="Reason (optional)"><Input id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {days} working day{days === 1 ? '' : 's'} · {sessions.length ? `${sessions.length} class session${sessions.length === 1 ? '' : 's'} will need cover` : 'no classes need cover'}
          </p>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onClose()}>Cancel</Button><Button type="submit">Next</Button></div>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Choose who will cover each class. Colleagues are listed best match first; anyone on leave or teaching at the same time can't be chosen.</p>
            <Button variant="secondary" onClick={suggest}>Suggest covers</Button>
          </div>
          <div className="space-y-3">
            {sessions.map((s) => {
              const k = key(s)
              const cands = coverCandidates(db, s, me.id, draft(k))
              const picked = cands.find((c) => c.user.id === covers[k])
              return (
                <div key={k} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[12rem_1fr]">
                  <div className="text-sm">
                    <div className="font-medium">{weekdayOf(s.date)} {fmtDate(s.date)}</div>
                    <div className="font-mono text-xs text-slate-500">{s.group.code} · {s.group.startTime}–{s.group.endTime}</div>
                  </div>
                  <div>
                    <Select id={`cover-${k}`} value={covers[k] ?? ''} onChange={(e) => { setCovers({ ...covers, [k]: e.target.value }); setError('') }}>
                      <option value="">Choose a PAT…</option>
                      {cands.slice(0, 40).map((c) => (
                        <option key={c.user.id} value={c.user.id} disabled={c.blocked}>
                          {c.user.name} · {campusName(db, c.user.campusId)}{c.warnings.length ? ` · ${c.warnings.join('; ')}` : ' · available'}
                        </option>
                      ))}
                    </Select>
                    {picked && picked.warnings.length > 0 && <p className="mt-1 text-xs text-amber-700">⚠ {picked.warnings.join(' · ')}</p>}
                  </div>
                </div>
              )
            })}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => { if (sessions.some((s) => !covers[key(s)])) return setError('Choose a cover for every class'); setError(''); setStep(3) }}>Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-medium">{LEAVE_TYPE_LABEL[type]} · {fmtRange(start, end)}</div>
            <div className="text-slate-600">{days} working day{days === 1 ? '' : 's'}{reason && ` · ${reason}`}</div>
          </div>
          {sessions.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={key(s)} className="flex justify-between py-1.5">
                  <span>{weekdayOf(s.date)} {fmtDate(s.date)} · <span className="font-mono text-xs">{s.group.code}</span></span>
                  <span>{userName(db, covers[key(s)])}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-slate-600">
            What happens next: {sessions.length ? 'your covers are asked to accept, then ' : ''}
            {needsLeadApproval(db, me) ? 'your PAT Lead, then the PAT Manager approve.' : 'the PAT Manager approves.'} You'll see each step on your Leave page.
          </p>
          <div className="flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep(sessions.length ? 2 : 1)}>Back</Button>
            <Button
              onClick={() => {
                submitLeave({ type, startDate: start, endDate: end, reason: reason.trim(), covers: sessions.map((s) => ({ date: s.date, groupId: s.group.id, coverPatId: covers[key(s)] })) })
                onClose(sessions.length ? `Request sent. ${sessions.length} cover request${sessions.length === 1 ? '' : 's'} sent.` : 'Request sent for approval.')
              }}
            >
              Submit request
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
