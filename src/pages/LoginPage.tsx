import { useMemo, useState } from 'react'
import { Avatar, Badge, Input } from '../components/ui'
import { campusName } from '../data/logic'
import { ROLE_LABEL, type Role } from '../data/types'
import { useDb } from '../store/db'
import { StaffStatusBadge } from '../components/StatusBadges'

const roleOrder: Role[] = ['manager', 'admin', 'lead', 'pat']

/**
 * Demo sign-in: pick any seeded user to see the app from their point of view.
 * In production this is replaced by Microsoft SSO / email login.
 */
export function LoginPage() {
  const { db, login, resetDemo } = useDb()
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const qy = query.toLowerCase()
    return roleOrder.map((role) => ({
      role,
      users: db.users.filter(
        (u) => u.role === role && (!qy || u.name.toLowerCase().includes(qy) || campusName(db, u.campusId).toLowerCase().includes(qy)),
      ),
    }))
  }, [db, query])

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-600 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-2xl font-bold">P</div>
          <h1 className="text-3xl font-semibold">PATops</h1>
          <p className="mt-1 text-brand-100">All-in-one workspace for the UKMC PAT team · prototype</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Choose a demo user</h2>
              <p className="text-sm text-slate-500">Sign in as anyone to test each role. Try the new joiners to walk through onboarding.</p>
            </div>
            <Input placeholder="Search name or campus…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
          </div>

          <div className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Suggested walkthrough:</strong> sign in as <em>Connor Doyle</em> (invited, set up profile), then <em>Adam Clarke</em>{' '}
            (doing training), then a PAT Admin to see the training tracker and create a new PAT account.
          </div>

          <div className="space-y-5">
            {groups.map(({ role, users }) =>
              users.length === 0 ? null : (
                <div key={role}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {ROLE_LABEL[role]} <span className="text-slate-400">({users.length})</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => login(u.id)}
                        className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-brand-500 hover:bg-brand-50"
                      >
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{u.name}</div>
                          <div className="truncate text-xs text-slate-500">{campusName(db, u.campusId)}</div>
                        </div>
                        {u.status !== 'active' ? <StaffStatusBadge status={u.status} /> : u.shift && <Badge>{u.shift}</Badge>}
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-right">
            <button
              onClick={() => confirm('Reset all demo data back to the original seed?') && resetDemo()}
              className="text-sm text-slate-500 underline hover:text-slate-700"
            >
              Reset demo data
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
