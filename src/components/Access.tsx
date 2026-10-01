import { useState } from 'react'
import { PERMISSIONS, type Permission, type User } from '../data/types'
import { useDb } from '../store/db'
import { Badge, Button, Card } from './ui'

/** What an admin can do. Only the PAT Manager and the Master Owner can change it. */
export function AccessCard({ user, editable }: { user: User; editable: boolean }) {
  const { setPermissions } = useDb()
  const [editing, setEditing] = useState(false)
  const [perms, setPerms] = useState<Permission[]>(user.permissions)
  return (
    <Card title="Access" actions={editable && !editing && <Button variant="secondary" onClick={() => { setPerms(user.permissions); setEditing(true) }}>Change access</Button>}>
      {!editing ? (
        user.permissions.length === 0 ? (
          <p className="text-sm text-slate-500">No admin access yet. They can view the PAT team's work across campuses but can't change anything.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {PERMISSIONS.filter((p) => user.permissions.includes(p.key)).map((p) => <Badge key={p.key} tone="blue">{p.label}</Badge>)}
          </div>
        )
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setPermissions(user.id, PERMISSIONS.map((p) => p.key).filter((k) => perms.includes(k))); setEditing(false) }}>
          <ul className="space-y-2">
            {PERMISSIONS.map((p) => (
              <li key={p.key}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={perms.includes(p.key)} onChange={() => setPerms(perms.includes(p.key) ? perms.filter((x) => x !== p.key) : [...perms, p.key])} />
                  <span><span className="font-medium">{p.label}</span><span className="block text-xs text-slate-500">{p.hint}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2"><Button type="submit">Save access</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      )}
    </Card>
  )
}

/** Every admin against every permission, for the PAT Manager and Master Owner. */
export function AccessMatrix() {
  const { db, setPermissions } = useDb()
  const admins = db.users.filter((u) => u.role === 'admin' && u.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name))
  const toggle = (u: User, k: Permission) => setPermissions(u.id, PERMISSIONS.map((p) => p.key).filter((x) => (x === k ? !u.permissions.includes(k) : u.permissions.includes(x))))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left align-bottom text-xs text-slate-500">
            <th className="py-2 pr-3">Admin</th>
            {PERMISSIONS.map((p) => <th key={p.key} className="px-1 py-2 text-center font-medium" title={p.hint}><span className="inline-block max-w-20 leading-tight">{p.label}</span></th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {admins.map((u) => (
            <tr key={u.id}>
              <td className="py-2 pr-3 whitespace-nowrap">{u.name}</td>
              {PERMISSIONS.map((p) => (
                <td key={p.key} className="px-1 py-2 text-center">
                  <input type="checkbox" aria-label={`${u.name}: ${p.label}`} checked={u.permissions.includes(p.key)} onChange={() => toggle(u, p.key)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
