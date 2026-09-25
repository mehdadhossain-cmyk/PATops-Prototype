import { useEffect, useRef, useState } from 'react'
import { fmtDate } from '../data/logic'
import { RISK_THRESHOLD, teachingWeek } from '../data/risk'
import type { AttendanceRecord } from '../data/types'
import { cx } from './ui'

// Colours: one series (brand blue), the threshold uses the reserved "critical" status red
// and is always labelled, so it never relies on colour alone.
const LINE = '#2a56c6'
const CRITICAL = '#e11d48'
const GRID = '#e2e8f0'
const INK_MUTED = '#64748b'

/** Tiny trend line for tables. The last point is red when below the threshold. */
export function Sparkline({ history, width = 96, height = 26 }: { history: AttendanceRecord[]; width?: number; height?: number }) {
  if (history.length === 0) return <span className="text-xs text-slate-400">No data</span>
  const pad = 3
  const x = (i: number) => (history.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (history.length - 1))
  const y = (v: number) => pad + ((100 - v) * (height - pad * 2)) / 100
  const last = history.at(-1)!
  const pts = history.map((h, i) => `${x(i)},${y(h.overall)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Attendance trend: ${history.map((h) => `${h.overall}%`).join(', ')}`}>
      <title>{history.map((h) => `${fmtDate(h.weekEnding)}: ${h.overall}%`).join('\n')}</title>
      <line x1={0} x2={width} y1={y(RISK_THRESHOLD)} y2={y(RISK_THRESHOLD)} stroke={CRITICAL} strokeOpacity={0.45} strokeDasharray="2 2" strokeWidth={1} />
      <polyline points={pts} fill="none" stroke={LINE} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(history.length - 1)} cy={y(last.overall)} r={2.5} fill={last.overall < RISK_THRESHOLD ? CRITICAL : LINE} />
    </svg>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Weekly overall attendance with the 65% threshold, hover tooltip and a table view. */
export function AttendanceChart({ history, intakeStart }: { history: AttendanceRecord[]; intakeStart: string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const height = 200
  const m = { top: 12, right: 16, bottom: 28, left: 36 }
  const iw = width - m.left - m.right
  const ih = height - m.top - m.bottom
  const n = history.length
  const x = (i: number) => m.left + (n === 1 ? iw / 2 : (i * iw) / (n - 1))
  const y = (v: number) => m.top + ((100 - v) * ih) / 100
  const label = (h: AttendanceRecord) => (intakeStart ? `Wk ${teachingWeek(intakeStart, h.weekEnding)}` : fmtDate(h.weekEnding).slice(0, 6))
  const every = Math.max(1, Math.ceil(n / Math.floor(iw / 56)))

  if (n === 0) return <p className="text-sm text-slate-500">No attendance has been uploaded for this student yet.</p>

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={() => setAsTable(!asTable)} className="text-xs text-brand-600 hover:underline">
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-100"><th className="py-1.5 pr-4">Week ending</th>{intakeStart && <th className="py-1.5 pr-4">Teaching week</th>}<th className="py-1.5 pr-4 text-right">Overall attendance</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...history].reverse().map((h) => (
                <tr key={h.weekEnding}>
                  <td className="py-1.5 pr-4">{fmtDate(h.weekEnding)}</td>
                  {intakeStart && <td className="py-1.5 pr-4">{teachingWeek(intakeStart, h.weekEnding)}</td>}
                  <td className={cx('py-1.5 pr-4 text-right tabular-nums', h.overall < RISK_THRESHOLD && 'font-medium text-rose-600')}>{h.overall}%{h.overall < RISK_THRESHOLD && ' ⚠'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative">
          <svg width={width} height={height} role="img" aria-label="Weekly overall attendance" onMouseLeave={() => setHover(null)}>
            {[0, 25, 50, 75, 100].map((t) => (
              <g key={t}>
                <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK_MUTED}>{t}%</text>
              </g>
            ))}
            <line x1={m.left} x2={width - m.right} y1={y(RISK_THRESHOLD)} y2={y(RISK_THRESHOLD)} stroke={CRITICAL} strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={width - m.right} y={y(RISK_THRESHOLD) - 5} textAnchor="end" fontSize={11} fill={CRITICAL}>{RISK_THRESHOLD}% risk threshold</text>
            {history.map((h, i) => i % every === 0 || i === n - 1 ? (
              <text key={h.weekEnding} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={INK_MUTED}>{label(h)}</text>
            ) : null)}
            <polyline points={history.map((h, i) => `${x(i)},${y(h.overall)}`).join(' ')} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {history.map((h, i) =>
              h.overall < RISK_THRESHOLD || i === n - 1 || hover === i ? (
                <circle key={h.weekEnding} cx={x(i)} cy={y(h.overall)} r={hover === i ? 5 : 4} fill={h.overall < RISK_THRESHOLD ? CRITICAL : LINE} stroke="#fff" strokeWidth={2} />
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} stroke={INK_MUTED} strokeOpacity={0.4} />}
            {/* Wide invisible hit areas, one per week. */}
            {history.map((h, i) => (
              <rect
                key={h.weekEnding}
                x={n === 1 ? m.left : x(i) - iw / (n - 1) / 2}
                y={m.top}
                width={n === 1 ? iw : iw / (n - 1)}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
              style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 150), top: Math.max(0, y(history[hover].overall) - 62) }}
            >
              <div className="text-slate-500">{label(history[hover])} · week ending {fmtDate(history[hover].weekEnding)}</div>
              <div className={cx('text-sm font-semibold tabular-nums', history[hover].overall < RISK_THRESHOLD ? 'text-rose-600' : 'text-slate-900')}>
                {history[hover].overall}% overall{history[hover].overall < RISK_THRESHOLD && ' · at risk'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
