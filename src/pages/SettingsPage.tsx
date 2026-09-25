import { useState } from 'react'
import { Button, Card, ConfirmButton, Input, PageHeader } from '../components/ui'
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
      <Card title="Partner universities and courses">
        <div className="space-y-4">
          {db.universities.map((u) => (
            <div key={u.id}>
              <div className="flex items-center justify-between gap-2">
                <UniName id={u.id} />
                <span className="text-xs text-slate-500">{u.shortName}</span>
              </div>
              <ul className="mt-1 ml-3 space-y-0.5 text-sm text-slate-600">
                {db.courses.filter((c) => c.universityId === u.id).map((c) => <li key={c.id}>• {c.name}</li>)}
              </ul>
              <AddCourse universityId={u.id} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Demo data">
        <p className="mb-3 text-sm text-slate-600">All data in this prototype lives in your browser's local storage. Reset it to start the walkthrough again.</p>
        <ConfirmButton label="Reset demo data" confirmLabel="Reset all demo data?" onConfirm={resetDemo} />
      </Card>
    </div>
  )
}

/** Inline rename, so placeholder partner names can be replaced with the real ones. */
function UniName({ id }: { id: string }) {
  const { db, saveUniversity } = useDb()
  const uni = db.universities.find((u) => u.id === id)!
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(uni.name)
  const [short, setShort] = useState(uni.shortName)
  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span className="font-medium">{uni.name}</span>
        <button className="text-xs text-brand-600 hover:underline" onClick={() => setEditing(true)}>Rename</button>
      </span>
    )
  }
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !short.trim()) return
        saveUniversity({ ...uni, name: name.trim(), shortName: short.trim().toUpperCase() })
        setEditing(false)
      }}
    >
      <Input id={`uni-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
      <Input id={`uni-short-${id}`} value={short} onChange={(e) => setShort(e.target.value)} className="w-20" placeholder="Short" />
      <Button type="submit">Save</Button>
    </form>
  )
}

function AddCourse({ universityId }: { universityId: string }) {
  const { db, saveCourse } = useDb()
  const [name, setName] = useState('')
  return (
    <form
      className="mt-2 ml-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n || db.courses.some((c) => c.universityId === universityId && c.name.toLowerCase() === n.toLowerCase())) return
        saveCourse({ id: `crs-${Date.now()}`, name: n, universityId })
        setName('')
      }}
    >
      <Input id={`course-${universityId}`} placeholder="Add a course…" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs py-1.5" />
      <Button type="submit" variant="secondary" disabled={!name.trim()}>Add</Button>
    </form>
  )
}
