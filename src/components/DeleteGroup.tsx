import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { intakeLabel, userName } from '../data/logic'
import type { Group } from '../data/types'
import { useDb } from '../store/db'
import { Button, Field, Modal, Select } from './ui'

/** Delete a group. Students must be moved first; groups with call-log or cover history are kept for the audit trail. */
export function DeleteGroupModal({ group: g, onClose }: { group: Group; onClose: () => void }) {
  const { db, deleteGroup } = useDb()
  const navigate = useNavigate()
  const students = db.students.filter((s) => s.groupId === g.id).length
  const announcements = db.comms.filter((c) => c.groupIds.includes(g.id)).length
  const cover = db.coverSlots.filter((c) => c.groupId === g.id).length
  const others = db.groups.filter((x) => x.id !== g.id).sort((a, b) => Number(b.intakeId === g.intakeId) - Number(a.intakeId === g.intakeId) || a.code.localeCompare(b.code))
  const [target, setTarget] = useState(others.find((x) => x.intakeId === g.intakeId)?.id ?? '')
  const blocked = announcements > 0 || cover > 0

  return (
    <Modal open title={`Delete group · ${g.code}`} onClose={onClose}>
      {blocked ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">
            {g.code} can't be deleted because it's part of the audit trail: {[announcements && `${announcements} call-log announcement${announcements === 1 ? '' : 's'}`, cover && `${cover} leave cover session${cover === 1 ? '' : 's'}`].filter(Boolean).join(' and ')}.
          </p>
          <p className="text-slate-500">If the group has finished, close its intake instead. If it was set up wrongly, edit it.</p>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (students && !target) return
            deleteGroup(g.id, students ? target : null)
            onClose()
            navigate('/groups', { replace: true })
          }}
        >
          <p className="text-sm text-slate-700">This permanently removes {g.code} ({intakeLabel(db, g.intakeId)}) and takes it out of any allocation drafts.{g.patId && ` ${userName(db, g.patId)} will no longer be its PAT.`}</p>
          {students > 0 && (
            <Field label={`Move its ${students} student${students === 1 ? '' : 's'} to`}>
              <Select id="delete-group-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a group…</option>
                {others.map((x) => <option key={x.id} value={x.id}>{x.code} · {intakeLabel(db, x.intakeId)}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={students > 0 && !target}>{students ? 'Move students and delete' : 'Delete group'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
