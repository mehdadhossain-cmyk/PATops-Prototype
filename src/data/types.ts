// Core domain types for the PATops prototype.
// These are kept backend-agnostic so the localStorage store can later be
// swapped for a real API without touching the UI.

export type Role = 'manager' | 'admin' | 'lead' | 'pat'

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'PAT Manager',
  admin: 'PAT Admin',
  lead: 'PAT Lead',
  pat: 'PAT',
}

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type Shift = 'morning' | 'evening'

export type StaffStatus = 'invited' | 'onboarding' | 'active' | 'inactive'

export interface Campus {
  id: string
  name: string
}

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Leads and PATs belong to a campus; admins and the manager cover all campuses. */
  campusId: string | null
  status: StaffStatus
  startDate: string // ISO date
  phone: string
  shift: Shift | null
  workDays: Weekday[]
  emergencyContact: EmergencyContact | null
  bio: string
  profileCompletedAt: string | null
  createdAt: string
  createdBy: string | null
}

export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  answerIndex: number
}

export interface TrainingModule {
  id: string
  title: string
  description: string
  /** Plain text / markdown-lite body shown to the trainee. */
  content: string
  /** Optional external resource (video, PDF, SharePoint link later). */
  resourceUrl: string
  estimatedMinutes: number
  order: number
  required: boolean
  quiz: QuizQuestion[]
  /** Percentage needed to pass the quiz (0-100). */
  passMark: number
  /** Days after the trainee's start date by which this module is due. */
  dueDays: number
  archived: boolean
}

export interface QuizAttempt {
  at: string
  score: number // percentage
  passed: boolean
}

export interface TrainingProgress {
  userId: string
  moduleId: string
  startedAt: string | null
  /** Trainee confirmed they read/watched the material. */
  acknowledgedAt: string | null
  attempts: QuizAttempt[]
  /** Set when material acknowledged AND quiz passed (or no quiz). */
  completedAt: string | null
}

export interface AuditEvent {
  id: string
  at: string
  actorId: string
  /** Who/what the event is about - used later for one-click per-PAT export. */
  subjectUserId: string | null
  type: string
  message: string
}

export interface University {
  id: string
  name: string
  shortName: string
}

export interface Course {
  id: string
  name: string
  universityId: string
}

export type IntakeStatus = 'planning' | 'active' | 'closed'

/** A cohort start for one partner university, e.g. "UoW September 2026". */
export interface Intake {
  id: string
  universityId: string
  name: string
  startDate: string // ISO date
  endDate: string // ISO date, expected programme end
  status: IntakeStatus
}

/** Teaching session blocks used for allocation: morning 09-13, afternoon 13-17, evening 17-21. */
export type Slot = 'Mor' | 'Afr' | 'Eve'
export const SLOTS: Slot[] = ['Mor', 'Afr', 'Eve']
export const SLOT_LABEL: Record<Slot, string> = { Mor: 'Morning', Afr: 'Afternoon', Eve: 'Evening' }

export interface ClassSession {
  day: Weekday
  slots: Slot[]
}

/** A teaching group. Group membership is decided by other departments and imported here. */
export interface Group {
  id: string
  code: string
  intakeId: string
  courseId: string
  campusId: string
  shift: Shift
  classDays: Weekday[]
  startTime: string // "09:00"
  endTime: string // "13:00"
  patId: string | null
  /** Structured class sessions (from the allocation sheet). When absent they're derived from classDays and times. */
  sessions?: ClassSession[]
  /** The "Group Day" text exactly as it appeared on the allocation sheet. */
  rawDays?: string
  room?: string
  /** Expected size before students are enrolled (from the allocation sheet). */
  expectedStudents?: number | null
  /** Allocation-sheet columns kept so exports match the original layout. */
  sheet?: { university: string; course: string; cohort: string; year: string; semester: string; startingFrom: string; letter: string }
}

export type StudentStatus = 'active' | 'interrupted' | 'withdrawn'

export interface Student {
  id: string
  firstName: string
  lastName: string
  personalEmail: string
  uniEmail: string
  phone: string
  emergencyContactName: string
  emergencyContactPhone: string
  /** EBS person code. */
  ebsPersonCode: string
  /** Partner university student ID. */
  uniStudentId: string
  groupId: string
  status: StudentStatus
}

export type Channel = 'in_person' | 'phone' | 'sms' | 'email' | 'whatsapp' | 'teams'
export const CHANNEL_LABEL: Record<Channel, string> = {
  in_person: 'In person',
  phone: 'Phone call',
  sms: 'Text message',
  email: 'Email',
  whatsapp: 'WhatsApp',
  teams: 'Teams',
}

export type ContactReason =
  | 'welcome'
  | 'attendance'
  | 'academic'
  | 'assessment'
  | 'wellbeing'
  | 'finance'
  | 'personal'
  | 'admin'
  | 'other'
