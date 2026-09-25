import { useState } from 'react'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Textarea } from '../components/ui'
import type { QuizQuestion, TrainingModule } from '../data/types'
import { useDb } from '../store/db'

const blankModule = (order: number): TrainingModule => ({
  id: `m-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  description: '',
  content: '',
  resourceUrl: '',
  estimatedMinutes: 15,
  order,
  required: true,
  quiz: [],
  passMark: 80,
  dueDays: 7,
  archived: false,
})

export function TrainingAdminPage() {
  const { db, saveModule } = useDb()
  const [editing, setEditing] = useState<TrainingModule | null>(null)
  const modules = [...db.trainingModules].sort((a, b) => a.order - b.order)

  const move = (m: TrainingModule, dir: -1 | 1) => {
    const idx = modules.indexOf(m)
    const other = modules[idx + dir]
    if (!other) return
    saveModule({ ...m, order: other.order })
    saveModule({ ...other, order: m.order })
  }

  return (
    <div>
      <PageHeader
        title="Training content"
        subtitle="The onboarding package every new PAT receives. Changes apply to everyone who hasn't completed a module yet."
        actions={<Button onClick={() => setEditing(blankModule(Math.max(0, ...modules.map((m) => m.order)) + 1))}>+ New module</Button>}
      />
      <Card>
        <ul className="divide-y divide-slate-100">
          {modules.map((m, i) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex flex-col">
                <button className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(m, -1)} aria-label="Move up">▲</button>
                <button className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === modules.length - 1} onClick={() => move(m, 1)} aria-label="Move down">▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.title}</span>
                  {m.required ? <Badge tone="blue">Required</Badge> : <Badge>Optional</Badge>}
                  {m.archived && <Badge tone="red">Archived</Badge>}
                </div>
                <div className="text-xs text-slate-500">
                  {m.quiz.length} question{m.quiz.length === 1 ? '' : 's'} · pass {m.passMark}% · due {m.dueDays} days after start · ~{m.estimatedMinutes} min
                </div>
              </div>
              <Button variant="secondary" onClick={() => setEditing(m)}>Edit</Button>
              <Button variant="ghost" onClick={() => saveModule({ ...m, archived: !m.archived })}>{m.archived ? 'Restore' : 'Archive'}</Button>
            </li>
          ))}
        </ul>
      </Card>
      {editing && <ModuleEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} onSave={(m) => { saveModule(m); setEditing(null) }} />}
    </div>
  )
}

function ModuleEditor({ initial, onClose, onSave }: { initial: TrainingModule; onClose: () => void; onSave: (m: TrainingModule) => void }) {
  const [m, setM] = useState(initial)
  const [error, setError] = useState('')
  const set = <K extends keyof TrainingModule>(k: K, v: TrainingModule[K]) => setM((x) => ({ ...x, [k]: v }))
  const setQ = (qi: number, patch: Partial<QuizQuestion>) => set('quiz', m.quiz.map((q, i) => (i === qi ? { ...q, ...patch } : q)))

  const validate = () => {
    if (!m.title.trim()) return 'Title is required'
    if (!m.content.trim() && !m.resourceUrl.trim()) return 'Add content text or a resource link'
    for (const [i, q] of m.quiz.entries()) {
      if (!q.question.trim()) return `Question ${i + 1} is empty`
      if (q.options.filter((o) => o.trim()).length < 2) return `Question ${i + 1} needs at least 2 options`
      if (!q.options[q.answerIndex]?.trim()) return `Question ${i + 1}: pick a correct answer`
    }
    return ''
  }

  return (
    <Modal open title={initial.title ? `Edit: ${initial.title}` : 'New training module'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const err = validate()
          setError(err)
          if (!err) onSave({ ...m, quiz: m.quiz.map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) })) })
        }}
      >
        <Field label="Title"><Input value={m.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Short description"><Input value={m.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Content" hint="The material the trainee reads. Line breaks are kept.">
          <Textarea rows={8} value={m.content} onChange={(e) => set('content', e.target.value)} />
        </Field>
        <Field label="Resource link (optional)" hint="Video, PDF or document URL">
          <Input value={m.resourceUrl} onChange={(e) => set('resourceUrl', e.target.value)} placeholder="https://…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Minutes"><Input type="number" min={1} value={m.estimatedMinutes} onChange={(e) => set('estimatedMinutes', +e.target.value)} /></Field>
          <Field label="Due (days after start)"><Input type="number" min={0} value={m.dueDays} onChange={(e) => set('dueDays', +e.target.value)} /></Field>
          <Field label="Pass mark %"><Input type="number" min={0} max={100} value={m.passMark} onChange={(e) => set('passMark', +e.target.value)} /></Field>
          <Field group label="Required">
            <label className="flex h-[38px] items-center gap-2 text-sm">
              <input type="checkbox" checked={m.required} onChange={(e) => set('required', e.target.checked)} /> Mandatory
            </label>
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">Knowledge check</h3>
            <Button type="button" variant="secondary" onClick={() => set('quiz', [...m.quiz, { id: `q${Date.now()}`, question: '', options: ['', '', ''], answerIndex: 0 }])}>
              + Question
            </Button>
          </div>
          {m.quiz.length === 0 && <p className="text-sm text-slate-500">No questions: the module completes once the trainee confirms they've read it.</p>}
          <div className="space-y-4">
            {m.quiz.map((q, qi) => (
              <div key={q.id} className="rounded-lg bg-slate-50 p-3">
                <div className="mb-2 flex gap-2">
                  <Input value={q.question} placeholder={`Question ${qi + 1}`} onChange={(e) => setQ(qi, { question: e.target.value })} />
                  <Button type="button" variant="ghost" onClick={() => set('quiz', m.quiz.filter((_, i) => i !== qi))}>Remove</Button>
                </div>
                <div className="space-y-1.5">
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input type="radio" name={`ans-${q.id}`} checked={q.answerIndex === oi} onChange={() => setQ(qi, { answerIndex: oi })} title="Correct answer" />
                      <Input value={o} placeholder={`Option ${oi + 1}`} onChange={(e) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })} />
                    </div>
                  ))}
                  <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setQ(qi, { options: [...q.options, ''] })}>+ option</button>
                  <span className="ml-3 text-xs text-slate-400">Select the radio button next to the correct answer</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save module</Button>
        </div>
      </form>
    </Modal>
  )
}
