import { useMemo } from 'react'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

export function DonutChart({
  slices,
  size = 150,
  centerTop,
  centerBottom,
}: {
  slices: DonutSlice[]
  size?: number
  centerTop: string
  centerBottom?: string
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0)
  const stroke = 16
  const radius = (size - stroke) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  const segments = useMemo(() => {
    let offset = 0
    return slices
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const length = total > 0 ? (slice.value / total) * circumference : 0
        const segment = { ...slice, length, offset }
        offset += length
        return segment
      })
  }, [slices, total, circumference])

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="资产配置">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--fill-2)"
          strokeWidth={stroke}
        />
        {segments.map((segment) => (
          <circle
            key={segment.key}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${Math.max(segment.length - 2, 0.5)} ${circumference}`}
            strokeDashoffset={-segment.offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div className="money" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>
          {centerTop}
        </div>
        {centerBottom && (
          <div className="tiny faint" style={{ marginTop: 1 }}>
            {centerBottom}
          </div>
        )}
      </div>
    </div>
  )
}
