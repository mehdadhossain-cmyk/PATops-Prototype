import { useMemo, useState } from 'react'
import { fmtDate, fmtDateTime, studentName, userName, visibleStudents } from '../data/logic'
import { WELLBEING_CATEGORY_LABEL, type WellbeingCase, type WellbeingCategory } from '../data/types'
import { nextOpenCycle, planCycles, type CycleStatus } from '../data/wellbeing'
import { useDb } from '../store/db'
import { Badge, Button, Field, Input, Modal, Select, Tabs, Textarea, cx } from './ui'

export function WellbeingBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-teal-800" title="On a wellbeing plan">♥ Wellbeing plan</span>
}

export function CaseStatusBadge({ c }: { c: WellbeingCase }) {
  const map = {
    form_sent: ['Form sent', 'slate'],
    submitted: ['Awaiting decision', 'purple'],
    approved: ['Plan active', 'green'],
    declined: ['Declined', 'red'],
    closed: ['Plan closed', 'slate'],
  } as const
  const [label, tone] = map[c.status]
  return <Badge tone={tone}>{label}</Badge>
}

const cycleStyle: Record<CycleStatus, [string, string]> = {
  complete: ['bg-emerald-500 text-white', 'Held and logged'],
  log_pending: ['bg-amber-300 text-amber-950', 'Held, log pending'],
  log_overdue: ['bg-rose-500 text-white', 'Held, log overdue'],
  overdue: ['bg-rose-100 text-rose-700 ring-1 ring-rose-400', 'Not held'],
  due: ['bg-brand-100 text-brand-700 ring-1 ring-brand-500', 'Due now'],
  upcoming: ['bg-slate-100 text-slate-400', 'Upcoming'],
}

/** One chip per fortnight of the plan. */
export function CycleStrip({ c }: { c: WellbeingCase }) {
  const { db } = useDb()
  const cycles = planCycles(c, db.wellbeingMeetings)
  if (cycles.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {cycles.map((cy) => {
        const [cls, label] = cycleStyle[cy.status]
        return (
          <span
            key={cy.index}
            title={`Fortnight ${cy.index + 1} · due ${fmtDate(cy.due)} · ${label}${cy.meeting?.outcome === 'no_show' ? ' (student did not attend)' : ''}`}
            className={cx('inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums', cls)}
          >
            {cy.meeting?.outcome === 'no_show' ? '✕' : cy.index + 1}
          </span>
        )
      })}
    </div>
  )
}

export function CycleLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {(['complete', 'log_pending', 'log_overdue', 'overdue', 'due', 'upcoming'] as CycleStatus[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cx('inline-block h-3 w-3 rounded', cycleStyle[s][0])} />
          {cycleStyle[s][1]}
        </span>
      ))}
      <span>✕ student did not attend</span>
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

/** Buttons for the next step of a case, with their small forms. */
export function CaseActionButtons({ c, compact }: { c: WellbeingCase; compact?: boolean }) {
  const { db, markFormSubmitted, recordDecision, closeCase, markMeetingLogged } = useDb()
  const [open, setOpen] = useState<'returned' | 'decision' | 'meeting' | 'close' | null>(null)
  const pendingLog = planCycles(c, db.wellbeingMeetings).filter((cy) => cy.status === 'log_pending' || cy.status === 'log_overdue')
  const size = compact ? 'px-2.5 py-1.5 text-xs' : ''

  return (
    <div className="flex flex-wrap gap-2">
      {c.status === 'form_sent' && <Button className={size} variant="secondary" onClick={() => setOpen('returned')}>Form returned</Button>}
      {c.status === 'submitted' && <Button className={size} variant="secondary" onClick={() => setOpen('decision')}>Record decision</Button>}
      {c.status === 'approved' && (
        <>
          {pendingLog.map((cy) => (
            <Button key={cy.index} className={size} variant={cy.status === 'log_overdue' ? 'danger' : 'secondary'} onClick={() => markMeetingLogged(cy.meeting!.id)}>
              Mark fortnight {cy.index + 1} logged
            </Button>
          ))}
          <Button className={size} onClick={() => setOpen('meeting')}>Record meeting</Button>
          {!compact && <Button className={size} variant="ghost" onClick={() => setOpen('close')}>Close plan</Button>}
        </>
      )}

      {open === 'returned' && (
        <DateReasonModal title="Form returned by student" dateLabel="Date the student submitted the form" onClose={() => setOpen(null)} onSave={(d) => markFormSubmitted(c.id, new Date(d).toISOString())} />
      )}
      {open === 'decision' && <DecisionModal onClose={() => setOpen(null)} onSave={(approved, d, reason) => recordDecision(c.id, approved, new Date(d).toISOString(), reason)} />}
      {open === 'close' && (
        <DateReasonModal title="Close wellbeing plan" reasonLabel="Reason" reasonPlaceholder="e.g. Circumstances resolved; agreed with the wellbeing team" onClose={() => setOpen(null)} onSave={(_, r) => closeCase(c.id, r)} />
      )}
      {open === 'meeting' && <RecordMeetingModal c={c} onClose={() => setOpen(null)} />}
    </div>
  )
}

