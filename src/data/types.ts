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

/** A teaching group. Group membership is decided by other UKMC departments and imported here. */
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
  /** UKMC EBS person code. */
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

export interface DbState {
  version: number
  campuses: Campus[]
  universities: University[]
  courses: Course[]
  intakes: Intake[]
  groups: Group[]
  students: Student[]
  comms: CommLog[]
  users: User[]
  trainingModules: TrainingModule[]
  trainingProgress: TrainingProgress[]
  audit: AuditEvent[]
}
