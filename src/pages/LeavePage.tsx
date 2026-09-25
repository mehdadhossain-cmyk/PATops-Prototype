import { useCallback, useState } from 'react'
import { Toast } from '../components/Comms'
import { fmtRange, LeaveDetailModal, LeaveStatusBadge, NewLeaveModal } from '../components/Leave'
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Stat, Tabs, cx } from '../components/ui'
import { campusName, fmtDate, userName, visibleStaff } from '../data/logic'
import { canDecide, datesBetween, leaveDaysTaken, weekdayOf, workingDays } from '../data/leave'
import { LEAVE_TYPE_LABEL, type LeaveRequest } from '../data/types'
import { useDb } from '../store/db'

type Tab = 'mine' | 'cover' | 'approvals' | 'calendar'

export function LeavePage() {
  const { db, me } = useDb()
  const approver = me?.role === 'lead' || me?.role === 'manager'
  const [tab, setTab] = useState<Tab>(approver && me?.role === 'manager' ? 'approvals' : 'mine')
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  if (!me) return null

  const mine = db.leaveRequests.filter((r) => r.requesterId === me.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const coverAsks = db.coverSlots.filter((c) => c.coverPatId === me.id && c.status === 'pending' && db.leaveRequests.find((r) => r.id === c.leaveId)?.status === 'awaiting_cover')
  const approvals = db.leaveRequests.filter((r) => canDecide(db, me, r))
  const year = new Date().getFullYear()

  return (
    <div>
      <PageHeader
        title="Leave"
        subtitle="Request leave, arrange cover for your classes, and track approval from your PAT Lead and the PAT Manager."
        actions={me.role !== 'manager' && <Button onClick={() => setCreating(true)}>+ Request leave</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Annual leave taken ${year}`} value={`${leaveDaysTaken(db, me, year)} days`} hint="Approved working days" />
        <Stat label="My requests in progress" value={mine.filter((r) => r.status.startsWith('awaiting')).length} />
        <Stat label="Cover requests for me" value={coverAsks.length} tone={coverAsks.length ? 'warn' : 'default'} />
        {approver && <Stat label="Waiting for my approval" value={approvals.length} tone={approvals.length ? 'warn' : 'good'} />}
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            ...(me.role !== 'manager' ? [{ value: 'mine' as Tab, label: 'My leave' }] : []),
            { value: 'cover', label: `Cover requests (${coverAsks.length})` },
            ...(approver ? [{ value: 'approvals' as Tab, label: `Approvals (${approvals.length})` }] : []),
            { value: 'calendar', label: 'Team calendar' },
          ]}
        />
      </div>

      {tab === 'mine' && <RequestList requests={mine} onOpen={setOpen} empty="You haven't requested any leave yet." />}
      {tab === 'cover' && <CoverRequests onOpen={setOpen} />}
      {tab === 'approvals' && <RequestList requests={approvals} onOpen={setOpen} showRequester empty="Nothing is waiting for your approval. ✓" />}
      {tab === 'calendar' && <TeamCalendar onOpen={setOpen} />}

      {open && <LeaveDetailModal leaveId={open} onClose={() => setOpen(null)} />}
      {creating && <NewLeaveModal onClose={(msg) => { setCreating(false); if (msg) { setToast(msg); setTab('mine') } }} />}
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}

function RequestList({ requests, onOpen, showRequester, empty }: { requests: LeaveRequest[]; onOpen: (id: string) => void; showRequester?: boolean; empty: string }) {
  const { db } = useDb()
  if (requests.length === 0) return <Card><Empty>{empty}</Empty></Card>
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {requests.map((r) => {
          const u = db.users.find((x) => x.id === r.requesterId)!
          const slots = db.coverSlots.filter((c) => c.leaveId === r.id)
          const days = workingDays(u, r.startDate, r.endDate).length
          return (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left hover:bg-slate-50">
                {showRequester && <span className="w-44 font-medium">{u.name}<span className="block text-xs font-normal text-slate-500">{campusName(db, u.campusId)}</span></span>}
                <span className="w-56 font-medium">{fmtRange(r.startDate, r.endDate)}</span>
                <span className="w-44 text-sm text-slate-600">{LEAVE_TYPE_LABEL[r.type]} · {days} day{days === 1 ? '' : 's'}</span>
                <span className="text-sm text-slate-500">{slots.length ? `${slots.filter((s) => s.status === 'accepted').length}/${slots.length} covers accepted` : 'No cover needed'}</span>
                {slots.some((s) => s.status === 'declined') && r.status === 'awaiting_cover' && <Badge tone="red">A cover declined</Badge>}
                <span className="ml-auto"><LeaveStatusBadge r={r} /></span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function CoverRequests({ onOpen }: { onOpen: (id: string) => void }) {
  const { db, me, respondCover } = useDb()
  const [declining, setDeclining] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const mine = db.coverSlots.filter((c) => c.coverPatId === me!.id)
  const pending = mine.filter((c) => c.status === 'pending' && db.leaveRequests.find((r) => r.id === c.leaveId)?.status === 'awaiting_cover')
  const upcoming = mine
    .filter((c) => c.status === 'accepted' && c.date >= today && ['awaiting_lead', 'awaiting_manager', 'approved'].includes(db.leaveRequests.find((r) => r.id === c.leaveId)?.status ?? ''))
    .sort((a, b) => a.date.localeCompare(b.date))

  const row = (c: (typeof mine)[number]) => {
    const r = db.leaveRequests.find((x) => x.id === c.leaveId)!
    const g = db.groups.find((x) => x.id === c.groupId)!
    return { r, g }
  }

  return (
    <div className="space-y-5">
      <Card title="Waiting for your answer">
        {pending.length === 0 ? (
          <Empty>No cover requests waiting. ✓</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((c) => {
              const { r, g } = row(c)
              return (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-60 flex-1 text-sm">
                      <div className="font-medium">{weekdayOf(c.date)} {fmtDate(c.date)} · <span className="font-mono">{g.code}</span> {g.startTime}–{g.endTime}</div>
                      <div className="text-slate-500">
                        For {userName(db, r.requesterId)} ({LEAVE_TYPE_LABEL[r.type].toLowerCase()} {fmtRange(r.startDate, r.endDate)}) · {campusName(db, g.campusId)} ·{' '}
                        <button className="text-brand-600 hover:underline" onClick={() => onOpen(r.id)}>details</button>
                      </div>
                    </div>
                    {declining !== c.id && (
                      <div className="flex gap-2">
                        <Button onClick={() => respondCover(c.id, true, '')}>Accept</Button>
                        <Button variant="secondary" onClick={() => { setDeclining(c.id); setNote('') }}>Decline</Button>
                      </div>
                    )}
                  </div>
                  {declining === c.id && (
                    <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim().length < 3) return; respondCover(c.id, false, note.trim()); setDeclining(null) }}>
                      <Input id={`decline-${c.id}`} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Let them know why, so they can ask someone else" className="max-w-md" />
                      <Button type="submit" variant="danger" disabled={note.trim().length < 3}>Decline</Button>
                      <Button type="button" variant="secondary" onClick={() => setDeclining(null)}>Cancel</Button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Card title="Classes you're covering">
        {upcoming.length === 0 ? (
          <Empty>No upcoming cover.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {upcoming.map((c) => {
              const { r, g } = row(c)
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 py-2">
                  <span className="w-40 font-medium">{weekdayOf(c.date)} {fmtDate(c.date)}</span>
                  <span className="font-mono">{g.code}</span>
                  <span className="text-slate-500">{g.startTime}–{g.endTime} · {campusName(db, g.campusId)} · for {userName(db, r.requesterId)}</span>
                  <span className="ml-auto"><LeaveStatusBadge r={r} /></span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

const WEEKS = 6

function TeamCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const { db, me } = useDb()
  const [campus, setCampus] = useState(me!.role === 'admin' || me!.role === 'manager' ? '' : (me!.campusId ?? ''))
  const [offset, setOffset] = useState(0)
  const start = new Date()
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7) // Monday of the current week
  const from = start.toISOString().slice(0, 10)
  const days = datesBetween(from, new Date(start.getTime() + (WEEKS * 7 - 1) * 86400000).toISOString().slice(0, 10))
  const to = days.at(-1)!
  const staffIds = new Set(visibleStaff(db, me!).map((u) => u.id).concat(me!.role === 'pat' ? db.users.filter((u) => u.campusId === me!.campusId).map((u) => u.id) : []))
  const requests = db.leaveRequests.filter(
    (r) => ['awaiting_cover', 'awaiting_lead', 'awaiting_manager', 'approved'].includes(r.status) && r.endDate >= from && r.startDate <= to &&
      staffIds.has(r.requesterId) && (!campus || db.users.find((u) => u.id === r.requesterId)?.campusId === campus),
  )
  const people = [...new Set(requests.map((r) => r.requesterId))].map((id) => db.users.find((u) => u.id === id)!).sort((a, b) => a.name.localeCompare(b.name))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {(me!.role === 'admin' || me!.role === 'manager') && (
          <Select id="cal-campus" value={campus} onChange={(e) => setCampus(e.target.value)} className="max-w-xs">
            <option value="">All campuses</option>
            {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <div className="flex gap-1">
          <Button variant="secondary" onClick={() => setOffset(offset - WEEKS)}>←</Button>
          <Button variant="secondary" onClick={() => setOffset(0)}>This week</Button>
          <Button variant="secondary" onClick={() => setOffset(offset + WEEKS)}>→</Button>
        </div>
        <span className="text-sm text-slate-500">{fmtDate(from)} – {fmtDate(to)}</span>
        <span className="ml-auto flex gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Approved</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-300" /> In progress</span>
        </span>
      </div>
      {people.length === 0 ? (
        <Empty>No one is off in these weeks.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white pr-3 text-left font-medium text-slate-500">PAT</th>
                {days.map((d) => (
                  <th key={d} className={cx('w-6 px-0 text-center font-normal', d === today ? 'text-brand-700' : 'text-slate-400', ['Sat', 'Sun'].includes(weekdayOf(d)) && 'bg-slate-50')}>
                    <div>{weekdayOf(d)[0]}</div>
                    <div className="tabular-nums">{Number(d.slice(8))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((u) => (
                <tr key={u.id}>
                  <td className="sticky left-0 bg-white py-1 pr-3 whitespace-nowrap">
                    <span className="font-medium text-slate-700">{u.name}</span> <span className="text-slate-400">{campusName(db, u.campusId)}</span>
                  </td>
                  {days.map((d) => {
                    const r = requests.find((x) => x.requesterId === u.id && x.startDate <= d && x.endDate >= d)
                    return (
                      <td key={d} className={cx('p-0.5', ['Sat', 'Sun'].includes(weekdayOf(d)) && 'bg-slate-50')}>
                        {r ? (
                          <button
                            onClick={() => onOpen(r.id)}
                            title={`${u.name}: ${LEAVE_TYPE_LABEL[r.type]} ${fmtRange(r.startDate, r.endDate)} (${r.status.replace('_', ' ')})`}
                            className={cx('block h-5 w-5 rounded', r.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-300')}
                          />
                        ) : (
                          <span className="block h-5 w-5" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
