import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CommEntry, LogContactModal, Toast } from '../components/Comms'
import { Badge, Button, Card, Empty, Input, PageHeader, Progress, Select, Stat, Tabs, cx } from '../components/ui'
import {
  campusName,
  channelsLabel,
  CONTACT_GAP_DAYS,
  daysSince,
  fmtDate,
  fmtDateTime,
  lastReachedByStudent,
  openFollowUps,
  patCommStats,
  patGroups,
  studentName,
  visibleStaff,
} from '../data/logic'
import { CHANNEL_LABEL, OUTCOME_LABEL, REASON_LABEL, type Channel, type ContactReason, type User } from '../data/types'
import { downloadCsv } from '../lib/csv'
import { useDb } from '../store/db'

export function CallLogPage() {
  const { db, me } = useDb()
  const [params] = useSearchParams()
  if (!me) return null
  const patId = params.get('pat')
  if (me.role === 'pat') return <PatLog pat={me} />
  if (patId) {
    const pat = visibleStaff(db, me).find((u) => u.id === patId)
    return pat ? <PatLog pat={pat} /> : <p>PAT not found or not visible to you.</p>
  }
  return <TeamOverview me={me} />
}

// ---- One PAT's log ----------------------------------------------------------

type Tab = 'log' | 'followups' | 'gaps'
type Period = '7' | '30' | '90' | 'all'

function PatLog({ pat }: { pat: User }) {
  const { db, me } = useDb()
  const self = me?.id === pat.id
  const [tab, setTab] = useState<Tab>('log')
  const [logging, setLogging] = useState<{ mode: 'individual' | 'announcement'; studentIds?: string[] } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const stats = patCommStats(db, pat.id)
  const mine = useMemo(() => db.comms.filter((c) => c.authorId === pat.id).sort((a, b) => b.at.localeCompare(a.at)), [db.comms, pat.id])
  const followUps = openFollowUps(mine)

  return (
    <div>
      {!self && (
        <div className="mb-2 text-sm">
          <Link to="/call-log" className="text-brand-600 hover:underline">← Team call logs</Link>
        </div>
      )}
      <PageHeader
        title={self ? 'Call log' : `Call log · ${pat.name}`}
        subtitle={self ? 'Every contact with your students, and your group announcements.' : `${campusName(db, pat.campusId)} · ${patGroups(db, pat.id).length} groups`}
        actions={
          self && (
            <>
              <Button variant="secondary" onClick={() => setLogging({ mode: 'announcement' })}>📣 Announcement</Button>
              <Button onClick={() => setLogging({ mode: 'individual' })}>+ Log contact</Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contacts this week" value={stats.contacts7} hint={`${stats.contacts30} in the last 30 days`} />
        <Stat
          label={`Students reached · ${CONTACT_GAP_DAYS} days`}
          value={`${stats.coverage}%`}
          tone={stats.coverage >= 70 ? 'good' : stats.coverage >= 40 ? 'warn' : 'bad'}
          hint={`${stats.reached30} of ${stats.students} active students`}
        />
        <Stat label="Overdue follow-ups" value={stats.overdueFollowUps} tone={stats.overdueFollowUps ? 'bad' : 'good'} hint={`${followUps.length} open in total`} />
        <Stat label="Announcements · 30 days" value={stats.announcements30} />
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'log', label: 'Log' },
            { value: 'followups', label: `Follow-ups (${followUps.length})` },
            { value: 'gaps', label: `Not contacted (${stats.students - stats.reached30})` },
          ]}
        />
      </div>

      {tab === 'log' && <LogList pat={pat} />}
      {tab === 'followups' && (
        <Card>
          {followUps.length === 0 ? (
            <Empty>No open follow-ups. ✓</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {followUps.map((f) => <CommEntry key={f.log.id} c={f.log} showAuthor={false} />)}
            </ul>
          )}
        </Card>
      )}
      {tab === 'gaps' && <NotContacted pat={pat} onLog={(id) => setLogging({ mode: 'individual', studentIds: [id] })} canLog={self} />}

      <LogContactModal
        key={logging ? `${logging.mode}-${logging.studentIds?.join()}` : 'closed'}
        open={!!logging}
        initialMode={logging?.mode}
        studentIds={logging?.studentIds}
        onClose={(msg) => { setLogging(null); if (msg) setToast(msg) }}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}

const PAGE = 30