function DateReasonModal({ title, dateLabel, reasonLabel, reasonPlaceholder, onClose, onSave }: { title: string; dateLabel?: string; reasonLabel?: string; reasonPlaceholder?: string; onClose: () => void; onSave: (date: string, reason: string) => void }) {
  const [date, setDate] = useState(today())
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <Modal open title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (dateLabel && (!date || date > today())) return setError('Choose a date that is not in the future')
          if (reasonLabel && reason.trim().length < 3) return setError('Add a reason')
          onSave(date, reason.trim())
          onClose()
        }}
      >
        {dateLabel && <Field label={dateLabel}><Input id="wb-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
        {reasonLabel && <Field label={reasonLabel}><Textarea id="wb-reason" rows={2} value={reason} placeholder={reasonPlaceholder} onChange={(e) => setReason(e.target.value)} /></Field>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  )
}

function DecisionModal({ onClose, onSave }: { onClose: () => void; onSave: (approved: boolean, date: string, reason: string) => void }) {
  const [approved, setApproved] = useState<'yes' | 'no'>('yes')
  const [date, setDate] = useState(today())
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <Modal open title="Wellbeing team decision" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!date || date > today()) return setError('Choose a date that is not in the future')
          if (approved === 'no' && reason.trim().length < 3) return setError('Add the reason the wellbeing team gave')
          onSave(approved === 'yes', date, reason.trim())
          onClose()
        }}
      >
        <p className="text-sm text-slate-500">Record the decision the wellbeing team sent you. If approved, fortnightly meetings are scheduled from the decision date.</p>
        <Field label="Decision" group>
          <Tabs value={approved} onChange={setApproved} options={[{ value: 'yes', label: 'Approved' }, { value: 'no', label: 'Declined' }]} />
        </Field>
        <Field label="Decision date"><Input id="wb-decision-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {approved === 'no' && <Field label="Reason given"><Textarea id="wb-decline" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save decision</Button>
        </div>
      </form>
    </Modal>
  )
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

