import { CATEGORIES } from '../../domain/categories'
import type { CategoryKey } from '../../domain/types'
import { shortMonthLabel } from '../../domain/selectors'

export interface StackedPoint {
  key: string
  values: Record<CategoryKey, number>
}

export function StackedBars({ points, height = 150 }: { points: StackedPoint[]; height?: number }) {
  if (points.length === 0) return null
  const width = Math.max(340, points.length * 28 + 16)
  const top = 10
  const bottom = 24
  const max = Math.max(
    1,
    ...points.map((point) => CATEGORIES.reduce((sum, category) => sum + Math.max(point.values[category.key] ?? 0, 0), 0)),
  )
  const plotHeight = height - top - bottom
  const slot = (width - 16) / points.length
  const barWidth = Math.min(18, slot * 0.56)

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} role="img" aria-label="分类构成">
      {[0, 0.5, 1].map((fraction) => {
        const y = top + fraction * plotHeight
        return (
          <line
            key={fraction}
            x1="0"
            x2={width}
            y1={y}
            y2={y}
            stroke="var(--separator)"
            strokeWidth="0.7"
            strokeDasharray="2 4"
          />
        )
      })}
      {points.map((point, index) => {
        let y = top + plotHeight
        const x = 8 + index * slot + (slot - barWidth) / 2
        const total = CATEGORIES.reduce((sum, category) => sum + Math.max(point.values[category.key] ?? 0, 0), 0)
        return (
          <g key={point.key}>
            {CATEGORIES.map((category) => {
              const value = Math.max(point.values[category.key] ?? 0, 0)
              if (value <= 0) return null
              const segmentHeight = (value / max) * plotHeight
              y -= segmentHeight
              return (
                <rect
                  key={category.key}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(segmentHeight, 0.4)}
                  fill={category.color}
                />
              )
            })}
            {(points.length <= 8 || index % 2 === 0 || index === points.length - 1) && (
              <text
                x={x + barWidth / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--text-3)"
                fontFamily="inherit"
              >
                {shortMonthLabel(point.key)}
              </text>
            )}
            <title>{`${point.key} · ${Math.round(total).toLocaleString('zh-CN')}`}</title>
          </g>
        )
      })}
    </svg>
  )
}
