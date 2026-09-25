// Demo assigned tasks with partial completion.
import type { AssignedTask, User } from './types'

const day = 24 * 60 * 60 * 1000
const iso = (n: number) => new Date(Date.now() + n * day).toISOString().slice(0, 10)

export function buildTasksSeed(users: User[]): { assignedTasks: AssignedTask[] } {
  const pats = users.filter((u) => u.role === 'pat' && u.status === 'active')
  const salford = pats.filter((u) => u.campusId === 'c-salford')
  const done = (list: User[], share: number, daysAgo: number) =>
    list.filter((_, i) => (i * 7) % 10 < share * 10).map((u, i) => ({ userId: u.id, at: new Date(Date.now() - (daysAgo + (i % 3)) * day).toISOString() }))
  return {
    assignedTasks: [
      {
        id: 'at-1', title: 'Complete the safeguarding refresher (online)', description: 'Upload your certificate to the shared folder.',
        dueDate: iso(5), createdBy: 'u-admin-1', createdAt: new Date(Date.now() - 9 * day).toISOString(),
        assigneeIds: pats.map((u) => u.id), completions: done(pats.filter((u) => u.name !== 'Sofia Rahman'), 0.6, 1), personal: false,
      },
      {
        id: 'at-2', title: 'Check your students’ emergency contacts are up to date', description: 'Tell the admin team about any changes.',
        dueDate: iso(-2), createdBy: 'u-admin-2', createdAt: new Date(Date.now() - 14 * day).toISOString(),
        assigneeIds: salford.map((u) => u.id), completions: done(salford.filter((u) => u.name !== 'Sofia Rahman'), 0.5, 4), personal: false,
      },
      {
        id: 'at-3', title: 'Send welcome message to January 2027 groups', description: 'Use the template in the PAT handbook.',
        dueDate: iso(40), createdBy: 'u-manager', createdAt: new Date(Date.now() - 2 * day).toISOString(),
        assigneeIds: pats.map((u) => u.id), completions: [], personal: false,
      },
    ],
  }
}