function RecordMeetingModal({ c, onClose }: { c: WellbeingCase; onClose: () => void }) {
  const { db, recordMeeting } = useDb()
  const cycle = nextOpenCycle(c, db.wellbeingMeetings)
  const [heldAt, setHeldAt] = useState(toLocalInput(new Date()))
  const [outcome, setOutcome] = useState<'held' | 'no_show'>('held')
  const [recorded, setRecorded] = useState(false)
  const [logged, setLogged] = useState(false)
  const [addToCallLog, setAddToCallLog] = useState(true)
  const [error, setError] = useState('')
  const student = db.students.find((s) => s.id === c.studentId)

  return (
    <Modal open title={`Wellbeing meeting · fortnight ${cycle + 1}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const d = new Date(heldAt)
          if (isNaN(+d) || d.getTime() > Date.now() + 60000) return setError('The meeting time cannot be in the future')
          if (outcome === 'held' && !recorded) return setError('Wellbeing meetings must be recorded on Teams. Tick the box to confirm it was.')
          recordMeeting(c.id, { heldAt: d.toISOString(), outcome, recorded: outcome === 'held' ? recorded : false, logged, addToCallLog })
          onClose()
        }}
      >
        <p className="text-sm text-slate-600">{student && studentName(student)}</p>
        <Field label="Meeting on Teams" group>
          <Tabs value={outcome} onChange={setOutcome} options={[{ value: 'held', label: 'Meeting held' }, { value: 'no_show', label: 'Student did not attend' }]} />
        </Field>
        <Field label="When"><Input id="wb-held" type="datetime-local" max={toLocalInput(new Date())} value={heldAt} onChange={(e) => setHeldAt(e.target.value)} /></Field>
        {outcome === 'held' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={recorded} onChange={(e) => setRecorded(e.target.checked)} />
            <span>The meeting was <strong>recorded on Teams</strong></span>
          </label>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={logged} onChange={(e) => setLogged(e.target.checked)} />
          <span>I have <strong>logged the support in the wellbeing team's system</strong> following their guideline. If not yet, you can mark it later.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={addToCallLog} onChange={(e) => setAddToCallLog(e.target.checked)} />
          <span>Also add this to my call log (no health details are copied)</span>
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save meeting</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Start a referral: the PAT has sent the wellbeing form to a student. */
export function SendFormModal({ open, studentId, onClose }: { open: boolean; studentId?: string; onClose: () => void }) {
  if (!open) return null
  return <SendFormForm studentId={studentId} onClose={onClose} />
}

function SendFormForm({ studentId, onClose }: { studentId?: string; onClose: () => void }) {
  const { db, me, sendWellbeingForm } = useDb()
  const [sid, setSid] = useState(studentId ?? '')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<WellbeingCategory>('health')
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')
  const open = new Set(db.wellbeingCases.filter((c) => c.status !== 'declined' && c.status !== 'closed').map((c) => c.studentId))
  const candidates = useMemo(() => (me ? visibleStudents(db, me).filter((s) => s.status === 'active') : []), [db, me])
  const matches = search.trim().length >= 2 ? candidates.filter((s) => `${studentName(s)} ${s.ebsPersonCode}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : []
  const chosen = db.students.find((s) => s.id === sid)

  return (
    <Modal open title="Send wellbeing form" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!sid) return setError('Choose a student')
          if (open.has(sid)) return setError('This student already has an open wellbeing referral or plan')
          if (!date || date > today()) return setError('Choose a date that is not in the future')
          sendWellbeingForm(sid, category, new Date(date).toISOString())
          onClose()
        }}
      >
        <p className="text-sm text-slate-500">Record that you've sent the wellbeing form. PATops then reminds you to chase it if it isn't returned within a week.</p>
        {chosen ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span>{studentName(chosen)} <span className="font-mono text-xs text-slate-400">{chosen.ebsPersonCode}</span></span>
            {!studentId && <button type="button" className="text-brand-600 hover:underline" onClick={() => setSid('')}>Change</button>}
          </div>
        ) : (
          <Field label="Student" group>
            <div className="relative">
              <Input id="wb-student-search" placeholder="Type a name or EBS code…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { setSid(s.id); setSearch('') }}>
                        <span>{studentName(s)}</span>
                        {open.has(s.id) && <span className="text-xs text-teal-700">already open</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        )}
        <Field label="Broad category" hint="Keep details in the wellbeing system. PATops only stores the category.">
          <Select id="wb-category" value={category} onChange={(e) => setCategory(e.target.value as WellbeingCategory)}>
            {(Object.keys(WELLBEING_CATEGORY_LABEL) as WellbeingCategory[]).map((k) => <option key={k} value={k}>{WELLBEING_CATEGORY_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Date form sent"><Input id="wb-sent" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Full history of one case, for the student page. */
export function CaseDetail({ c }: { c: WellbeingCase }) {
  const { db } = useDb()
  const meetings = db.wellbeingMeetings.filter((m) => m.caseId === c.id).sort((a, b) => b.cycle - a.cycle)
  const steps = [
    ['Form sent', c.formSentAt, userName(db, c.formSentBy)],
    ['Form returned', c.submittedAt, null],
    [c.status === 'declined' ? 'Declined by wellbeing team' : 'Approved by wellbeing team', c.decisionAt, c.decisionRecordedBy ? `recorded by ${userName(db, c.decisionRecordedBy)}` : null],
    ['Plan closed', c.closedAt, c.closeReason || null],
  ] as const

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CaseStatusBadge c={c} />
        <span className="text-sm text-slate-600">{WELLBEING_CATEGORY_LABEL[c.category]}</span>
      </div>
      <ol className="grid gap-2 text-sm sm:grid-cols-4">
        {steps.map(([label, at, note]) => (
          <li key={label} className={cx('rounded-lg border p-2.5', at ? 'border-slate-200' : 'border-dashed border-slate-200 text-slate-400')}>
            <div className="font-medium">{label}</div>
            <div className="text-xs">{at ? fmtDate(at) : '—'}</div>
            {at && note && <div className="text-xs text-slate-500">{note}</div>}
          </li>
        ))}
      </ol>
      {c.status === 'declined' && c.declineReason && <p className="text-sm text-slate-600">Reason: {c.declineReason}</p>}
      {c.planStart && (
        <>
          <div>
            <div className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">Fortnightly meetings</div>
            <CycleStrip c={c} />
          </div>
          {meetings.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {meetings.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    Fortnight {m.cycle + 1} · {fmtDateTime(m.heldAt)} · {m.outcome === 'held' ? `held${m.recorded ? ', recorded' : ''}` : 'student did not attend'}
                  </span>
                  <span className={m.loggedAt ? 'text-emerald-700' : 'text-amber-700'}>{m.loggedAt ? `Logged ${fmtDate(m.loggedAt)}` : 'Not yet logged'}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <CaseActionButtons c={c} />
    </div>
  )
}
