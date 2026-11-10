import { useId } from 'react'
import { shortMonthLabel } from '../../domain/selectors'

export interface AreaPoint {
  key: string
  value: number | null
}

function formatWan(value: number): string {
  const wan = value / 10000
  if (Math.abs(wan) >= 100) return wan.toFixed(0)
  return wan.toFixed(1).replace(/\.0$/, '')
}

export function AreaChart({
  points,
  height = 150,
  color = 'var(--accent)',
}: {
  points: AreaPoint[]
  height?: number
  color?: string
}) {
  const gradientId = useId().replace(/:/g, '')
  const width = 360
  const top = 26
  const bottom = 24
  const valid = points.filter((point) => point.value !== null) as Array<{ key: string; value: number }>
  if (valid.length === 0) {
    return (
      <div
        className="small faint"
        style={{ height, display: 'grid', placeItems: 'center', textAlign: 'center' }}
      >
        还没有足够的数据
      </div>
    )
  }

  const values = valid.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.max(Math.abs(max) * 0.08, 1)
  const lo = min - span * 0.18
  const hi = max + span * 0.18
  const innerW = width - 8
  const xAt = (index: number) =>
    4 + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
  const yAt = (value: number) => top + (1 - (value - lo) / (hi - lo)) * (height - top - bottom)

  const segments: Array<Array<{ x: number; y: number; index: number; value: number }>> = []
  let current: Array<{ x: number; y: number; index: number; value: number }> = []
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push({ x: xAt(index), y: yAt(point.value), index, value: point.value })
  })
  if (current.length > 0) segments.push(current)

  const labelIndexes = points.length <= 6 ? points.map((_, index) => index) : [0, Math.floor((points.length - 1) / 2), points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="资产趋势（万）"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((fraction) => {
        const y = top + fraction * (height - top - bottom)
        return (
          <line
            key={fraction}
            x1={4}
            x2={width - 4}
            y1={y}
            y2={y}
            stroke="var(--separator)"
            strokeWidth="0.7"
            strokeDasharray="2 4"
          />
        )
      })}
      {segments.map((segment, segmentIndex) => {
        const line = segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
        const area =
          segment.length > 1
            ? `${line} L${segment[segment.length - 1].x},${height - bottom} L${segment[0].x},${height - bottom} Z`
            : ''
        return (
          <g key={segmentIndex}>
            {area && <path d={area} fill={`url(#${gradientId})`} />}
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {segment.map((point) => {
              const isLast = point.index === points.length - 1
              return (
                <g key={point.index}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isLast ? 4 : 2.2}
                    fill={isLast ? color : 'var(--card)'}
                    stroke={color}
                    strokeWidth={isLast ? 0 : 1.8}
                  />
                  <text
                    x={point.x}
                    y={point.y - 7}
                    textAnchor={point.index === 0 ? 'start' : point.index === points.length - 1 ? 'end' : 'middle'}
                    fontSize="8"
                    fontWeight={isLast ? 750 : 600}
                    fill={isLast ? color : 'var(--text-2)'}
                    fontFamily="inherit"
                  >
                    {formatWan(point.value)}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
      {labelIndexes.map((index) => (
        <text
          key={index}
          x={xAt(index)}
          y={height - 6}
          textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          fontSize="9"
          fill="var(--text-3)"
          fontFamily="inherit"
        >
          {shortMonthLabel(points[index].key)}
        </text>
      ))}
    </svg>
  )
}
