import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  allocationCandidates,
  autoAllocate,
  buildContext,
  currentProblems,
  DEFAULT_MAX_STUDENTS,
  evaluate,
  groupSessions,
  patHours,
  profileFor,
  type Evaluation,
} from '../data/allocation'
import { allocationWorkbook } from '../data/allocationSheets'
import { campusName, can, courseName, intakeLabel, userName } from '../data/logic'
import { SLOTS, SLOT_LABEL, WEEKDAYS, type AllocationDraft, type Group, type User, type Weekday } from '../data/types'
import { saveFile } from '../lib/download'
import { buildXlsx } from '../lib/xlsx'
import { useDb } from '../store/db'
import { Toast } from './Comms'
import { Badge, Button, Card, Input, Modal, Progress, Select, Textarea, cx } from './ui'
import { LevelBadge } from './StatusBadges'

type Fit = 'fits' | 'warn' | 'blocked'
const fitOf = (e: Evaluation): Fit => (e.hard.length ? 'blocked' : e.soft.length ? 'warn' : 'fits')
const SLOT_SHORT = { Mor: 'AM', Afr: 'PM', Eve: 'Eve' } as const

function SessionChips({ g }: { g: Group }) {
  return (
    <span className="flex flex-wrap gap-1">
      {groupSessions(g).map((s) => (
        <span key={s.day} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
          {s.day} {s.slots.length === 2 && s.slots.includes('Mor') && s.slots.includes('Afr') ? 'Full' : s.slots.map((x) => SLOT_SHORT[x]).join('+')}
        </span>
      ))}
    </span>
  )
}

