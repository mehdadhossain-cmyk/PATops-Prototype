// Demo LSAs for fake students, using the same fields as the PAT LSA records sheet.
import type { Group, Lsa, LsaUpdate, Student } from './types'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const day = 24 * 60 * 60 * 1000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const comments = [
  'Agreed weekly check-in on Tuesdays after class.',
  'Student to attend study skills sessions; reviewing progress at next follow-up.',
  'Extra time arranged for in-class tests.',
  'Referred to the library for assignment support. Going well so far.',
  'Reviewed at follow-up: student is engaging with the plan.',
  '',
]

export function buildLsaSeed(groups: Group[], students: Student[]) {
  const rand = rng(31337)
  const now = Date.now()
  const lsas: Lsa[] = []
  const lsaUpdates: LsaUpdate[] = []
  const patOf = new Map(groups.map((g) => [g.id, g.patId]))
  for (const s of students) {
    const patId = patOf.get(s.groupId)
    if (s.status !== 'active' || !patId || rand() > 0.08) continue
    const start = now - (10 + Math.floor(rand() * 110)) * day
    const r = rand()
    const ended = r < 0.12
    const end = ended ? iso(now - (2 + Math.floor(rand() * 20)) * day) : r < 0.35 ? iso(now + (30 + Math.floor(rand() * 120)) * day) : null
    // Follow-ups: mostly in the next few weeks, some overdue.
    const follow = ended ? null : iso(now + (Math.floor(rand() * 40) - 12) * day)
    const comment = comments[Math.floor(rand() * comments.length)]
    const id = `lsa-${lsas.length + 1}`
    const updated = new Date(Math.min(start + Math.floor(rand() * 30) * day, now - 3600000)).toISOString()
    lsas.push({
      id, studentId: s.id, startDate: iso(start), endDate: end, nextFollowUp: follow, comments: comment,
      createdBy: patId, createdAt: new Date(start).toISOString(), updatedAt: updated, updatedBy: patId,
    })
    lsaUpdates.push({ id: `lu-${lsaUpdates.length + 1}`, lsaId: id, at: new Date(start).toISOString(), by: patId, summary: `LSA signed (start ${iso(start)})` })
    if (comment) lsaUpdates.push({ id: `lu-${lsaUpdates.length + 1}`, lsaId: id, at: updated, by: patId, summary: `Comment: ${comment}` })
  }
  return { lsas, lsaUpdates }
}