function LogList({ pat }: { pat: User }) {
  const { db } = useDb()
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState<Channel | ''>('')
  const [reason, setReason] = useState<ContactReason | ''>('')
  const [kind, setKind] = useState<'' | 'individual' | 'announcement'>('')
  const [period, setPeriod] = useState<Period>('30')
  const [limit, setLimit] = useState(PAGE)

  const studentById = useMemo(() => new Map(db.students.map((s) => [s.id, s])), [db.students])
  const rows = useMemo(() => {
    const since = period === 'all' ? '' : new Date(Date.now() - Number(period) * 86400000).toISOString()
    const qy = q.trim().toLowerCase()
    return db.comms
      .filter((c) => c.authorId === pat.id && c.at >= since)
      .filter((c) => !channel || c.channels.includes(channel))
      .filter((c) => !reason || c.reason === reason)
      .filter((c) => !kind || c.kind === kind)
      .filter((c) => {
        if (!qy) return true
        const s = c.studentId ? studentById.get(c.studentId) : null
        return c.summary.toLowerCase().includes(qy) || (s && `${studentName(s)} ${s.ebsPersonCode}`.toLowerCase().includes(qy))
      })
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [db.comms, pat.id, period, channel, reason, kind, q, studentById])

  const exportCsv = () => {
    downloadCsv(`call-log-${pat.name.replace(/\s+/g, '-').toLowerCase()}.csv`, [
      ['Date/time', 'Type', 'Student', 'EBS Person Code', 'Groups', 'Channel', 'Direction', 'Outcome', 'Reason', 'Summary', 'Follow-up date', 'Follow-up done', 'Logged at', 'Voided'],
      ...rows.map((c) => {
        const s = c.studentId ? studentById.get(c.studentId) : null
        return [
          fmtDateTime(c.at), c.kind, s ? studentName(s) : '', s?.ebsPersonCode ?? '',
          c.groupIds.map((g) => db.groups.find((x) => x.id === g)?.code).join(' '),
          channelsLabel(c), c.direction, OUTCOME_LABEL[c.outcome], REASON_LABEL[c.reason], c.summary,
          c.followUpDate ?? '', c.followUpDoneAt ? fmtDate(c.followUpDoneAt) : '', fmtDateTime(c.loggedAt), c.voidedAt ? `Yes: ${c.voidReason}` : '',
        ]
      }),
    ])
  }

  return (
    <Card actions={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>} title={`${rows.length} entries`}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input id="log-q" placeholder="Search student or text…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        <Select id="log-period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
        <Select id="log-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="">Contacts and announcements</option>
          <option value="individual">Student contacts only</option>
          <option value="announcement">Announcements only</option>
        </Select>
        <Select id="log-channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')}>
          <option value="">All channels</option>
          {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </Select>
        <Select id="log-reason-filter" value={reason} onChange={(e) => setReason(e.target.value as ContactReason | '')}>
          <option value="">All reasons</option>
          {(Object.keys(REASON_LABEL) as ContactReason[]).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
        </Select>
      </div>
      {rows.length === 0 ? (
        <Empty>No entries match these filters.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.slice(0, limit).map((c) => <CommEntry key={c.id} c={c} showAuthor={false} />)}
        </ul>
      )}
      {rows.length > limit && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more ({rows.length - limit} remaining)</Button>
        </div>
      )}
    </Card>
  )
}

function NotContacted({ pat, onLog, canLog }: { pat: User; onLog: (studentId: string) => void; canLog: boolean }) {
  const { db } = useDb()
  const groups = patGroups(db, pat.id)
  const groupIds = new Set(groups.map((g) => g.id))
  const last = lastReachedByStudent(db.comms.filter((c) => c.authorId === pat.id))
  const rows = db.students
    .filter((s) => s.status === 'active' && groupIds.has(s.groupId))
    .map((s) => ({ s, last: last.get(s.id) ?? null, days: daysSince(last.get(s.id)) }))
    .filter((r) => r.days === null || r.days > CONTACT_GAP_DAYS)
    .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))

  return (
    <Card title={`Students not reached in the last ${CONTACT_GAP_DAYS} days`}>
      {rows.length === 0 ? (
        <Empty>Every student has been reached in the last {CONTACT_GAP_DAYS} days. ✓</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Last reached</th>
                <th className="py-2 pr-4">Phone</th>
                {canLog && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ s, last, days }) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-4"><Link to={`/students/${s.id}`} className="font-medium hover:text-brand-600">{studentName(s)}</Link></td>
                  <td className="py-2 pr-4 font-mono text-xs">{db.groups.find((g) => g.id === s.groupId)?.code}</td>
                  <td className="py-2 pr-4">{last ? <span className="text-amber-700">{fmtDate(last)} · {days} days ago</span> : <Badge tone="red">Never</Badge>}</td>
                  <td className="py-2 pr-4 tabular-nums">{s.phone}</td>
                  {canLog && <td className="py-2 text-right"><Button variant="secondary" onClick={() => onLog(s.id)}>Log contact</Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ---- Team overview ------------------------------------------------------------

function TeamOverview({ me }: { me: User }) {
  const { db } = useDb()
  const [campus, setCampus] = useState('')
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const pats = visibleStaff(db, me).filter((u) => u.role === 'pat' && u.status === 'active' && (!campus || u.campusId === campus))
  const rows = pats.map((u) => ({ u, s: patCommStats(db, u.id) })).sort((a, b) => a.s.coverage - b.s.coverage)
  const totalStudents = rows.reduce((n, r) => n + r.s.students, 0)
  const totalReached = rows.reduce((n, r) => n + r.s.reached30, 0)
  const low = rows.filter((r) => r.s.coverage < 40).length
  const overdue = rows.reduce((n, r) => n + r.s.overdueFollowUps, 0)

  return (
    <div>
      <PageHeader
        title="Call logs"
        subtitle={`How often each PAT is reaching their students. A student counts as reached after a successful contact in the last ${CONTACT_GAP_DAYS} days.`}
        actions={
          <>
          <Button onClick={() => setLogging(true)}>+ Log contact</Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv('call-log-overview.csv', [
                ['PAT', 'Campus', 'Active students', `Reached (${CONTACT_GAP_DAYS}d)`, 'Coverage %', 'Contacts 7d', `Contacts ${CONTACT_GAP_DAYS}d`, `Announcements ${CONTACT_GAP_DAYS}d`, 'Overdue follow-ups', 'Last logged'],
                ...rows.map(({ u, s }) => [u.name, campusName(db, u.campusId), s.students, s.reached30, s.coverage, s.contacts7, s.contacts30, s.announcements30, s.overdueFollowUps, s.lastLogAt ? fmtDate(s.lastLogAt) : '']),
              ])
            }
          >
            Export CSV
          </Button>
          </>
        }
      />
      <LogContactModal key={String(logging)} open={logging} onClose={(msg) => { setLogging(false); if (msg) setToast(msg) }} />
      <Toast message={toast} onDone={clearToast} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students reached" value={`${totalStudents ? Math.round((totalReached / totalStudents) * 100) : 0}%`} hint={`${totalReached.toLocaleString()} of ${totalStudents.toLocaleString()} in ${CONTACT_GAP_DAYS} days`} />
        <Stat label="PATs below 40% reached" value={low} tone={low ? 'bad' : 'good'} />
        <Stat label="Overdue follow-ups" value={overdue} tone={overdue ? 'warn' : 'good'} />
        <Stat label="Contacts this week" value={rows.reduce((n, r) => n + r.s.contacts7, 0).toLocaleString()} />
      </div>
      <Card>
        {me.role !== 'lead' && (
          <div className="mb-4">
            <Select id="team-campus" value={campus} onChange={(e) => setCampus(e.target.value)} className="max-w-xs">
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}
        {rows.length === 0 ? (
          <Empty>No active PATs.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-4">PAT</th>
                  <th className="py-2 pr-4 w-48">Students reached · {CONTACT_GAP_DAYS}d</th>
                  <th className="py-2 pr-4 text-right">Contacts 7d</th>
                  <th className="py-2 pr-4 text-right">Contacts {CONTACT_GAP_DAYS}d</th>
                  <th className="py-2 pr-4 text-right">Announcements</th>
                  <th className="py-2 pr-4 text-right">Overdue follow-ups</th>
                  <th className="py-2 pr-4">Last logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ u, s }) => {
                  const since = daysSince(s.lastLogAt)
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4">
                        <Link to={`/call-log?pat=${u.id}`} className="font-medium hover:text-brand-600">{u.name}</Link>
                        <div className="text-xs text-slate-500">{campusName(db, u.campusId)}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{s.coverage}%</span><span className="tabular-nums">{s.reached30}/{s.students}</span></div>
                        <Progress value={s.coverage} tone={s.coverage >= 70 ? 'good' : s.coverage >= 40 ? 'warn' : 'bad'} />
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.contacts7}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.contacts30}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.announcements30}</td>
                      <td className={cx('py-2.5 pr-4 text-right tabular-nums', s.overdueFollowUps > 0 && 'font-medium text-rose-600')}>{s.overdueFollowUps}</td>
                      <td className={cx('py-2.5 pr-4 whitespace-nowrap', since !== null && since > 7 ? 'text-rose-600' : 'text-slate-600')}>
                        {s.lastLogAt ? `${fmtDate(s.lastLogAt)}` : 'Never'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Sorted with the lowest reach first. Open a PAT to see their full log.</p>
      </Card>
    </div>
  )
}
