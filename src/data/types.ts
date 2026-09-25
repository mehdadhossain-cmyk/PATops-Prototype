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

export interface DbState {
  version: number
  campuses: Campus[]
  users: User[]
  trainingModules: TrainingModule[]
  trainingProgress: TrainingProgress[]
  audit: AuditEvent[]
}
