import { useState } from 'react'
import { fmtDateTime, userName } from '../data/logic'
import type { User } from '../data/types'
import { useDb } from '../store/db'
import { Button, Card, ConfirmButton, Empty, Textarea } from './ui'

/** Private notes about a member of staff. Only the PAT Manager and the Master Owner see this card. */
export function StaffNotesCard({ user }: { user: User }) {
  const { db, me, addStaffNote, updateStaffNote, deleteStaffNote } = useDb()
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const notes = db.staffNotes.filter((n) => n.userId === user.id).sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Card title={<span>Manager notes <span className="ml-1 text-xs font-normal text-slate-500">🔒 only the PAT Manager and Master Owner</span></span>}>
      <form
        className="mb-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          addStaffNote(user.id, text.trim())
          setText('')
        }}
      >
        <Textarea id="staff-note" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`A private note about ${user.name.split(' ')[0]}…`} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Not shown to {user.name.split(' ')[0]}, leads or admins, and not included in audit exports.</span>
          <Button type="submit" disabled={!text.trim()}>Add note</Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <Empty>No notes yet.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notes.map((n) => (
            <li key={n.id} className="py-3 text-sm">
              {editing === n.id ? (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { updateStaffNote(n.id, draft.trim()); setEditing(null) } }}>
                  <Textarea id={`note-${n.id}`} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                  <div className="flex gap-2"><Button type="submit">Save</Button><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button></div>
                </form>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-slate-800">{n.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>{fmtDateTime(n.at)} · {userName(db, n.authorId)}{n.editedAt && ` · edited ${fmtDateTime(n.editedAt)}`}</span>
                    {n.authorId === me?.id && (
                      <>
                        <button className="text-brand-600 hover:underline" onClick={() => { setEditing(n.id); setDraft(n.text) }}>Edit</button>
                        <ConfirmButton link label="Delete" confirmLabel="Delete this note?" yesLabel="Delete" onConfirm={() => deleteStaffNote(n.id)} />
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
