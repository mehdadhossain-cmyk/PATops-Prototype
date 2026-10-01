import type { ModuleStatus } from '../data/logic'
import { PAT_LEVEL_LABEL, ROLE_LABEL, type PatLevel, type Role, type StaffStatus, type StudentStatus } from '../data/types'
import { Badge } from './ui'

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  const map = {
    invited: ['Invited', 'purple'],
    onboarding: ['Onboarding', 'amber'],
    active: ['Active', 'green'],
    inactive: ['Inactive', 'slate'],
  } as const
  const [label, tone] = map[status]
  return <Badge tone={tone}>{label}</Badge>
}

export function RoleBadge({ role }: { role: Role }) {
  const tone = ({ owner: 'red', manager: 'purple', admin: 'blue', lead: 'amber', pat: 'slate' } as const)[role]
  return <Badge tone={tone}>{ROLE_LABEL[role]}</Badge>
}

export function LevelBadge({ level }: { level: PatLevel | null }) {
  if (!level) return null
  const tone = ({ trainee: 'amber', junior: 'blue', senior: 'green' } as const)[level]
  return <Badge tone={tone}>{PAT_LEVEL_LABEL[level]}</Badge>
}

export function ModuleStatusBadge({ status, overdue }: { status: ModuleStatus; overdue?: boolean }) {
  if (status === 'completed') return <Badge tone="green">Completed</Badge>
  if (status === 'locked') return <Badge>Locked</Badge>
  if (overdue) return <Badge tone="red">Overdue</Badge>
  if (status === 'in_progress') return <Badge tone="amber">In progress</Badge>
  return <Badge>Not started</Badge>
}

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const map = { active: ['Active', 'green'], interrupted: ['Interrupted', 'amber'], withdrawn: ['Withdrawn', 'slate'] } as const
  const [label, tone] = map[status]
  return <Badge tone={tone}>{label}</Badge>
}
