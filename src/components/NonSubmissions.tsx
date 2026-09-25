import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtDate, fmtDateTime, studentName, userName } from '../data/logic'
import { isResolved } from '../data/submissions'
import { FOLLOW_UP_LABEL, type FollowUpStatus, type NonSubmission } from '../data/types'
import { useDb } from '../store/db'
import { Badge, Button, Input, Select, Textarea } from './ui'

export function FollowUpBadge({ status }: { status: FollowUpStatus }) {
  const tone = status === 'not_contacted' ? 'red' : isResolved(status) ? 'green' : status === 'will_submit' ? 'blue' : 'amber'
  return <Badge tone={tone}>{FOLLOW_UP_LABEL[status]}</Badge>
}

type Channel = 'phone' | 'whatsapp' | 'email' | 'sms' | 'in_person'

/** Inline editor for one non-submission follow-up. */
export function FollowUpEditor({ item, onDone }: { item: NonSubmission; onDone: () => void }) {
  const { updateNonSubmission } = useDb()
  const [status, setStatus] = useState<FollowUpStatus>(item.status === 'not_contacted' ? 'contacted' : item.status)
  const [note, setNote] = useState(item.note)
  const [expected, setExpected] = useState(item.expectedDate ?? '')
  const [channel, setChannel] = useState<Channel | ''>(item.status === 'not_contacted' ? 'phone' : '')
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form
      className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (status !== 'not_contacted' && note.trim().length < 3) return setError('Add a short note about what happened')
        if (status === 'will_submit' && (!expected || expected < today)) return setError('Add the date the student expects to submit')
        updateNonSubmission(item.id, { status, note: note.trim(), expectedDate: status === 'will_submit' ? expected : null }, channel || null)
        onDone()
      }}
    >
      <label className="text-xs font-medium text-slate-600">
        Status
        <Select id={`ns-status-${item.id}`} value={status} onChange={(e) => setStatus(e.target.value as FollowUpStatus)} className="mt-1">
          {(Object.keys(FOLLOW_UP_LABEL) as FollowUpStatus[]).map((k) => <option key={k} value={k}>{FOLLOW_UP_LABEL[k]}</option>)}
        </Select>
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
        Note
        <Textarea id={`ns-note-${item.id}`} rows={1} value={note} onChange={(e) => { setNote(e.target.value); setError('') }} className="mt-1" placeholder="What did the student say? What's next?" />
      </label>
      <label className="text-xs font-medium text-slate-600">
          Add to call log
          <Select id={`ns-channel-${item.id}`} value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')} className="mt-1">
            <option value="">No</option>
            <option value="phone">Yes · phone call</option>
            <option value="whatsapp">Yes · WhatsApp</option>
            <option value="email">Yes · email</option>
            <option value="sms">Yes · text</option>
            <option value="in_person">Yes · in person</option>
          </Select>
        </label>
      {status === 'will_submit' && (
        <label className="text-xs font-medium text-slate-600">
          Expected submission
          <Input id={`ns-exp-${item.id}`} type="date" min={today} value={expected} onChange={(e) => setExpected(e.target.value)} className="mt-1" />
        </label>
      )}
      {error && <p className="text-sm text-rose-600 sm:col-span-2 lg:col-span-4">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit">Save</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

/** Non-submissions for one student across periods (student page). */
export function StudentNonSubmissions({ studentId }: { studentId: string }) {
  const { db } = useDb()
  const [editing, setEditing] = useState<string | null>(null)
  const items = db.nonSubmissions.filter((n) => n.studentId === studentId)
  if (items.length === 0) return <p className="text-sm text-slate-500">No missed submissions recorded.</p>
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const p = db.submissionPeriods.find((x) => x.id === n.periodId)
        return (
          <li key={n.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{n.assessment}</span>
              <FollowUpBadge status={n.status} />
              <span className="text-slate-500">· {p?.name} (due {fmtDate(p?.deadline)})</span>
              {editing !== n.id && p?.status === 'open' && <button className="ml-auto text-sm text-brand-600 hover:underline" onClick={() => setEditing(n.id)}>Update</button>}
            </div>
            {n.note && <p className="mt-0.5 text-sm text-slate-600">{n.note}</p>}
            <p className="text-xs text-slate-400">
              {n.expectedDate && `Expected ${fmtDate(n.expectedDate)} · `}
              {n.updatedAt ? `Updated ${fmtDateTime(n.updatedAt)} by ${userName(db, n.updatedBy)}` : 'Not followed up yet'}
            </p>
            {editing === n.id && <div className="mt-2"><FollowUpEditor item={n} onDone={() => setEditing(null)} /></div>}
          </li>
        )
      })}
    </ul>
  )
}

export function StudentLink({ id }: { id: string }) {
  const { db } = useDb()
  const s = db.students.find((x) => x.id === id)
  return s ? <Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link> : null
}
