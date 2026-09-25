import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui'
import { canManageStaff, isProfileComplete, needsTraining } from '../data/logic'
import { WEEKDAYS, type Shift, type User, type Weekday } from '../data/types'
import { useDb } from '../store/db'

/** Profile setup / edit. PATs edit their own; admins can edit anyone via /staff/:id/edit. */
export function ProfilePage() {
  const { db, me, updateProfile } = useDb()
  const { id } = useParams()
  const navigate = useNavigate()
  const target = id ? db.users.find((u) => u.id === id) : me
  if (!me || !target) return <p>User not found.</p>
  if (target.id !== me.id && !canManageStaff(me.role)) return <p>You don't have access to edit this profile.</p>
  return <ProfileForm key={target.id} user={target} isSelf={target.id === me.id} onSave={(patch) => {
    updateProfile(target.id, patch)
    if (!target.profileCompletedAt && isProfileComplete({ ...target, ...patch }) && target.id === me.id && needsTraining(target)) {
      navigate('/training')
    } else if (id) {
      navigate(`/staff/${target.id}`)
    }
  }} campuses={db.campuses} />
}

function ProfileForm({ user, isSelf, onSave, campuses }: { user: User; isSelf: boolean; onSave: (p: Partial<User>) => void; campuses: { id: string; name: string }[] }) {
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone,
    shift: user.shift ?? '',
    workDays: user.workDays,
    ecName: user.emergencyContact?.name ?? '',
    ecRel: user.emergencyContact?.relationship ?? '',
    ecPhone: user.emergencyContact?.phone ?? '',
    bio: user.bio,
    campusId: user.campusId ?? '',
  })
  const [saved, setSaved] = useState(false)
  const [touched, setTouched] = useState(false)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }
  const toggleDay = (d: Weekday) =>
    set('workDays', form.workDays.includes(d) ? form.workDays.filter((x) => x !== d) : WEEKDAYS.filter((w) => w === d || form.workDays.includes(w)))

  const errors = {
    phone: !form.phone.trim() ? 'Required' : !/^[0-9+ ]{10,15}$/.test(form.phone.trim()) ? 'Enter a valid UK phone number' : '',
    shift: !form.shift ? 'Required' : '',
    workDays: form.workDays.length === 0 ? 'Choose at least one working day' : '',
    ecName: !form.ecName.trim() ? 'Required' : '',
    ecPhone: !form.ecPhone.trim() ? 'Required' : '',
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const firstSetup = !user.profileCompletedAt

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (hasErrors) return
    onSave({
      name: form.name.trim(),
      phone: form.phone.trim(),
      shift: form.shift as Shift,
      workDays: form.workDays,
      emergencyContact: { name: form.ecName.trim(), relationship: form.ecRel.trim(), phone: form.ecPhone.trim() },
      bio: form.bio,
      campusId: user.role === 'lead' || user.role === 'pat' ? form.campusId || null : null,
    })
    setSaved(true)
  }
  const err = (k: keyof typeof errors) => (touched ? errors[k] || undefined : undefined)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isSelf ? (firstSetup ? 'Set up your profile' : 'My profile') : `Edit profile · ${user.name}`}
        subtitle={firstSetup && isSelf ? 'Complete your profile to unlock your training package. Your work days and shift are used later for group allocation.' : user.email}
      />
      <form onSubmit={submit} className="space-y-5">
        <Card title="Personal details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Work email" hint="Set by the PAT Admin when the account was created">
              <Input value={user.email} disabled className="bg-slate-50" />
            </Field>
            <Field label="Mobile number" error={err('phone')}>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07…" />
            </Field>
            {(user.role === 'pat' || user.role === 'lead') && (
              <Field label="Campus" hint={isSelf ? 'Contact a PAT Admin to change campus' : undefined}>
                <Select value={form.campusId} onChange={(e) => set('campusId', e.target.value)} disabled={isSelf}>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </Card>

        <Card title="Working pattern">
          <div className="space-y-4">
            <Field group label="Shift" error={err('shift')}>
              <div className="flex gap-2">
                {(['morning', 'evening'] as Shift[]).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => set('shift', s)}
                    className={cx('rounded-lg border px-4 py-2 text-sm capitalize', form.shift === s ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 hover:bg-slate-50')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field group label="Working days" error={err('workDays')}>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={cx('w-14 rounded-lg border py-2 text-sm', form.workDays.includes(d) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-50')}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Emergency contact">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" error={err('ecName')}>
              <Input value={form.ecName} onChange={(e) => set('ecName', e.target.value)} />
            </Field>
            <Field label="Relationship">
              <Input value={form.ecRel} onChange={(e) => set('ecRel', e.target.value)} />
            </Field>
            <Field label="Phone" error={err('ecPhone')}>
              <Input value={form.ecPhone} onChange={(e) => set('ecPhone', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="About you">
          <Field label="Short bio (optional)" hint="Shown to your lead and admins">
            <Textarea rows={3} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          </Field>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit">{firstSetup && isSelf ? 'Save and continue to training' : 'Save profile'}</Button>
          {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
          {touched && hasErrors && <span className="text-sm text-rose-600">Please fix the highlighted fields</span>}
        </div>
      </form>
    </div>
  )
}
