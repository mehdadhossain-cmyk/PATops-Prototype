import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { channelsLabel, fmtDate, fmtDateTime, studentName, userName, visibleGroups, visibleStudents } from '../data/logic'
import {
  CHANNEL_LABEL,
  OUTCOME_LABEL,
  REASON_LABEL,
  type Channel,
  type CommLog,
  type ContactOutcome,
  type ContactReason,
} from '../data/types'
import { useDb, type NewCommInput } from '../store/db'
import { Badge, Button, Field, Input, Modal, Select, Tabs, Textarea, cx } from './ui'

export const CHANNEL_ICON: Record<Channel, string> = {
  in_person: '👤',
  phone: '📞',
  sms: '💬',
  email: '✉',
  whatsapp: '🟢',
  teams: '🎥',
}

/** Display order for channels. */
const CHANNEL_ORDER: Channel[] = ['phone', 'whatsapp', 'email', 'sms', 'in_person', 'teams']

const toLocalInput = (d: Date) => {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

type Mode = 'individual' | 'announcement'

/** One form for logging a contact with one or more students, or an announcement to groups. */
export function LogContactModal({
  open,
  onClose,
  initialMode = 'individual',
  studentIds = [],
  groupIds = [],
}: {
  open: boolean
  onClose: (saved?: string) => void
  initialMode?: Mode
  studentIds?: string[]
  groupIds?: string[]
}) {
  if (!open) return null
  return <LogContactForm onClose={onClose} initialMode={initialMode} studentIds={studentIds} groupIds={groupIds} />
}

function LogContactForm({ onClose, initialMode, studentIds, groupIds }: { onClose: (saved?: string) => void; initialMode: Mode; studentIds: string[]; groupIds: string[] }) {
  const { db, me, addComms } = useDb()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [students, setStudents] = useState<string[]>(studentIds)
  const [groups, setGroups] = useState<string[]>(groupIds)
  const [search, setSearch] = useState('')
  const [channels, setChannels] = useState<Channel[]>([initialMode === 'announcement' ? 'whatsapp' : 'phone'])
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [outcome, setOutcome] = useState<ContactOutcome>('reached')
  const [reason, setReason] = useState<ContactReason>(initialMode === 'announcement' ? 'admin' : 'attendance')
  const [summary, setSummary] = useState('')
  const [when, setWhen] = useState(toLocalInput(new Date()))
  const [followUp, setFollowUp] = useState('')
  const [error, setError] = useState('')

  const myStudents = useMemo(() => (me ? visibleStudents(db, me).filter((s) => s.status !== 'withdrawn') : []), [db, me])
  const myGroups = useMemo(() => (me ? visibleGroups(db, me) : []), [db, me])
  const matches = search.trim().length >= 2
    ? myStudents
        .filter((s) => !students.includes(s.id) && `${studentName(s)} ${s.ebsPersonCode} ${s.uniStudentId}`.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 8)
    : []
  const groupCode = (id: string) => db.groups.find((g) => g.id === id)?.code ?? ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const at = new Date(when)
    if (mode === 'individual' && students.length === 0) return setError('Choose at least one student')
    if (mode === 'announcement' && groups.length === 0) return setError('Choose at least one group')
    if (channels.length === 0) return setError('Choose at least one channel')
    if (summary.trim().length < 5) return setError('Add a short summary of what was discussed or sent')
    if (isNaN(+at) || at.getTime() > Date.now() + 60000) return setError('The contact time cannot be in the future')
    if (followUp && followUp < new Date().toISOString().slice(0, 10)) return setError('The follow-up date is in the past')
    const base = {
      channels: CHANNEL_ORDER.filter((c) => channels.includes(c)),
      direction: mode === 'announcement' ? 'outbound' : direction,
      outcome: mode === 'announcement' ? 'reached' : outcome,
      reason,
      summary: summary.trim(),
      at: at.toISOString(),
      followUpDate: mode === 'announcement' ? null : followUp || null,
    } as const
    const entries: NewCommInput[] =
      mode === 'individual'
        ? students.map((sid) => ({ ...base, kind: 'individual', studentId: sid, groupIds: [] }))
        : [{ ...base, kind: 'announcement', studentId: null, groupIds: groups }]
    addComms(entries)
    onClose(mode === 'individual' ? `Logged contact with ${students.length} student${students.length > 1 ? 's' : ''}` : `Logged announcement to ${groups.length} group${groups.length > 1 ? 's' : ''}`)
  }

  const options: Channel[] = mode === 'announcement' ? CHANNEL_ORDER.filter((c) => c !== 'phone') : CHANNEL_ORDER
  const toggleChannel = (c: Channel) => { setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c]); setError('') }

  return (
    <Modal open title="Log contact" onClose={() => onClose()} wide>
      <form onSubmit={submit} className="space-y-4">
        <Tabs
          value={mode}
          onChange={(m) => { setMode(m); setError(''); if (m === 'announcement' && channels.includes('phone')) setChannels(channels.filter((c) => c !== 'phone').length ? channels.filter((c) => c !== 'phone') : ['whatsapp']) }}
          options={[{ value: 'individual', label: 'Contact with student(s)' }, { value: 'announcement', label: 'Group announcement' }]}
        />

        {mode === 'individual' ? (
          <Field label="Student(s)" group hint="Add several students to log the same contact for each, e.g. a small group meeting.">
            <div className="flex flex-wrap gap-1.5">
              {students.map((id) => {
                const s = db.students.find((x) => x.id === id)
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-0.5 pr-1 pl-2.5 text-sm text-brand-700">
                    {s ? studentName(s) : id}
                    <button type="button" onClick={() => setStudents(students.filter((x) => x !== id))} className="rounded-full px-1 hover:bg-brand-500/20" aria-label="Remove">✕</button>
                  </span>
                )
              })}
            </div>
            <div className="relative mt-2">
              <Input id="log-student-search" placeholder="Type a name, EBS code or uni ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { setStudents([...students, s.id]); setSearch('') }}>
                        <span>{studentName(s)}</span>
                        <span className="font-mono text-xs text-slate-400">{groupCode(s.groupId)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        ) : (
          <Field label="Group(s)" group>
            <div className="flex flex-wrap gap-2">
              {myGroups.map((g) => (
                <label key={g.id} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm', groups.includes(g.id) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300')}>
                  <input type="checkbox" checked={groups.includes(g.id)} onChange={() => setGroups(groups.includes(g.id) ? groups.filter((x) => x !== g.id) : [...groups, g.id])} />
                  {g.code}
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field label="Channel(s)" group hint="Choose every channel used, e.g. a phone call followed by a WhatsApp message.">
          <div className="flex flex-wrap gap-2">
            {options.map((c) => (
              <button type="button" key={c} aria-pressed={channels.includes(c)} onClick={() => toggleChannel(c)} className={cx('rounded-lg border px-3 py-1.5 text-sm', channels.includes(c) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50')}>
                {channels.includes(c) ? '✓ ' : ''}{CHANNEL_ICON[c]} {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>

        {mode === 'individual' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who started it?" group>
              <Tabs value={direction} onChange={setDirection} options={[{ value: 'outbound', label: 'I contacted them' }, { value: 'inbound', label: 'They contacted me' }]} />
            </Field>
            <Field label="Outcome" group>
              <Tabs value={outcome} onChange={setOutcome} options={(Object.keys(OUTCOME_LABEL) as ContactOutcome[]).map((o) => ({ value: o, label: OUTCOME_LABEL[o] }))} />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reason">
            <Select id="log-reason" value={reason} onChange={(e) => setReason(e.target.value as ContactReason)}>
              {(Object.keys(REASON_LABEL) as ContactReason[]).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="When">
            <Input id="log-when" type="datetime-local" value={when} max={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>

        <Field label={mode === 'announcement' ? 'Message sent' : 'Summary'} hint="Be factual. This record may be used when decisions are made about the student.">
          <Textarea id="log-summary" rows={3} value={summary} onChange={(e) => { setSummary(e.target.value); setError('') }} placeholder={mode === 'announcement' ? 'e.g. Reminder: Assessment 1 is due Friday 5pm.' : 'e.g. Missed two sessions due to childcare; will attend Tuesday.'} />
        </Field>

        {mode === 'individual' && (
          <Field label="Follow-up" group>
            <div className="flex flex-wrap items-center gap-2">
              {[['None', ''], ['In 2 days', addDays(2)], ['In 1 week', addDays(7)]].map(([label, v]) => (
                <button type="button" key={label} onClick={() => setFollowUp(v)} className={cx('rounded-lg border px-3 py-1.5 text-sm', followUp === v ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 hover:bg-slate-50')}>
                  {label}
                </button>
              ))}
              <Input id="log-followup" type="date" value={followUp} min={addDays(0)} onChange={(e) => setFollowUp(e.target.value)} className="w-44" />
            </div>
          </Field>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose()}>Cancel</Button>
          <Button type="submit">Save to call log</Button>
        </div>
      </form>
    </Modal>
  )
}

/** A single call-log entry, used in lists and timelines. */
export function CommEntry({ c, showStudent = true, showAuthor = true }: { c: CommLog; showStudent?: boolean; showAuthor?: boolean }) {
  const { db, me, completeFollowUp, voidComm } = useDb()
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const student = c.studentId ? db.students.find((s) => s.id === c.studentId) : null
  const today = new Date().toISOString().slice(0, 10)
  const mine = me?.id === c.authorId

  return (
    <li className={cx('flex gap-3 py-3', c.voidedAt && 'opacity-50')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base" title={channelsLabel(c)}>
        {c.kind === 'announcement' ? '📣' : CHANNEL_ICON[c.channels[0]]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {c.kind === 'announcement' ? (
            <span className="font-medium">
              Announcement to{' '}
              {c.groupIds.map((g, i) => (
                <span key={g}>{i > 0 && ', '}<Link to={`/groups/${g}`} className="font-mono text-brand-700 hover:underline">{db.groups.find((x) => x.id === g)?.code}</Link></span>
              ))}
            </span>
          ) : (
            showStudent && student && <Link to={`/students/${student.id}`} className="font-medium hover:text-brand-600">{studentName(student)}</Link>
          )}
          <span className="text-slate-500">
            {channelsLabel(c)}
            {c.kind === 'individual' && ` · ${c.direction === 'outbound' ? 'outgoing' : 'incoming'}`}
          </span>
          {c.kind === 'individual' && <Badge>{REASON_LABEL[c.reason]}</Badge>}
          {c.kind === 'individual' && c.outcome !== 'reached' && <Badge tone="amber">{OUTCOME_LABEL[c.outcome]}</Badge>}
          {c.voidedAt && <Badge tone="red">Entered in error</Badge>}
        </div>
        <p className={cx('mt-0.5 text-sm text-slate-700', c.voidedAt && 'line-through')}>{c.summary}</p>
        {c.voidedAt && <p className="text-xs text-rose-600">Voided: {c.voidReason}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>{fmtDateTime(c.at)}</span>
          {showAuthor && <span>by {userName(db, c.authorId)}</span>}
          {c.followUpDate && !c.voidedAt && (
            c.followUpDoneAt ? (
              <span className="text-emerald-600">✓ Follow-up done {fmtDate(c.followUpDoneAt)}</span>
            ) : (
              <span className={cx(c.followUpDate < today ? 'font-medium text-rose-600' : 'text-amber-700')}>
                Follow up {c.followUpDate < today ? 'overdue since' : 'by'} {fmtDate(c.followUpDate)}
                {mine && <button onClick={() => completeFollowUp(c.id)} className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">Mark done</button>}
              </span>
            )
          )}
          {mine && !c.voidedAt && !voiding && <button onClick={() => setVoiding(true)} className="hover:text-rose-600 hover:underline">Entered in error?</button>}
        </div>
        {voiding && (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (reason.trim().length < 3) return
              voidComm(c.id, reason.trim())
              setVoiding(false)
            }}
          >
            <Input id={`void-${c.id}`} autoFocus placeholder="Why? e.g. logged against the wrong student" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm py-1.5" />
            <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>Mark as entered in error</Button>
            <Button type="button" variant="secondary" onClick={() => setVoiding(false)}>Cancel</Button>
          </form>
        )}
      </div>
    </li>
  )
}

/** Small success banner shown after logging. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [message, onDone])
  if (!message) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg" role="status">
      ✓ {message}
    </div>
  )
}