export const REASON_LABEL: Record<ContactReason, string> = {
  welcome: 'Welcome / induction',
  attendance: 'Attendance',
  academic: 'Academic support',
  assessment: 'Assessment / submission',
  wellbeing: 'Wellbeing',
  finance: 'Finance / SFE',
  personal: 'Personal circumstances',
  admin: 'Admin / enrolment',
  other: 'Other',
}

export type ContactOutcome = 'reached' | 'no_answer' | 'left_message'
export const OUTCOME_LABEL: Record<ContactOutcome, string> = {
  reached: 'Spoke / replied',
  no_answer: 'No answer',
  left_message: 'Left message',
}

/** One logged interaction with a student, or an announcement to one or more groups. */
export interface CommLog {
  id: string
  authorId: string
  kind: 'individual' | 'announcement'
  /** Set for individual contacts. */
  studentId: string | null
  /** Set for announcements. */
  groupIds: string[]
  channel: Channel
  direction: 'outbound' | 'inbound'
  outcome: ContactOutcome
  reason: ContactReason
  summary: string
  /** When the contact happened (may be earlier than when it was logged). */
  at: string
  loggedAt: string
  followUpDate: string | null
  followUpDoneAt: string | null
  /** Entries are never deleted; they're voided with a reason to keep the audit trail. */
  voidedAt: string | null
  voidReason: string
}

export type WellbeingStatus = 'form_sent' | 'submitted' | 'approved' | 'declined' | 'closed'

/** Broad category only. Details stay in the wellbeing team's own system (data minimisation). */
export type WellbeingCategory = 'health' | 'pregnancy' | 'mental_health' | 'caring' | 'bereavement' | 'disability' | 'other'
export const WELLBEING_CATEGORY_LABEL: Record<WellbeingCategory, string> = {
  health: 'Physical health / illness',
  pregnancy: 'Pregnancy / maternity',
  mental_health: 'Mental health',
  caring: 'Caring responsibilities',
  bereavement: 'Bereavement',
  disability: 'Disability / long-term condition',
  other: 'Other',
}

/** One wellbeing referral for a student, from form sent through to plan closure. */
export interface WellbeingCase {
  id: string
  studentId: string
  category: WellbeingCategory
  status: WellbeingStatus
  formSentAt: string
  formSentBy: string
  submittedAt: string | null
  decisionAt: string | null
  /** Who recorded the wellbeing team's decision in PATops. */
  decisionRecordedBy: string | null
  declineReason: string
  /** Bi-weekly meetings are scheduled from this date (the approval date by default). */
  planStart: string | null
  closedAt: string | null
  closeReason: string
}

/** A fortnightly wellbeing meeting that took place (or was attempted). */
export interface WellbeingMeeting {
  id: string
  caseId: string
  /** Which fortnight of the plan this meeting covers (0 = first). */
  cycle: number
  heldAt: string
  outcome: 'held' | 'no_show'
  /** PAT confirms the Teams meeting was recorded, as the wellbeing team requires. */
  recorded: boolean
  /** When the PAT confirmed the support was logged in the wellbeing team's system. */
  loggedAt: string | null
  recordedBy: string
}

/** One student's attendance as reported for a week (cumulative % to date, as on the weekly sheet). */
export interface AttendanceRecord {
  studentId: string
  /** ISO date of the Friday/Sunday the report covers up to. */
  weekEnding: string
  /** Overall attendance to date, 0-100. */
  overall: number
}

export interface AttendanceUpload {
  id: string
  weekEnding: string
  uploadedAt: string
  uploadedBy: string
  source: string
  rows: number
}

/** Where a student at risk is in the retention process. */
export type RetentionStage = 'new' | 'pat_contacted' | 'admin_review' | 'action_plan' | 'withdrawal_recommended' | 'resolved' | 'withdrawn'
export const STAGE_LABEL: Record<RetentionStage, string> = {
  new: 'Newly flagged',
  pat_contacted: 'PAT contacted',
  admin_review: 'Admin reviewing',
  action_plan: 'Action plan agreed',
  withdrawal_recommended: 'Withdrawal recommended',
  resolved: 'Resolved / kept',
  withdrawn: 'Withdrawn',
}

/** Entry in an at-risk student's retention history, written by PATs and admins. */
export interface RiskNote {
  id: string
  studentId: string
  authorId: string
  at: string
  text: string
  /** Set when this note moved the student to a new stage. */
  stage: RetentionStage | null
}

/** A submission window for one or more intakes, e.g. "Semester 1 final assessments". */
export interface SubmissionPeriod {
  id: string
  name: string
  intakeIds: string[]
  deadline: string // ISO date the assessments were due
  /** PATs should have followed up every student by this date. */
  followUpBy: string
  status: 'open' | 'closed'
  createdBy: string
  createdAt: string
}

export type FollowUpStatus =
  | 'not_contacted'
  | 'contacted'
  | 'no_response'
  | 'will_submit'
  | 'extension'
  | 'mitigating'
  | 'submitted_late'
  | 'withdrawn'

