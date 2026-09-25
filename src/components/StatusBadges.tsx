import type { ModuleStatus } from '../data/logic'
import { ROLE_LABEL, type Role, type StaffStatus } from '../data/types'
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
  const tone = ({ manager: 'purple', admin: 'blue', lead: 'amber', pat: 'slate' } as const)[role]
  return <Badge tone={tone}>{ROLE_LABEL[role]}</Badge>
}

export function ModuleStatusBadge({ status, overdue }: { status: ModuleStatus; overdue?: boolean }) {
  if (status === 'completed') return <Badge tone="green">Completed</Badge>
  if (status === 'locked') return <Badge>Locked</Badge>
  if (overdue) return <Badge tone="red">Overdue</Badge>
  if (status === 'in_progress') return <Badge tone="amber">In progress</Badge>
  return <Badge>Not started</Badge>
}
