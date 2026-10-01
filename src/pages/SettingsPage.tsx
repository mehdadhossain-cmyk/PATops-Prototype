import { useState } from 'react'
import { AccessMatrix } from '../components/Access'
import { Button, Card, ConfirmButton, Field, Input, PageHeader } from '../components/ui'
import { can, isTop } from '../data/logic'
import { useDb } from '../store/db'

export function SettingsPage() {
  const { db, me, addCampus, resetDemo } = useDb()
  const [name, setName] = useState('')
  const count = (id: string) => db.users.filter((u) => u.campusId === id).length
  if (!me) return null
  const top = isTop(me.role)

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Settings" />
      {top && (
        <Card title="Admin access">
          <p className="mb-3 text-sm text-slate-600">
            Choose what each PAT Admin can do. The PAT Manager and Master Owner always have full access. Hover a column for details, or change one admin's access from their staff page.
          </p>
          <AccessMatrix />
        </Card>
      )}
      {top && <HrContact />}
      {can(me, 'settings') && (
      <>
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
      </>
      )}
      <Card title="Demo data">
        <p className="mb-3 text-sm text-slate-600">All data in this prototype lives in your browser's local storage. Reset it to start the walkthrough again.</p>
        <ConfirmButton label="Reset demo data" confirmLabel="Reset all demo data?" onConfirm={resetDemo} />
      </Card>
    </div>
  )
}

/** Who probation outcomes are confirmed to. */
function HrContact() {
  const { db, saveSettings } = useDb()
  const [name, setName] = useState(db.settings.hrManagerName)
  const [email, setEmail] = useState(db.settings.hrManagerEmail)
  const [saved, setSaved] = useState(false)
  const bad = !!email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  return (
    <Card title="HR manager">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (bad) return
          saveSettings({ hrManagerName: name.trim(), hrManagerEmail: email.trim() })
          setSaved(true)
        }}
      >
        <p className="text-sm text-slate-600">Probation outcomes are confirmed to this person.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input id="hr-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} /></Field>
          <Field label="Email" error={bad ? 'Enter a valid email' : undefined}><Input id="hr-email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false) }} /></Field>
        </div>
        <div className="flex items-center gap-3"><Button type="submit">Save</Button>{saved && <span className="text-sm text-emerald-600">Saved ✓</span>}</div>
      </form>
    </Card>
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
