// Demo weekly attendance (last 10 weeks) and retention notes for at-risk students.
import type { AttendanceRecord, AttendanceUpload, Group, Intake, RetentionStage, RiskNote, Student } from './types'
import { RISK_THRESHOLD } from './risk'

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const day = 24 * 60 * 60 * 1000
const WEEKS = 10

/** The most recent Friday on or before today. */
export function lastFriday(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 2) % 7))
  return d
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function buildAttendanceSeed(groups: Group[], students: Student[], intakes: Intake[]) {
  const rand = rng(6565)
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5
  // History runs to the previous completed week, so this week's report is left for the demo upload.
  const friday = lastFriday(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const weeks = Array.from({ length: WEEKS }, (_, i) => isoDate(new Date(friday.getTime() - (WEEKS - 1 - i) * 7 * day)))
  const intakeStart = new Map(intakes.map((i) => [i.id, i.startDate]))
  const groupIntake = new Map(groups.map((g) => [g.id, g.intakeId]))
  const groupPat = new Map(groups.map((g) => [g.id, g.patId]))

  const attendance: AttendanceRecord[] = []
  const riskNotes: RiskNote[] = []
  const counts = new Map<string, number>()

  for (const s of students) {
    if (s.status === 'withdrawn') continue
    const start = intakeStart.get(groupIntake.get(s.groupId) ?? '')
    if (!start) continue
    const r = rand()
    let level = r < 0.7 ? 86 + gauss() * 10 : r < 0.9 ? 68 + gauss() * 10 : 52 + gauss() * 12
    const drift = (rand() - 0.55) * 3
    let last = 0
    for (const w of weeks) {
      if (w < start) continue
      // First weeks swing more; cumulative attendance settles over time.
      level = Math.max(15, Math.min(100, level + drift + gauss() * 3))
      last = Math.round(level * 10) / 10
      attendance.push({ studentId: s.id, weekEnding: w, overall: last })
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }

    // Retention history for some students currently at risk.
    if (last && last < RISK_THRESHOLD && rand() < 0.65) {
      const patId = groupPat.get(s.groupId) ?? 'u-admin-1'
      const t0 = friday.getTime() - Math.floor(rand() * 35) * day
      const steps: [string, string, RetentionStage | null][] = [
        [patId, 'Called the student about attendance. Says shift work clashes with Tuesday classes; will try to swap shifts.', 'pat_contacted'],
        ['u-admin-1', 'Reviewed attendance history. Invited the student to a retention meeting.', 'admin_review'],
        ['u-admin-1', 'Retention meeting held. Agreed to attend all sessions for the next 4 weeks and catch up on missed content with the PAT.', 'action_plan'],
        [patId, 'Student attended both sessions this week. Encouraged them to keep going.', null],
      ]
      const n = 1 + Math.floor(rand() * steps.length)
      for (let i = 0; i < n; i++) {
        const [author, text, stage] = steps[i]
        riskNotes.push({
          id: `rn-${riskNotes.length + 1}`,
          studentId: s.id,
          authorId: author,
          // Working hours: 09:00-17:00.
          at: new Date(Math.min(t0 + i * 6 * day + (9 + Math.floor(rand() * 8)) * 3600000 + Math.floor(rand() * 60) * 60000, Date.now() - 3600000)).toISOString(),
          text,
          stage,
        })
      }
    }
  }

  const attendanceUploads: AttendanceUpload[] = weeks
    .filter((w) => counts.get(w))
    .map((w, i) => ({
      id: `au-${i + 1}`,
      weekEnding: w,
      // Uploaded the following Monday morning (or an hour ago for this week's report).
      uploadedAt: new Date(Math.min(new Date(w).getTime() + 3 * day + 10 * 3600000, Date.now() - 3600000)).toISOString(),
      uploadedBy: 'u-admin-1',
      source: `attendance-week-ending-${w}.csv`,
      rows: counts.get(w)!,
    }))

  return { attendance, attendanceUploads, riskNotes }
}
