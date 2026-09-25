import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ModuleStatusBadge } from '../components/StatusBadges'
import { Button, Card, PageHeader, cx } from '../components/ui'
import { activeModules, fmtDateTime, isProfileComplete, moduleStatus, progressFor } from '../data/logic'
import { useDb } from '../store/db'

export function ModulePage() {
  const { moduleId } = useParams()
  const { db, me, startModule, acknowledgeModule, submitQuiz } = useDb()
  const mod = db.trainingModules.find((m) => m.id === moduleId)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null)

  const allowed = Boolean(me && mod && isProfileComplete(me))
  useEffect(() => {
    if (allowed && mod) startModule(mod.id)
    // Only on first open of this module.
  }, [allowed, mod?.id])

  if (!me || !mod) return <p>Module not found.</p>
  if (!allowed) return <p>Complete your <Link className="text-brand-600 underline" to="/profile">profile</Link> to unlock training.</p>

  const p = progressFor(db, me.id, mod.id)
  const status = moduleStatus(p)
  const modules = activeModules(db)
  const next = modules[modules.findIndex((m) => m.id === mod.id) + 1]
  const acknowledged = Boolean(p?.acknowledgedAt)
  const allAnswered = mod.quiz.every((_, i) => answers[i] !== undefined)

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-sm">
        <Link to="/training" className="text-brand-600 hover:underline">← My training</Link>
      </div>
      <PageHeader title={mod.title} subtitle={mod.description} actions={<ModuleStatusBadge status={status} />} />

      <Card title="1. Read the material" className="mb-5">
        <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{mod.content}</div>
        {mod.resourceUrl && (
          <a href={mod.resourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-brand-600 underline">
            Open linked resource ↗
          </a>
        )}
        <div className="mt-5 border-t border-slate-100 pt-4">
          {acknowledged ? (
            <p className="text-sm text-emerald-700">✓ You confirmed you read this on {fmtDateTime(p!.acknowledgedAt)}</p>
          ) : (
            <Button onClick={() => acknowledgeModule(mod.id)}>I have read and understood this material</Button>
          )}
        </div>
      </Card>

      {mod.quiz.length > 0 && (
        <Card title="2. Check your understanding" className={cx('mb-5', !acknowledged && 'opacity-50')}>
          {!acknowledged ? (
            <p className="text-sm text-slate-500">Confirm you've read the material to unlock the check.</p>
          ) : status === 'completed' && !result ? (
            <div className="text-sm">
              <p className="text-emerald-700">✓ Passed. Attempts:</p>
              <ul className="mt-2 space-y-1 text-slate-600">
                {p!.attempts.map((a, i) => (
                  <li key={i}>
                    {fmtDateTime(a.at)} — {a.score}% {a.passed ? '✓' : '✗'}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setResult(submitQuiz(mod.id, answers))
              }}
              className="space-y-5"
            >
              <p className="text-sm text-slate-500">Pass mark: {mod.passMark}%. You can retake it as many times as you need; every attempt is recorded.</p>
              {mod.quiz.map((q, qi) => (
                <fieldset key={q.id}>
                  <legend className="mb-2 text-sm font-medium">
                    {qi + 1}. {q.question}
                  </legend>
                  <div className="space-y-1.5">
                    {q.options.map((opt, oi) => {
                      const chosen = answers[qi] === oi
                      const showResult = result !== null
                      const correct = q.answerIndex === oi
                      return (
                        <label
                          key={oi}
                          className={cx(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                            showResult && chosen && !correct
                              ? 'border-rose-300 bg-rose-50'
                              : showResult && result.passed && correct
                                ? 'border-emerald-400 bg-emerald-50'
                                : chosen
                                  ? 'border-brand-500 bg-brand-50'
                                  : 'border-slate-200 hover:bg-slate-50',
                          )}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            checked={chosen}
                            disabled={result !== null}
                            onChange={() => setAnswers((a) => Object.assign([...a], { [qi]: oi }))}
                          />
                          {opt}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              ))}
              {result ? (
                <div className={cx('rounded-lg p-4 text-sm', result.passed ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900')}>
                  You scored <strong>{result.score}%</strong>. {result.passed ? 'Module complete!' : 'Not quite. Review the material and try again.'}
                  <div className="mt-3 flex gap-2">
                    {!result.passed && (
                      <Button type="button" variant="secondary" onClick={() => { setResult(null); setAnswers([]) }}>
                        Try again
                      </Button>
                    )}
                    {result.passed && next && (
                      <Link to={`/training/${next.id}`}>
                        <Button type="button">Next module →</Button>
                      </Link>
                    )}
                    {result.passed && !next && (
                      <Link to="/training"><Button type="button">Back to my training</Button></Link>
                    )}
                  </div>
                </div>
              ) : (
                <Button type="submit" disabled={!allAnswered}>Submit answers</Button>
              )}
            </form>
          )}
        </Card>
      )}

      {mod.quiz.length === 0 && acknowledged && next && (
        <Link to={`/training/${next.id}`}><Button>Next module →</Button></Link>
      )}
    </div>
  )
}
