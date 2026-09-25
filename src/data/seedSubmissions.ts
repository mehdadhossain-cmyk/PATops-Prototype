// Demo submission periods: one closed (mostly resolved) and one open (follow-up in progress).
import type { FollowUpStatus, Group, NonSubmission, Student, SubmissionPeriod } from './types'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const day = 24 * 60 * 60 * 1000
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10)

const assessments: Record<string, string[]> = {
  'crs-bm': ['4BM001 Principles of Management: Essay', '4BM002 Business Environment: Report'],
  'crs-hsc': ['4HS001 Foundations of Health: Portfolio', '4HS002 Social Policy: Essay'],
  'crs-comp': ['4CS001 Programming: Project', '4CS002 Computer Systems: Exam'],
  'crs-ci': ['4CI001 Creative Practice: Portfolio'],
  'crs-acc': ['4AC001 Financial Accounting: Test', '4AC002 Business Maths: Report'],
  'crs-tm': ['4TM001 Tourism Industry: Report'],
}

export function buildSubmissionsSeed(groups: Group[], students: Student[]) {
  const rand = rng(990)
  const now = Date.now()
  const periods: SubmissionPeriod[] = [
    {
      id: 'sp-1', name: 'Semester 1 final assessments', intakeIds: ['in-wlv-2601', 'in-c-2601'],
      deadline: isoDate(now - 70 * day), followUpBy: isoDate(now - 60 * day), status: 'closed', createdBy: 'u-admin-1', createdAt: new Date(now - 69 * day).toISOString(),
    },
    {
      id: 'sp-2', name: 'Semester 2 assessment 1', intakeIds: ['in-wlv-2509', 'in-wlv-2601', 'in-c-2601', 'in-d-2605'],
      deadline: isoDate(now - 6 * day), followUpBy: isoDate(now + 4 * day), status: 'open', createdBy: 'u-admin-1', createdAt: new Date(now - 5 * day).toISOString(),
    },
  ]
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const items: NonSubmission[] = []
  const notes: Partial<Record<FollowUpStatus, string>> = {
    contacted: 'Spoke to the student; they were unaware of the deadline. Sent the brief again.',
    no_response: 'Called twice and sent a WhatsApp. No reply yet.',
    will_submit: 'Student will submit at the next resubmission point.',
    extension: 'Extension approved by the module leader.',
    mitigating: 'Mitigating circumstances claim submitted (illness).',
    submitted_late: 'Submitted late; confirmed on the portal.',
    withdrawn: 'Student has interrupted their studies.',
  }

  for (const p of periods) {
    const closed = p.status === 'closed'
    for (const s of students) {
      const g = groupById.get(s.groupId)
      if (!g || !p.intakeIds.includes(g.intakeId) || s.status === 'withdrawn' || rand() > 0.12) continue
      const list = assessments[g.courseId] ?? ['Assessment 1']
      const missed = rand() < 0.3 ? list : [list[Math.floor(rand() * list.length)]]
      for (const a of missed) {
        const r = rand()
        const status: FollowUpStatus = closed
          ? r < 0.45 ? 'submitted_late' : r < 0.65 ? 'mitigating' : r < 0.8 ? 'extension' : r < 0.88 ? 'withdrawn' : 'no_response'
          : r < 0.38 ? 'not_contacted' : r < 0.55 ? 'contacted' : r < 0.65 ? 'no_response' : r < 0.78 ? 'will_submit' : r < 0.86 ? 'extension' : r < 0.93 ? 'mitigating' : 'submitted_late'
        const updated = status === 'not_contacted' ? null : new Date(Math.min(new Date(p.deadline).getTime() + (1 + Math.floor(rand() * (closed ? 20 : 5))) * day + 11 * 3600000, now - 3600000)).toISOString()
        items.push({
          id: `ns-${items.length + 1}`,
          periodId: p.id,
          studentId: s.id,
          assessment: a,
          status,
          note: notes[status] ?? '',
          expectedDate: status === 'will_submit' ? isoDate(now + (3 + Math.floor(rand() * 10)) * day) : null,
          updatedAt: updated,
          updatedBy: updated ? g.patId : null,
        })
      }
    }
  }
  return { submissionPeriods: periods, nonSubmissions: items }
}
