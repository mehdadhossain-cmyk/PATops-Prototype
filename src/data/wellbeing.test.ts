import { describe, expect, it } from 'vitest'
import type { WellbeingCase, WellbeingMeeting } from './types'
import { caseActions, compliance, nextOpenCycle, planCycles } from './wellbeing'

const now = new Date('2026-09-25T12:00:00')
const plan = (p: Partial<WellbeingCase> = {}): WellbeingCase => ({
  id: 'c1', studentId: 's1', category: 'health', status: 'approved', formSentAt: '2026-07-20T10:00:00', formSentBy: 'p',
  submittedAt: '2026-07-22T10:00:00', decisionAt: '2026-07-24T10:00:00', decisionRecordedBy: 'a', declineReason: '',
  planStart: '2026-07-24', closedAt: null, closeReason: '', ...p,
})
const meeting = (cycle: number, heldAt: string, loggedAt: string | null): WellbeingMeeting => ({
  id: `m${cycle}`, caseId: 'c1', cycle, heldAt, outcome: 'held', recorded: true, loggedAt, recordedBy: 'p',
})

describe('planCycles', () => {
  // Plan started 24 Jul: fortnights due 7 Aug, 21 Aug, 4 Sep, 18 Sep, then 2 Oct (upcoming).
  it('builds fortnights up to the next upcoming one and classifies each', () => {
    const ms = [
      meeting(0, '2026-08-07T10:00:00', '2026-08-07T15:00:00'),
      meeting(1, '2026-08-21T10:00:00', null),
      // fortnight 3 (4 Sep) not held
      meeting(3, '2026-09-24T10:00:00', null),
    ]
    const cycles = planCycles(plan(), ms, now)
    expect(cycles.map((c) => c.status)).toEqual(['complete', 'log_overdue', 'overdue', 'log_pending', 'due'])
  })
  it('has no fortnights before approval', () => {
    expect(planCycles(plan({ status: 'submitted', planStart: null }), [], now)).toEqual([])
  })
  it('stops at the close date', () => {
    const cycles = planCycles(plan({ status: 'closed', closedAt: '2026-08-25T10:00:00' }), [], now)
    expect(cycles).toHaveLength(2)
  })
})

describe('nextOpenCycle', () => {
  it('fills the earliest fortnight without a meeting', () => {
    expect(nextOpenCycle(plan(), [meeting(0, '2026-08-07T10:00:00', null), meeting(2, '2026-09-04T10:00:00', null)], now)).toBe(1)
  })
})

describe('caseActions', () => {
  it('asks to chase an unreturned form after a week', () => {
    expect(caseActions(plan({ status: 'form_sent', formSentAt: '2026-09-20T10:00:00' }), [], now)).toEqual([])
    expect(caseActions(plan({ status: 'form_sent', formSentAt: '2026-09-15T10:00:00' }), [], now)[0].kind).toBe('chase_form')
  })
  it('flags missed meetings and missing logs as urgent', () => {
    const acts = caseActions(plan(), [meeting(0, '2026-08-07T10:00:00', null)], now)
    expect(acts.filter((a) => a.urgent).map((a) => a.kind).sort()).toEqual(['log_overdue', 'meeting_overdue', 'meeting_overdue', 'meeting_overdue'])
  })
  it('does nothing for declined referrals', () => {
    expect(caseActions(plan({ status: 'declined', planStart: null }), [], now)).toEqual([])
  })
})

describe('compliance', () => {
  it('counts past fortnights held and logged', () => {
    const c = compliance([plan()], [meeting(0, '2026-08-07T10:00:00', '2026-08-07T15:00:00'), meeting(1, '2026-08-21T10:00:00', '2026-08-22T10:00:00')], now)
    // Past: fortnights 1-4 (fortnight 5 is due, not yet past). 2 complete, 2 not held.
    expect(c).toMatchObject({ activePlans: 1, pastMeetings: 4, complete: 2, percent: 50, overdueMeetings: 2, logsOutstanding: 0 })
  })
})