export const FOLLOW_UP_LABEL: Record<FollowUpStatus, string> = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  no_response: 'No response',
  will_submit: 'Will submit',
  extension: 'Extension granted',
  mitigating: 'Mitigating circumstances',
  submitted_late: 'Submitted late',
  withdrawn: 'Withdrawn / interrupted',
}

/** Outcomes that close the follow-up. */
export const RESOLVED_STATUSES: FollowUpStatus[] = ['extension', 'mitigating', 'submitted_late', 'withdrawn']

/** One missed assessment for one student in a submission period. */
export interface NonSubmission {
  id: string
  periodId: string
  studentId: string
  assessment: string
  status: FollowUpStatus
  note: string
  /** When the student says they'll submit (for "will submit"). */
  expectedDate: string | null
  updatedAt: string | null
  updatedBy: string | null
}

/** A Learning Support Agreement signed between a PAT and a student (mirrors the PAT LSA records sheet). */
export interface Lsa {
  id: string
  studentId: string
  startDate: string // ISO date
  endDate: string | null
  nextFollowUp: string | null
  /** Latest comment, as shown in the "Comments" column of the sheet. */
  comments: string
  createdBy: string
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/** Every change to an LSA, so the history isn't lost when a comment is overwritten. */
export interface LsaUpdate {
  id: string
  lsaId: string
  at: string
  by: string
  summary: string
}

export type LeaveType = 'annual' | 'toil' | 'medical_appointment' | 'unpaid' | 'other'
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Annual leave',
  toil: 'Time off in lieu',
  medical_appointment: 'Medical appointment',
  unpaid: 'Unpaid leave',
  other: 'Other',
}

export type LeaveStatus = 'awaiting_cover' | 'awaiting_lead' | 'awaiting_manager' | 'approved' | 'rejected' | 'cancelled'
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  awaiting_cover: 'Waiting for cover',
  awaiting_lead: 'Waiting for PAT Lead',
  awaiting_manager: 'Waiting for PAT Manager',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export interface Decision {
  by: string
  at: string
  approved: boolean
  note: string
}

export interface LeaveRequest {
  id: string
  requesterId: string
  type: LeaveType
  startDate: string
  endDate: string
  reason: string
  status: LeaveStatus
  createdAt: string
  leadDecision: Decision | null
  managerDecision: Decision | null
  cancelledAt: string | null
}

/** One class session during the leave that needs another PAT to cover it. */
export interface CoverSlot {
  id: string
  leaveId: string
  date: string
  groupId: string
  coverPatId: string
  status: 'pending' | 'accepted' | 'declined'
  respondedAt: string | null
  note: string
}

/** A task an admin/lead assigns to staff (or a personal reminder, when assigned to yourself). */
export interface AssignedTask {
  id: string
  title: string
  description: string
  dueDate: string | null
  createdBy: string
  createdAt: string
  assigneeIds: string[]
  completions: { userId: string; at: string }[]
  personal: boolean
}

/** Per-PAT allocation settings (what used to live in the allocation notes tab). */
export interface AllocationProfile {
  userId: string
  /** e.g. "09:00-17:00". Defaults from the PAT's shift when empty. */
  workHours: string | null
  availableFrom: string | null
  maxStudents: number | null
  minStudents: number | null
  targetGroups: number | null
  /** Target number of groups per university short name, e.g. { CCCU: 2, UOW: 1 }. */
  uniTargets: Record<string, number>
  preferredCampusIds: string[]
  notes: string
}

export interface DraftAssignment {
  patId: string | null
  source: 'current' | 'manual' | 'auto'
  locked: boolean
  /** Why the auto-allocator chose this PAT. */
  reason: string
  /** Required when an admin places a group against a hard rule. */
  overrideReason: string
}

export interface AllocationDraft {
  id: string
  name: string
  groupIds: string[]
  assignments: Record<string, DraftAssignment>
  createdBy: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'published'
  publishedAt: string | null
  publishedBy: string | null
}

export interface DbState {
  version: number
  campuses: Campus[]
  universities: University[]
  courses: Course[]
  intakes: Intake[]
  groups: Group[]
  students: Student[]
  comms: CommLog[]
  wellbeingCases: WellbeingCase[]
  wellbeingMeetings: WellbeingMeeting[]
  attendance: AttendanceRecord[]
  attendanceUploads: AttendanceUpload[]
  riskNotes: RiskNote[]
  submissionPeriods: SubmissionPeriod[]
  nonSubmissions: NonSubmission[]
  lsas: Lsa[]
  lsaUpdates: LsaUpdate[]
  leaveRequests: LeaveRequest[]
  coverSlots: CoverSlot[]
  assignedTasks: AssignedTask[]
  allocationProfiles: AllocationProfile[]
  allocationDrafts: AllocationDraft[]
  users: User[]
  trainingModules: TrainingModule[]
  trainingProgress: TrainingProgress[]
  audit: AuditEvent[]
}
