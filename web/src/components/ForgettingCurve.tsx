import { useMemo } from 'react'
import type { CurvePoint } from '../lib/types'
import { formatInterval } from '../lib/format'

export interface CurveMarker {
  grade: number
  label: string
  day: number
}

interface Props {
  /** retention samples: { day, retention } */
  curve: CurvePoint[]
  /** days already elapsed since the last review */
  elapsedDays: number
  /** current retention 0–1 */
  retrievability: number
  /** optional due-date markers from the four grade previews */
  markers?: CurveMarker[]
  height?: number
  caption?: string
}

const W = 320
const PAD = { top: 14, right: 12, bottom: 22, left: 30 }
const RETENTION_TICKS = [0.9, 0.5]

/**
 * The forgetting curve, drawn as the handoff prototype's design language:
 * soft green area, dashed 90% target line, and a marker where the learner is
 * right now plus where each grade would schedule the next review.
 */
export function ForgettingCurve({
  curve,
  elapsedDays,
  retrievability,
  markers = [],
  height = 148,
  caption,
}: Props) {
  const H = height
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const maxDay = useMemo(() => {
    const fromCurve = curve.at(-1)?.day ?? 30
    const fromMarkers = markers.reduce((m, x) => Math.max(m, x.day), 0)
    const fromNow = elapsedDays * 1.4
    return Math.max(7, Math.min(60, Math.max(fromCurve, fromMarkers, fromNow)))
  }, [curve, markers, elapsedDays])

  const x = (day: number) => PAD.left + (Math.min(day, maxDay) / maxDay) * plotW
  const y = (r: number) => PAD.top + (1 - Math.max(0, Math.min(1, r))) * plotH

  const line = useMemo(() => {
    const pts = curve.filter((p) => p.day <= maxDay)
    if (elapsedDays <= maxDay + 0.001) {
      const before = { day: elapsedDays, retention: retrievability }
      return [...pts, before].sort((a, b) => a.day - b.day)
    }
    return pts
  }, [curve, maxDay, elapsedDays, retrievability])

  const path = line.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(2)},${y(p.retention).toFixed(2)}`).join(' ')
  const area = `${path} L${x(line.at(-1)?.day ?? maxDay).toFixed(2)},${y(0).toFixed(2)} L${x(line[0]?.day ?? 0).toFixed(2)},${y(0).toFixed(2)} Z`

  const dayTicks = [0, maxDay / 3, (maxDay * 2) / 3, maxDay]

  return (
    <div className="curve">
      <div className="curve-head">
        <b>遗忘曲线</b>
        <span>
          {caption ??
            (elapsedDays > 0
              ? `已过 ${formatInterval(elapsedDays)} · 当前记住 ${(retrievability * 100).toFixed(0)}%`
              : '还没复习过这张卡')}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="记忆保持率随时间衰减的遗忘曲线">
        <defs>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* retention grid */}
        <g className="curve-grid">
          {RETENTION_TICKS.map((t) => (
            <line key={t} x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          ))}
          {dayTicks.map((d) => (
            <line key={d} x1={x(d)} x2={x(d)} y1={PAD.top} y2={PAD.top + plotH} />
          ))}
        </g>

        {/* the 90% target the scheduler aims for */}
        <line className="curve-threshold" x1={PAD.left} x2={W - PAD.right} y1={y(0.9)} y2={y(0.9)} />

        <path d={area} fill="url(#curveFill)" />
        <path className="curve-line" d={path} />

        {/* where the learner is right now */}
        {retrievability > 0 && (
          <>
            <line
              x1={x(elapsedDays)}
              x2={x(elapsedDays)}
              y1={y(retrievability)}
              y2={PAD.top + plotH}
              stroke="var(--brand)"
              strokeWidth="1.5"
              strokeDasharray="2 3"
            />
            <circle className="curve-now" cx={x(elapsedDays)} cy={y(retrievability)} r="4.5" />
          </>
        )}

        {/* scheduled due dates per grade */}
        {markers.map((m) => (
          <g key={m.grade}>
            <circle cx={x(m.day)} cy={y(0.9)} r="3.5" fill={MARKER_COLOR[m.grade] ?? 'var(--blue)'} />
          </g>
        ))}

        {/* 这条标签必须在曲线之后画：曲线一压上去「目标 90%」就没法读了。
            靠右端对齐，避开左侧 100% 刻度。 */}
        <text className="curve-target" x={W - PAD.right - 2} y={y(0.9) - 5} textAnchor="end">
          目标 90%
        </text>

        {/* axes */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--line-2)" />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line-2)" />
        <text className="curve-tick" x={2} y={PAD.top + 4}>
          100%
        </text>
        <text className="curve-tick" x={2} y={PAD.top + plotH + 3}>
          0%
        </text>
        {dayTicks.map((d) => (
          <text key={`t${d}`} className="curve-tick" x={x(d)} y={H - 6} textAnchor={d === 0 ? 'start' : d === maxDay ? 'end' : 'middle'}>
            {d < 1 ? '今天' : `${d.toFixed(0)}天`}
          </text>
        ))}
      </svg>

      {markers.length > 0 && (
        <div className="curve-legend">
          {markers.map((m) => (
            <span key={m.grade}>
              <i style={{ background: MARKER_COLOR[m.grade] }} />
              {m.label} → {formatInterval(m.day)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const MARKER_COLOR: Record<number, string> = {
  1: 'var(--red)',
  2: 'var(--gold)',
  3: 'var(--brand)',
  4: 'var(--blue)',
}

/** Compact retention bar used in the deck list. */
export function RetentionMeter({ value, showNumber = true }: { value: number; showNumber?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const color = pct >= 90 ? 'var(--brand)' : pct >= 75 ? 'var(--blue)' : pct >= 50 ? 'var(--gold)' : 'var(--red)'
  return (
    <div className="ret">
      <div className="ret-track">
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
      {showNumber && <span className="ret-num">{pct}%</span>}
    </div>
  )
}
