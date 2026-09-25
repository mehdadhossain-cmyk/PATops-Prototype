// Demo call-log history: ~8 weeks of contacts and announcements per active PAT.
import type { Channel, CommLog, ContactOutcome, ContactReason, Group, Student, User } from './types'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const day = 24 * 60 * 60 * 1000

const summaries: Record<ContactReason, string[]> = {
  welcome: ['Welcome call. Explained timetable, Canvas login and who to contact.', 'Checked they can log in to the student portal and email. All working.'],
  attendance: ['Missed two sessions this week. Said childcare issues; agreed to let me know in advance next time.', 'Called about low attendance. Student will attend Tuesday class and catch up on slides.', 'Reminded about the attendance policy and the 65% threshold.'],
  academic: ['Struggling with referencing. Shared Harvard guide and booked a study skills session.', 'Asked for help with the essay structure. Sent the assignment brief and exemplar.'],
  assessment: ['Reminder about the upcoming submission deadline. Student confirmed they are on track.', 'Has not submitted. Discussed an extension request process.', 'Checked Turnitin upload issue, resolved after clearing browser cache.'],
  wellbeing: ['Student mentioned feeling overwhelmed. Talked through wellbeing support and sent the form.', 'Follow-up on wellbeing conversation. Student feels more settled.'],
  finance: ['Student Finance payment delayed. Signposted to SFE helpline and student services.', 'Asked about maintenance loan dates. Shared the payment schedule.'],
  personal: ['Family bereavement. Offered support and explained mitigating circumstances.', 'Change of address and phone number. Asked student to update records.'],
  admin: ['Asked for an enrolment letter. Forwarded request to registry.', 'ID card not received. Directed to reception.'],
  other: ['General check-in.', 'Returned missed call. Question resolved.'],
}

const announcements = [
  'Reminder: timetable change next week. Classes move to room 2.14.',
  'Assessment 1 deadline is Friday 5pm. Submit via Turnitin.',
  'Library induction sessions available this week. Book via the portal.',
  'Reading week next week, no classes. Use the time to catch up.',
  'Student Finance: check your SFE account for the next payment date.',
  'Wellbeing drop-in on Wednesday 12–2pm at reception.',
]

function weighted<T extends string>(rand: () => number, table: [T, number][]): T {
  const total = table.reduce((n, [, w]) => n + w, 0)
  let r = rand() * total
  for (const [v, w] of table) {
    if ((r -= w) <= 0) return v
  }
  return table[0][0]
}

export function buildCommsSeed(users: User[], groups: Group[], students: Student[]): CommLog[] {
  const rand = rng(424242)
  const now = Date.now()
  const logs: CommLog[] = []
  let n = 0
  const at = (daysAgo: number) => {
    const d = new Date(now - daysAgo * day)
    d.setHours(9 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0)
    // Never in the future: move today's later times back to yesterday.
    if (d.getTime() > now) d.setTime(d.getTime() - day)
    return d.toISOString()
  }

  const pats = users.filter((u) => u.role === 'pat' && u.status === 'active')
  pats.forEach((pat, pi) => {
    // A few PATs log very little, so the oversight screens have something to show.
    const engagement = pi % 9 === 4 ? 0.15 : 0.5 + rand() * 0.8
    const myGroups = groups.filter((g) => g.patId === pat.id)
    const myStudents = students.filter((s) => s.status === 'active' && myGroups.some((g) => g.id === s.groupId))

    for (const s of myStudents) {
      const contacts = Math.floor(rand() * 5 * engagement)
      for (let c = 0; c < contacts; c++) {
        const ago = Math.floor(rand() * 56)
        const channel = weighted<Channel>(rand, [['phone', 30], ['whatsapp', 25], ['email', 20], ['in_person', 15], ['sms', 10]])
        const reason = weighted<ContactReason>(rand, [['attendance', 25], ['assessment', 20], ['academic', 15], ['welcome', 8], ['wellbeing', 8], ['finance', 8], ['personal', 6], ['admin', 6], ['other', 4]])
        const outcome: ContactOutcome =
          channel === 'phone' ? weighted(rand, [['reached', 60], ['no_answer', 25], ['left_message', 15]]) : channel === 'in_person' ? 'reached' : rand() < 0.8 ? 'reached' : 'no_answer'
        const when = at(ago)
        const hasFollowUp = rand() < 0.22
        const fuDate = hasFollowUp ? new Date(new Date(when).getTime() + (3 + Math.floor(rand() * 8)) * day).toISOString().slice(0, 10) : null
        const fuDone = fuDate && new Date(fuDate).getTime() < now - day && rand() < 0.7 ? new Date(fuDate).toISOString() : null
        logs.push({
          id: `cl-${++n}`,
          authorId: pat.id,
          kind: 'individual',
          studentId: s.id,
          groupIds: [],
          channel,
          direction: rand() < 0.75 ? 'outbound' : 'inbound',
          outcome,
          reason,
          summary: outcome === 'reached' ? summaries[reason][Math.floor(rand() * summaries[reason].length)] : outcome === 'no_answer' ? 'No answer. Will try again.' : 'Left a voicemail asking the student to call back.',
          at: when,
          loggedAt: new Date(new Date(when).getTime() + Math.floor(rand() * 3) * 60 * 60 * 1000).toISOString(),
          followUpDate: fuDate,
          followUpDoneAt: fuDone,
          voidedAt: null,
          voidReason: '',
        })
      }
    }

    // Roughly weekly announcements to each group.
    for (const g of myGroups) {
      for (let week = 0; week < 8; week++) {
        if (rand() > engagement) continue
        const when = at(week * 7 + Math.floor(rand() * 5))
        logs.push({
          id: `cl-${++n}`,
          authorId: pat.id,
          kind: 'announcement',
          studentId: null,
          groupIds: [g.id],
          channel: rand() < 0.5 ? 'whatsapp' : 'email',
          direction: 'outbound',
          outcome: 'reached',
          reason: 'admin',
          summary: announcements[Math.floor(rand() * announcements.length)],
          at: when,
          loggedAt: when,
          followUpDate: null,
          followUpDoneAt: null,
          voidedAt: null,
          voidReason: '',
        })
      }
    }
  })
  return logs.sort((a, b) => a.at.localeCompare(b.at))
}
