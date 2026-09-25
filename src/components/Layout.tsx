import { useMemo, useState } from 'react'
import { tasksFor } from '../data/tasks'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { campusName, canManageStudents, canManageTraining, canViewStaff } from '../data/logic'
import { ROLE_LABEL } from '../data/types'
import { useDb } from '../store/db'
import { Avatar, cx } from './ui'

interface NavItem {
  to: string
  label: string
  icon: string
  show: boolean
  soon?: boolean
  badge?: number
}

export function Layout() {
  const { db, me, logout } = useDb()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const urgent = useMemo(() => {
    if (!me) return 0
    const today = new Date().toISOString().slice(0, 10)
    return tasksFor(db, me).filter((t) => t.due && t.due <= today).length
  }, [db, me])
  if (!me) return null

  const nav: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: '▦', show: true },
    { to: '/tasks', label: 'My tasks', icon: '☑', show: true, badge: urgent },
    { to: '/profile', label: 'My profile', icon: '☺', show: true },
    { to: '/training', label: 'My training', icon: '✎', show: me.role === 'pat' || me.role === 'lead' },
    { to: '/groups', label: me.role === 'pat' ? 'My groups' : 'Groups', icon: '▤', show: true },
    { to: '/students', label: me.role === 'pat' ? 'My students' : 'Students', icon: '🎓', show: true },
    { to: '/call-log', label: me.role === 'pat' ? 'Call log' : 'Call logs', icon: '☎', show: true },
    { to: '/at-risk', label: 'At-risk students', icon: '⚠', show: true },
    { to: '/wellbeing', label: 'Wellbeing', icon: '♥', show: true },
    { to: '/non-submissions', label: 'Non-submissions', icon: '✉', show: true },
    { to: '/lsa', label: 'LSAs', icon: '✍', show: true },
    { to: '/leave', label: 'Leave & cover', icon: '✈', show: true },
    { to: '/intakes', label: 'Intakes', icon: '◷', show: canViewStaff(me.role) },
    { to: '/import', label: 'Import data', icon: '⇪', show: canManageStudents(me.role) },
    { to: '/attendance', label: 'Attendance upload', icon: '▥', show: canManageStudents(me.role) },
    { to: '/staff', label: 'Staff', icon: '👥', show: canViewStaff(me.role) },
    { to: '/training-tracker', label: 'Training tracker', icon: '✓', show: canViewStaff(me.role) },
    { to: '/training-admin', label: 'Training content', icon: '⚙', show: canManageTraining(me.role) },
    { to: canViewStaff(me.role) ? '/audit' : '/audit/me', label: canViewStaff(me.role) ? 'Audit export' : 'My audit pack', icon: '⤓', show: true },
    { to: '/settings', label: 'Settings', icon: '⚑', show: me.role === 'admin' || me.role === 'manager' },
  ]


  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={cx(
          'print:hidden',
          'fixed inset-y-0 left-0 z-40 w-64 transform overflow-y-auto border-r border-slate-200 bg-white transition lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">P</span>
          <div>
            <div className="font-semibold leading-tight">PATops</div>
            <div className="text-xs text-slate-500">UKMC PAT team</div>
          </div>
        </div>
        <nav className="space-y-0.5 p-3">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <span className="w-4 text-center">{n.icon}</span>
                <span className="flex-1">{n.label}</span>
                {!!n.badge && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white tabular-nums">{n.badge}</span>}
              </NavLink>
            ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="rounded p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="hidden text-sm text-slate-500 sm:block">
            Demo prototype · data is stored in this browser only
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{me.name}</div>
              <div className="text-xs text-slate-500">
                {ROLE_LABEL[me.role]} · {campusName(db, me.campusId)}
              </div>
            </div>
            <Avatar name={me.name} />
            <button
              onClick={() => {
                logout()
                navigate('/')
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Switch user
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
