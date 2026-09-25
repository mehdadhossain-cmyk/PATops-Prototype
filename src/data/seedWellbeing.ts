// Demo wellbeing referrals and plans with a realistic mix of compliance.
import type { Group, Student, User, WellbeingCase, WellbeingCategory, WellbeingMeeting } from './types'
import { cycleDue } from './wellbeing'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const day = 24 * 60 * 60 * 1000
const categories: WellbeingCategory[] = ['health', 'health', 'mental_health', 'mental_health', 'pregnancy', 'caring', 'bereavement', 'disability', 'other']

export function buildWellbeingSeed(users: User[], groups: Group[], students: Student[]): { wellbeingCases: WellbeingCase[]; wellbeingMeetings: WellbeingMeeting[] } {
  const rand = rng(777)
  const now = Date.now()
  const iso = (t: number) => new Date(Math.min(t, now - 60 * 60 * 1000)).toISOString()
  const cases: WellbeingCase[] = []
  const meetings: WellbeingMeeting[] = []
  const activePats = new Set(users.filter((u) => u.role === 'pat' && u.status === 'active').map((u) => u.id))
  const patOf = new Map(groups.map((g) => [g.id, g.patId]))

  for (const s of students) {
    const patId = patOf.get(s.groupId)
    if (s.status !== 'active' || !patId || !activePats.has(patId) || rand() > 0.055) continue
    const r = rand()
    const status: WellbeingCase['status'] = r < 0.6 ? 'approved' : r < 0.68 ? 'closed' : r < 0.78 ? 'declined' : r < 0.89 ? 'submitted' : 'form_sent'
    const id = `wb-${cases.length + 1}`
    const category = categories[Math.floor(rand() * categories.length)]

    let sentAgo: number
    if (status === 'form_sent') sentAgo = 1 + Math.floor(rand() * 12)
    else if (status === 'submitted') sentAgo = 4 + Math.floor(rand() * 6)
    else sentAgo = 20 + Math.floor(rand() * 90)
    const sent = now - sentAgo * day
    const submitted = status === 'form_sent' ? null : sent + (1 + Math.floor(rand() * 3)) * day
    const decided = status === 'form_sent' || status === 'submitted' ? null : submitted! + (2 + Math.floor(rand() * 4)) * day
    const closed = status === 'closed' ? Math.min(now - 3 * day, decided! + (30 + Math.floor(rand() * 40)) * day) : null

    const c: WellbeingCase = {
      id,
      studentId: s.id,
      category,
      status,
      formSentAt: iso(sent),
      formSentBy: patId,
      submittedAt: submitted ? iso(submitted) : null,
      decisionAt: decided ? iso(decided) : null,
      decisionRecordedBy: decided ? 'u-admin-2' : null,
      declineReason: status === 'declined' ? 'Circumstances do not meet the criteria for a wellbeing plan; signposted to student services.' : '',
      planStart: status === 'approved' || status === 'closed' ? iso(decided!).slice(0, 10) : null,
      closedAt: closed ? iso(closed) : null,
      closeReason: closed ? 'Circumstances resolved; student no longer needs the plan.' : '',
    }
    cases.push(c)

    if (!c.planStart) continue
    const reliability = rand() // some PAT/student pairs are much less consistent
    for (let i = 0; i < 20; i++) {
      const due = cycleDue(c, i).getTime()
      if (due > now - 1 * day || (closed && due > closed)) break
      if (rand() > 0.55 + reliability * 0.45) continue // meeting not held
      const held = due + Math.floor((rand() * 5 - 3) * day)
      const loggedLate = rand() > 0.5 + reliability * 0.5
      const logged = loggedLate ? null : held + Math.floor(rand() * 2) * day
      meetings.push({
        id: `wm-${meetings.length + 1}`,
        caseId: id,
        cycle: i,
        heldAt: iso(held),
        outcome: rand() < 0.9 ? 'held' : 'no_show',
        recorded: true,
        loggedAt: logged ? iso(logged) : null,
        recordedBy: patId,
      })
    }
  }
  return { wellbeingCases: cases, wellbeingMeetings: meetings }
}
