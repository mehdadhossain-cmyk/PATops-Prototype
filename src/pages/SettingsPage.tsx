import { useState } from 'react'
import { Button, Card, Input, PageHeader } from '../components/ui'
import { useDb } from '../store/db'

export function SettingsPage() {
  const { db, addCampus, resetDemo } = useDb()
  const [name, setName] = useState('')
  const count = (id: string) => db.users.filter((u) => u.campusId === id).length

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Settings" />
      <Card title="Campuses">
        <ul className="mb-4 divide-y divide-slate-100 text-sm">
          {db.campuses.map((c) => (
            <li key={c.id} className="flex justify-between py-2">
              <span>{c.name}</span>
              <span className="text-slate-500">{count(c.id)} staff</span>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim() || db.campuses.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return
            addCampus(name.trim())
            setName('')
          }}
        >
          <Input placeholder="New campus name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>Add</Button>
        </form>
      </Card>
      <Card title="Demo data">
        <p className="mb-3 text-sm text-slate-600">All data in this prototype lives in your browser's local storage. Reset it to start the walkthrough again.</p>
        <Button variant="danger" onClick={() => confirm('Reset all demo data?') && resetDemo()}>Reset demo data</Button>
      </Card>
    </div>
  )
}
