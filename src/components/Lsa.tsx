import { useMemo, useState } from 'react'
import { fmtDate, fmtDateTime, studentName, userName, visibleStudents } from '../data/logic'
import { lsaStatus, type LsaStatus } from '../data/lsa'
import type { Lsa } from '../data/types'
import { useDb } from '../store/db'
import { Badge, Button, Field, Input, Modal, Textarea, cx } from './ui'

export function LsaStatusBadge({ l }: { l: Lsa }) {
  const s = lsaStatus(l)
  const map: Record<LsaStatus, [string, 'green' | 'red' | 'amber' | 'slate']> = {
    active: ['Active', 'green'],
    follow_up_due: ['Follow-up due', 'amber'],
    follow_up_overdue: ['Follow-up overdue', 'red'],
    ended: ['Ended', 'slate'],
  }
  const [label, tone] = map[s]
  return <Badge tone={tone}>{label}</Badge>
}

const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

/** Create or update an LSA. PATs update: start date, end date, next follow-up and comments. */
export function LsaModal({ lsa, studentId, onClose }: { lsa?: Lsa; studentId?: string; onClose: () => void }) {
  const { db, me, saveLsa } = useDb()
  const [sid, setSid] = useState(lsa?.studentId ?? studentId ?? '')
  const [search, setSearch] = useState('')
  const [start, setStart] = useState(lsa?.startDate ?? addDays(0))
  const [end, setEnd] = useState(lsa?.endDate ?? '')
  const [follow, setFollow] = useState(lsa?.nextFollowUp ?? addDays(28))
  const [comments, setComments] = useState(lsa?.comments ?? '')
  const [error, setError] = useState('')
  const candidates = useMemo(() => (me ? visibleStudents(db, me).filter((s) => s.status === 'active') : []), [db, me])
  const matches = search.trim().length >= 2 ? candidates.filter((s) => `${studentName(s)} ${s.uniStudentId} ${s.ebsPersonCode}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : []
  const chosen = db.students.find((s) => s.id === sid)
  const history = lsa ? db.lsaUpdates.filter((u) => u.lsaId === lsa.id).sort((a, b) => b.at.localeCompare(a.at)) : []
  const hasActive = !lsa && sid && db.lsas.some((l) => l.studentId === sid && (!l.endDate || l.endDate >= addDays(0)))

  return (
    <Modal open title={lsa ? 'Update LSA' : 'New LSA'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!sid) return setError('Choose a student')
          if (!start) return setError('The LSA start date is required')
          if (end && end < start) return setError('The end date is before the start date')
          if (follow && follow < start) return setError('The next follow-up is before the start date')
          saveLsa({ id: lsa?.id, studentId: sid, startDate: start, endDate: end || null, nextFollowUp: follow || null, comments: comments.trim() })
          onClose()
        }}
      >
        {chosen ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span>{studentName(chosen)} <span className="font-mono text-xs text-slate-400">Student ID {chosen.uniStudentId}</span></span>
            {!lsa && !studentId && <button type="button" className="text-brand-600 hover:underline" onClick={() => setSid('')}>Change</button>}
          </div>
        ) : (
          <Field label="Student" group>
            <div className="relative">
              <Input id="lsa-student-search" placeholder="Type a name or student ID…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { setSid(s.id); setSearch('') }}>
                        <span>{studentName(s)}</span>
                        <span className="font-mono text-xs text-slate-400">{s.uniStudentId}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        )}
        {hasActive && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">This student already has an active LSA. Update that one instead unless this is a new agreement.</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="LSA start date"><Input id="lsa-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="LSA end date" hint="Leave empty while the LSA is ongoing"><Input id="lsa-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Next follow-up"><Input id="lsa-follow" type="date" value={follow} onChange={(e) => setFollow(e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-slate-500">Next follow-up in:</span>
          {[[14, '2 weeks'], [28, '4 weeks'], [56, '8 weeks']].map(([n, label]) => (
            <button key={label} type="button" onClick={() => setFollow(addDays(n as number))} className={cx('rounded-lg border px-2.5 py-1', follow === addDays(n as number) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 hover:bg-slate-50')}>
              {label}
            </button>
          ))}
        </div>
        <Field label="Comments" hint="What was agreed, or what happened at the follow-up. Earlier comments are kept in the history below.">
          <Textarea id="lsa-comments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{lsa ? 'Save changes' : 'Save LSA'}</Button>
        </div>
        {history.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <h3 className="mb-2 text-sm font-medium">History</h3>
            <ul className="space-y-1.5 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="w-32 shrink-0 text-xs text-slate-400">{fmtDateTime(h.at)}</span>
                  <span className="text-slate-700">{h.summary} <span className="text-xs text-slate-400">· {userName(db, h.by)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  )
}

/** LSAs for one student (student page). */
export function StudentLsas({ studentId }: { studentId: string }) {
  const { db } = useDb()
  const [editing, setEditing] = useState<Lsa | 'new' | null>(null)
  const lsas = db.lsas.filter((l) => l.studentId === studentId).sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <div>
      {lsas.length === 0 ? (
        <p className="text-sm text-slate-500">No LSA recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lsas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <LsaStatusBadge l={l} />
              <span>Started {fmtDate(l.startDate)}{l.endDate && ` · ends ${fmtDate(l.endDate)}`}</span>
              {l.nextFollowUp && <span className="text-slate-500">Next follow-up {fmtDate(l.nextFollowUp)}</span>}
              {l.comments && <span className="basis-full text-slate-600">{l.comments}</span>}
              <button className="ml-auto text-brand-600 hover:underline" onClick={() => setEditing(l)}>Update</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3"><Button variant="secondary" onClick={() => setEditing('new')}>+ New LSA</Button></div>
      {editing && <LsaModal lsa={editing === 'new' ? undefined : editing} studentId={studentId} onClose={() => setEditing(null)} />}
    </div>
  )
}