export function AllocationBoard({ draft }: { draft: AllocationDraft }) {
  const { db, me, setDraftAssignment, toggleDraftLock, applySuggestions, clearSuggestions, publishDraft } = useDb()
  const editable = draft.status === 'draft' && !!me && can(me, 'allocation')
  const ctx = useMemo(() => buildContext(db, draft), [db, draft])
  const scope = useMemo(() => new Set(draft.groupIds), [draft.groupIds])
  const [active, setActive] = useState<string | null>(null) // selected or dragged group
  const [dragging, setDragging] = useState(false)
  const [campus, setCampus] = useState('')
  const [shift, setShift] = useState('')
  const [q, setQ] = useState('')
  const [onlyFits, setOnlyFits] = useState(false)
  const [override, setOverride] = useState<{ groupId: string; patId: string; reasons: string[] } | null>(null)
  const [overrideText, setOverrideText] = useState('')
  const [showChanges, setShowChanges] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const pats = allocationCandidates(db)
  const evals = useMemo(() => {
    const m = new Map<string, Evaluation>()
    if (active) for (const p of pats) m.set(p.id, evaluate(ctx, p.id, active))
    return m
  }, [active, ctx, pats])
  const problems = useMemo(() => currentProblems(ctx, draft.groupIds), [ctx, draft.groupIds])
  const unallocated = draft.groupIds.map((id) => db.groups.find((g) => g.id === id)!).filter((g) => g && !ctx.patOf.get(g.id))
  const changes = draft.groupIds
    .map((id) => db.groups.find((g) => g.id === id)!)
    .filter((g) => g && g.patId !== (ctx.patOf.get(g.id) ?? null))
  const activeGroup = active ? db.groups.find((g) => g.id === active) : null

  const order: Record<Fit, number> = { fits: 0, warn: 1, blocked: 2 }
  const lanes = pats
    .filter((p) => !campus || p.campusId === campus || profileFor(db, p.id).preferredCampusIds.includes(campus))
    .filter((p) => !shift || p.shift === shift)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => !onlyFits || !activeGroup || fitOf(evals.get(p.id)!) !== 'blocked')
    .sort((a, b) =>
      activeGroup
        ? order[fitOf(evals.get(a.id)!)] - order[fitOf(evals.get(b.id)!)] || evals.get(a.id)!.score - evals.get(b.id)!.score
        : (campusName(db, a.campusId)).localeCompare(campusName(db, b.campusId)) || a.name.localeCompare(b.name),
    )

  // Freeze the lane order for the length of a drag: lanes moving under the cursor would change the
  // drop target (and can pull a dragged chip out from under the pointer).
  const [frozen, setFrozen] = useState<string[]>([])
  const shown = dragging ? [...lanes].sort((a, b) => (frozen.indexOf(a.id) + 1 || 1e9) - (frozen.indexOf(b.id) + 1 || 1e9)) : lanes

  const place = (groupId: string, patId: string | null) => {
    if (!editable) return
    if (patId) {
      const e = evaluate(ctx, patId, groupId)
      if (e.hard.length) {
        setOverride({ groupId, patId, reasons: e.hard })
        setOverrideText('')
        return
      }
    }
    setDraftAssignment(draft.id, groupId, patId)
    setActive(null)
  }

  const onDragStart = (e: DragEvent, groupId: string) => {
    e.dataTransfer.setData('text/plain', groupId)
    e.dataTransfer.effectAllowed = 'move'
    setFrozen(shown.map((p) => p.id))
    setActive(groupId)
    setDragging(true)
  }
  const onDragEnd = () => setDragging(false)
  const dropOn = (e: DragEvent, patId: string | null) => {
    e.preventDefault()
    const gid = e.dataTransfer.getData('text/plain')
    setDragging(false)
    if (gid && scope.has(gid)) place(gid, patId)
  }

  const runAuto = () => {
    const s = autoAllocate(db, draft)
    applySuggestions(draft.id, s)
    const placed = s.filter((x) => x.patId).length
    setToast(`Suggested a PAT for ${placed} of ${s.length} open groups${s.length - placed ? `; ${s.length - placed} need attention` : ''}.`)
  }

  const exportXlsx = () => {
    const bytes = buildXlsx(allocationWorkbook(db, draft, draft.groupIds))
    void saveFile(`${draft.name.replace(/[^\w]+/g, '-')}.xlsx`, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  }

  return (
    <div>
      {/* Summary and actions */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span><strong className="tabular-nums">{draft.groupIds.length}</strong> groups in this draft</span>
            <span className={cx(unallocated.length ? 'text-amber-700' : 'text-emerald-700')}><strong className="tabular-nums">{unallocated.length}</strong> unallocated</span>
            <span className={cx(problems.size ? 'text-rose-600' : 'text-emerald-700')}><strong className="tabular-nums">{problems.size}</strong> breaking a rule</span>
            <button onClick={() => setShowChanges(!showChanges)} className="text-brand-600 hover:underline"><strong className="tabular-nums">{changes.length}</strong> changes vs live</button>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {editable && <Button onClick={runAuto} disabled={unallocated.length === 0}>⚡ Auto-allocate</Button>}
            {editable && <Button variant="secondary" onClick={() => clearSuggestions(draft.id)}>Clear suggestions</Button>}
            <Button variant="secondary" onClick={exportXlsx}>Export sheet (.xlsx)</Button>
            {editable && <Button variant="secondary" onClick={() => setConfirmPublish(true)} disabled={changes.length === 0}>Publish…</Button>}
          </div>
        </div>
        {showChanges && (
          <div className="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-sm">
            {changes.length === 0 ? <p className="text-slate-500">No changes from the live allocation.</p> : (
              <ul className="space-y-1">
                {changes.map((g) => (
                  <li key={g.id} className="flex flex-wrap gap-x-3">
                    <span className="w-44 font-mono text-xs">{g.code}</span>
                    <span>{userName(db, g.patId)} → <strong>{userName(db, ctx.patOf.get(g.id) ?? null)}</strong></span>
                    {draft.assignments[g.id]?.overrideReason && <Badge tone="red">Override: {draft.assignments[g.id].overrideReason}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {draft.status === 'published' && <p className="mt-3 text-sm text-emerald-700">Published {draft.publishedAt?.slice(0, 10)} by {userName(db, draft.publishedBy)}. This draft is now read-only.</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Unallocated groups */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => dropOn(e, null)}
          className={cx('min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-auto', dragging && 'ring-2 ring-slate-300')}
        >
          <h2 className="mb-1 font-medium">Unallocated ({unallocated.length})</h2>
          <p className="mb-3 text-xs text-slate-500">{editable ? 'Drag a group onto a PAT, or click it and choose "Place here". Drag a group back here to unallocate it.' : 'Read-only.'}</p>
          {unallocated.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Every group has a PAT ✓</p>}
          <ul className="space-y-2">
            {unallocated.map((g) => (
              <li key={g.id}>
                <GroupCard g={g} active={active === g.id} editable={editable} onSelect={() => setActive(active === g.id ? null : g.id)} onDragStart={onDragStart} onDragEnd={onDragEnd} note={draft.assignments[g.id]?.reason} students={ctx.students.get(g.id) ?? null} />
              </li>
            ))}
          </ul>
          {problems.size > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-1 text-sm font-medium text-rose-700">Breaking a rule ({problems.size})</h3>
              <ul className="space-y-1 text-xs">
                {[...problems.entries()].map(([gid, why]) => (
                  <li key={gid}>
                    <button className="font-mono text-rose-700 hover:underline" onClick={() => setActive(gid)}>{db.groups.find((g) => g.id === gid)?.code}</button>
                    <span className="text-slate-500"> · {userName(db, ctx.patOf.get(gid) ?? null)}: {why[0]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* PAT lanes */}
        <div className="min-w-0">
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Input id="alloc-q" placeholder="Search PATs…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select id="alloc-campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
              <option value="">All campuses</option>
              {db.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select id="alloc-shift" value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="">Morning and evening PATs</option>
              <option value="morning">Morning PATs</option>
              <option value="evening">Evening PATs</option>
            </Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} /> Hide PATs who can't take the selected group</label>
          </div>

          {activeGroup && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              <span>Placing <strong className="font-mono">{activeGroup.code}</strong></span>
              <SessionChips g={activeGroup} />
              <span className="text-slate-600">{ctx.students.get(activeGroup.id) ?? '?'} students · {campusName(db, activeGroup.campusId)}</span>
              <span className="flex gap-3 text-xs">
                <span className="text-emerald-700">● fits {[...evals.values()].filter((e) => fitOf(e) === 'fits').length}</span>
                <span className="text-amber-700">● warnings {[...evals.values()].filter((e) => fitOf(e) === 'warn').length}</span>
                <span className="text-rose-700">● blocked {[...evals.values()].filter((e) => fitOf(e) === 'blocked').length}</span>
              </span>
              <button className="ml-auto text-brand-700 hover:underline" onClick={() => setActive(null)}>Done</button>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((p) => (
              <PatLane
                key={p.id}
                pat={p}
                ctxGroups={ctx.groupsOf.get(p.id) ?? []}
                ctxStudents={ctx.students}
                scope={scope}
                draft={draft}
                evaluation={active ? evals.get(p.id) ?? null : null}
                activeGroup={activeGroup ?? null}
                editable={editable}
                dragging={dragging}
                problems={problems}
                onDrop={(e) => dropOn(e, p.id)}
                onPlace={() => active && place(active, p.id)}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onSelect={(gid) => setActive(active === gid ? null : gid)}
                onToggleLock={(gid) => toggleDraftLock(draft.id, gid)}
                onRemove={(gid) => place(gid, null)}
              />
            ))}
          </div>
          {lanes.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No PATs match these filters.</p>}
        </div>
      </div>

      {override && (
        <Modal open title="This placement breaks a rule" onClose={() => setOverride(null)}>
          <div className="space-y-3 text-sm">
            <p>
              Placing <strong className="font-mono">{db.groups.find((g) => g.id === override.groupId)?.code}</strong> with <strong>{userName(db, override.patId)}</strong>:
            </p>
            <ul className="space-y-1 rounded-lg bg-rose-50 p-3 text-rose-800">{override.reasons.map((r) => <li key={r}>✕ {r}</li>)}</ul>
            <p className="text-slate-600">You can place it anyway with a reason. The reason is recorded when the draft is published.</p>
            <Textarea id="override-reason" rows={2} value={overrideText} onChange={(e) => setOverrideText(e.target.value)} placeholder="e.g. Agreed with the PAT: swapping their day off for this term" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOverride(null)}>Cancel</Button>
              <Button variant="danger" disabled={overrideText.trim().length < 5} onClick={() => { setDraftAssignment(draft.id, override.groupId, override.patId, overrideText.trim()); setOverride(null); setActive(null) }}>
                Place anyway
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmPublish && (
        <Modal open title={`Publish "${draft.name}"?`} onClose={() => setConfirmPublish(false)}>
          <div className="space-y-3 text-sm">
            <p><strong>{changes.length}</strong> group{changes.length === 1 ? '' : 's'} will change PAT. Each PAT with new groups gets a task, and every change is recorded in their activity history.</p>
            {unallocated.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-amber-800">{unallocated.length} group{unallocated.length === 1 ? ' is' : 's are'} still unallocated.</p>}
            {problems.size > 0 && <p className="rounded-lg bg-rose-50 p-2 text-rose-800">{problems.size} placement{problems.size === 1 ? ' breaks' : 's break'} a rule{[...problems.keys()].every((g) => draft.assignments[g]?.overrideReason) ? ' (all with a recorded override reason)' : ''}.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmPublish(false)}>Cancel</Button>
              <Button onClick={() => { publishDraft(draft.id); setConfirmPublish(false); setToast(`Published: ${changes.length} groups updated and PATs notified.`) }}>Publish</Button>
            </div>
          </div>
        </Modal>
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}

function GroupCard({ g, active, editable, onSelect, onDragStart, onDragEnd, note, students }: {
  g: Group; active: boolean; editable: boolean; onSelect: () => void; onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void; note?: string; students: number | null
}) {
  const { db } = useDb()
  return (
    <div
      draggable={editable}
      onDragStart={(e) => onDragStart(e, g.id)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cx('cursor-pointer rounded-lg border bg-white p-2.5 text-sm shadow-sm transition', active ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200 hover:border-brand-300', editable && 'active:cursor-grabbing')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-brand-700">{g.code}</span>
        <span className={cx('text-xs tabular-nums', students === null ? 'text-amber-700' : 'text-slate-500')}>{students ?? '?'} stu</span>
      </div>
      <div className="truncate text-xs text-slate-600">{courseName(db, g.courseId)} · {campusName(db, g.campusId)} · {intakeLabel(db, g.intakeId)}</div>
      <div className="mt-1.5"><SessionChips g={g} /></div>
      {g.rawDays && <div className="mt-1 truncate text-[11px] text-slate-400" title="As written on the sheet">“{g.rawDays}”</div>}
      {note && <div className="mt-1.5 rounded bg-amber-50 p-1.5 text-[11px] leading-snug text-amber-900">{note}</div>}
    </div>
  )
}

/** Mon–Sun × session grid. Days off are shaded red. */
function WeekGrid({ groups, scope, preview, clashes, offDays }: { groups: Group[]; scope: Set<string>; preview: Group | null; clashes: boolean; offDays: Weekday[] }) {
  const cell = (day: (typeof WEEKDAYS)[number], slot: (typeof SLOTS)[number]) => {
    const here = groups.filter((g) => groupSessions(g).some((s) => s.day === day && s.slots.includes(slot)))
    const pv = preview && groupSessions(preview).some((s) => s.day === day && s.slots.includes(slot))
    const off = offDays.includes(day)
    const cls = here.length > 1 || (here.length && off) ? 'bg-rose-500' : here.length === 1 ? (scope.has(here[0].id) ? 'bg-brand-500' : 'bg-slate-400') : off ? 'bg-rose-200' : 'bg-slate-100'
    return (
      <span
        key={`${day}${slot}`}
        title={`${day} ${SLOT_LABEL[slot]}${off ? ' (day off)' : ''}${here.length ? `: ${here.map((g) => g.code).join(', ')}` : ''}`}
        className={cx('h-3.5 rounded-sm', cls, pv && (here.length || clashes ? 'ring-2 ring-rose-500 ring-offset-1' : 'ring-2 ring-emerald-500 ring-offset-1'))}
      />
    )
  }
  return (
    <div className="grid grid-cols-[1.75rem_repeat(7,1fr)] gap-0.5 text-[10px] text-slate-400">
      <span />
      {WEEKDAYS.map((d) => <span key={d} title={offDays.includes(d) ? `${d}: day off` : d} className={cx('text-center', offDays.includes(d) && 'font-semibold text-rose-600')}>{d[0]}</span>)}
      {SLOTS.map((s) => (
        <div key={s} className="contents">
          <span className="leading-3.5">{SLOT_SHORT[s]}</span>
          {WEEKDAYS.map((d) => cell(d, s))}
        </div>
      ))}
    </div>
  )
}

function PatLane(props: {
  pat: User; ctxGroups: Group[]; ctxStudents: Map<string, number | null>; scope: Set<string>; draft: AllocationDraft; evaluation: Evaluation | null; activeGroup: Group | null
  editable: boolean; dragging: boolean; problems: Map<string, string[]>
  onDrop: (e: DragEvent) => void; onPlace: () => void; onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void; onSelect: (gid: string) => void; onToggleLock: (gid: string) => void; onRemove: (gid: string) => void
}) {
  const { db } = useDb()
  const { pat, ctxGroups, evaluation, activeGroup } = props
  const prof = profileFor(db, pat.id)
  const max = prof.maxStudents ?? DEFAULT_MAX_STUDENTS
  const load = ctxGroups.reduce((n, g) => n + (props.ctxStudents.get(g.id) ?? 0), 0)
  const fit = evaluation ? fitOf(evaluation) : null
  const [over, setOver] = useState(false)
  const ring = fit === 'fits' ? 'border-emerald-400 ring-2 ring-emerald-200' : fit === 'warn' ? 'border-amber-400 ring-2 ring-amber-100' : fit === 'blocked' ? 'border-rose-300 opacity-70' : 'border-slate-200'
  const off = WEEKDAYS.filter((d) => !pat.workDays.includes(d))

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); props.onDrop(e) }}
      className={cx('rounded-xl border bg-white p-3 shadow-sm transition', ring, over && 'scale-[1.01] shadow-md')}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/staff/${pat.id}`} className="block truncate font-medium hover:text-brand-600">{pat.name}</Link>
          <div className="truncate text-xs text-slate-500">
            {campusName(db, pat.campusId)} · {patHours(db, pat)} · <span className={off.length ? 'font-medium text-rose-600' : undefined}>off {off.join('/') || 'none'}</span>
          </div>
        </div>
        <span className="flex shrink-0 gap-1">
          {pat.status === 'onboarding' && <Badge tone="amber">Training</Badge>}
          {pat.level && pat.status !== 'onboarding' && <LevelBadge level={pat.level} />}
        </span>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <div className="flex-1"><Progress value={(load / max) * 100} tone={load > max ? 'bad' : load > max * 0.9 ? 'warn' : 'good'} /></div>
        <span className="tabular-nums">{load}/{max}</span>
        <span className="tabular-nums">{ctxGroups.length}{prof.targetGroups ? `/${prof.targetGroups}` : ''} grp</span>
      </div>
      <WeekGrid groups={ctxGroups} scope={props.scope} preview={activeGroup && !ctxGroups.some((g) => g.id === activeGroup.id) ? activeGroup : null} clashes={!!evaluation?.hard.some((h) => h.startsWith('Clashes'))} offDays={off} />
      <ul className="mt-2 flex flex-wrap gap-1">
        {ctxGroups.map((g) => {
          const inScope = props.scope.has(g.id)
          const a = props.draft.assignments[g.id]
          const bad = props.problems.has(g.id)
          return (
            <li
              key={g.id}
              draggable={props.editable && inScope && !a?.locked}
              onDragStart={(e) => props.onDragStart(e, g.id)}
              onDragEnd={props.onDragEnd}
              onClick={() => inScope && props.onSelect(g.id)}
              title={inScope ? `${g.code}${a?.reason ? `\n${a.reason}` : ''}${bad ? `\n⚠ ${props.problems.get(g.id)!.join('; ')}` : ''}` : `${g.code} (not in this draft)`}
              className={cx(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]',
                !inScope ? 'border-slate-200 bg-slate-50 text-slate-400' : bad ? 'border-rose-300 bg-rose-50 text-rose-700' : a?.source === 'auto' ? 'border-dashed border-brand-400 bg-brand-50 text-brand-700' : 'border-brand-200 bg-white text-brand-700',
                inScope && props.editable && 'cursor-pointer',
              )}
            >
              {g.code}
              {inScope && a?.source === 'auto' && <span className="font-sans text-[10px]">auto</span>}
              {inScope && props.editable && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); props.onToggleLock(g.id) }} title={a?.locked ? 'Unlock' : 'Lock (auto-allocate will keep it)'} className="font-sans">{a?.locked ? '🔒' : '🔓'}</button>
                  {!a?.locked && <button onClick={(e) => { e.stopPropagation(); props.onRemove(g.id) }} title="Unallocate" className="font-sans text-slate-400 hover:text-rose-600">×</button>}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {evaluation && (
        <div className={cx('mt-2 text-xs', fit === 'fits' ? 'text-emerald-700' : fit === 'warn' ? 'text-amber-800' : 'text-rose-700')}>
          {fit === 'fits' ? `✓ Fits · ${evaluation.studentsAfter}/${max} students after` : [...evaluation.hard, ...evaluation.soft].slice(0, 3).map((r) => <div key={r}>{evaluation.hard.includes(r) ? '✕' : '⚠'} {r}</div>)}
        </div>
      )}
      {evaluation && props.editable && !props.dragging && !ctxGroups.some((g) => g.id === activeGroup?.id) && (
        <Button variant={fit === 'blocked' ? 'secondary' : 'primary'} className="mt-2 w-full py-1.5 text-xs" onClick={props.onPlace}>
          {fit === 'blocked' ? 'Place anyway…' : 'Place here'}
        </Button>
      )}
    </div>
  )
}
