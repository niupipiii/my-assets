import { formatCompact } from '../../domain/money'
import { shortMonthLabel } from '../../domain/selectors'

export interface BarPoint {
  key: string
  value: number | null
  reference?: number | null
}

/** 净开销/结余柱状图，参考线为工资。全为正数时从底部起画。 */
export function MiniBars({
  points,
  height = 128,
  color = 'var(--accent)',
}: {
  points: BarPoint[]
  height?: number
  color?: string
}) {
  if (points.length === 0) return null
  const width = 360
  const top = 12
  const bottom = 22
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null && Number.isFinite(value))
  if (values.length === 0) {
    return (
      <div className="small faint" style={{ height, display: 'grid', placeItems: 'center' }}>
        设置工资并补齐上月余额后显示
      </div>
    )
  }

  const hasNegative = values.some((value) => value < 0)
  const reference = Math.max(
    ...points.map((point) => (typeof point.reference === 'number' ? point.reference : 0)),
  )
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)), reference)
  const scaleMax = maxAbs * 1.15
  const plotHeight = height - top - bottom
  const positiveHeight = hasNegative ? plotHeight / 2 : plotHeight
  const baseline = hasNegative ? top + plotHeight / 2 : top + plotHeight
  const slot = (width - 12) / points.length
  const barWidth = Math.min(18, slot * 0.56)

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      role="img"
      aria-label="净开销趋势"
    >
      <line
        x1="4"
        x2={width - 4}
        y1={baseline}
        y2={baseline}
        stroke="var(--separator)"
        strokeWidth="0.8"
      />
      {reference > 0 && (
        <line
          x1="4"
          x2={width - 4}
          y1={baseline - (reference / scaleMax) * positiveHeight}
          y2={baseline - (reference / scaleMax) * positiveHeight}
          stroke="var(--green)"
          strokeWidth="0.8"
          strokeDasharray="4 4"
          opacity="0.55"
        />
      )}
      {points.map((point, index) => {
        const x = 6 + index * slot + (slot - barWidth) / 2
        const value = point.value
        if (value === null || !Number.isFinite(value)) {
          return (
            <g key={point.key}>
              <rect x={x} y={baseline - 1} width={barWidth} height={2} rx={1} fill="var(--fill)" />
              <text
                x={x + barWidth / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--text-3)"
                fontFamily="inherit"
              >
                {shortMonthLabel(point.key)}
              </text>
            </g>
          )
        }
        const barHeight = (Math.abs(value) / scaleMax) * positiveHeight
        const isPositive = value >= 0
        return (
          <g key={point.key}>
            <rect
              x={x}
              y={isPositive ? baseline - barHeight : baseline}
              width={barWidth}
              height={Math.max(barHeight, 1.5)}
              rx={Math.min(4, barWidth / 3)}
              fill={isPositive ? color : 'var(--green)'}
              opacity={isPositive ? 0.9 : 0.75}
            />
            <text
              x={x + barWidth / 2}
              y={height - 5}
              textAnchor="middle"
              fontSize="8.5"
              fill="var(--text-3)"
              fontFamily="inherit"
            >
              {shortMonthLabel(point.key)}
            </text>
            <title>{`${point.key} · ${formatCompact(value)}`}</title>
          </g>
        )
      })}
    </svg>
  )
}
