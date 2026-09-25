// Demo allocation data: per-PAT settings, sheet-style class days for the January 2027 groups,
// and a draft allocation to work on.
import type { AllocationDraft, AllocationProfile, Campus, Group, User } from './types'
import { groupSessions, parseGroupDays } from './allocation'

const MANCHESTER = ['c-salford', 'c-college-house', 'c-abarna']

/** Demo groups for the same PAT sometimes shared a time slot; move the later one to the afternoon. */
export function fixSeedClashes(groups: Group[]): Group[] {
  const byPat = new Map<string, Group[]>()
  return groups.map((g) => {
    if (!g.patId || g.sessions) return g
    const mine = byPat.get(g.patId) ?? []
    const clash = (x: Group) => mine.some((o) => groupSessions(o).some((os) => groupSessions(x).some((s) => s.day === os.day && s.slots.some((sl) => os.slots.includes(sl)))))
    const fixed = clash(g) ? { ...g, startTime: '13:30', endTime: '17:00' } : g
    byPat.set(g.patId, [...mine, fixed])
    return fixed
  })
}

const JAN27_DAYS = [
  'Monday Full/Tuesday Morning', 'Mon Eve / Tue Eve', 'Tuesday / Wednesday Mor', 'Wed Eve / Thu Eve',
  'Friday Mor / Saturday Afr', 'Tuesday Evening / Wednesday Evening', 'Thursday Fullday / Friday Mor', 'Mon Eve/Tues Evening',
  'Wednesday Full', 'Thu Eve / Sat Afr', 'Friday Afternoon/Saturday Afternoon', 'Monday Eve / Wednesday Eve',
]

/** Gives the planned January 2027 groups sheet-style class days and expected sizes. */
export function enrichPlannedGroups(groups: Group[]): Group[] {
  let i = 0
  return groups.map((g) => {
    if (g.intakeId !== 'in-wlv-2701') return g
    const raw = JAN27_DAYS[i % JAN27_DAYS.length]
    const size = 24 + ((i * 7) % 17)
    i++
    const sessions = parseGroupDays(raw).sessions
    const evening = sessions.some((s) => s.slots.includes('Eve'))
    return {
      ...g,
      rawDays: raw,
      sessions,
      classDays: sessions.map((s) => s.day),
      shift: evening ? 'evening' : 'morning',
      startTime: evening ? '17:30' : sessions.some((s) => s.slots.includes('Mor')) ? '09:30' : '13:30',
      endTime: evening ? '21:00' : sessions.some((s) => s.slots.includes('Afr')) ? '17:00' : '13:30',
      expectedStudents: size,
    }
  })
}

export function buildAllocationSeed(users: User[], groups: Group[], campuses: Campus[]): { groups: Group[]; allocationProfiles: AllocationProfile[]; allocationDrafts: AllocationDraft[] } {
  const fixed = enrichPlannedGroups(fixSeedClashes(groups))
  const pats = users.filter((u) => u.role === 'pat')
  const profiles: AllocationProfile[] = pats.map((u, i) => ({
    userId: u.id,
    workHours: null,
    availableFrom: u.status === 'active' ? null : '2027-01-11',
    maxStudents: null,
    minStudents: i % 5 === 0 ? 100 : null,
    targetGroups: i % 4 === 0 ? 3 : null,
    uniTargets: (i % 7 === 0 ? { UOW: 3 } : {}) as Record<string, number>,
    preferredCampusIds: u.campusId && MANCHESTER.includes(u.campusId) ? MANCHESTER.filter((c) => c !== u.campusId && campuses.some((x) => x.id === c)) : [],
    notes: u.status === 'active' ? '' : 'New joiner: allocate from January 2027',
  }))
  const scope = fixed.filter((g) => g.intakeId === 'in-wlv-2701' || (!g.patId && g.intakeId === 'in-wlv-2609'))
  const now = new Date().toISOString()
  const draft: AllocationDraft = {
    id: 'ad-jan27',
    name: 'January 2027 allocation',
    groupIds: scope.map((g) => g.id),
    assignments: Object.fromEntries(scope.map((g) => [g.id, { patId: g.patId, source: 'current', locked: false, reason: '', overrideReason: '' }])),
    createdBy: 'u-admin-1',
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    publishedAt: null,
    publishedBy: null,
  }
  return { groups: fixed, allocationProfiles: profiles, allocationDrafts: [draft] }
}
