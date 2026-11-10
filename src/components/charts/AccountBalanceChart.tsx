import { useMemo, useState } from 'react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import {
  categoryTotalOf,
  getSnapshot,
  monthLabel,
  shortMonthLabel,
  shiftMonth,
} from '../../domain/selectors'
import { formatCompact, formatMoney } from '../../domain/money'
import type { LedgerV2 } from '../../domain/types'

interface Point {
  key: string
  values: number[]
}

export function AccountBalanceChart({ ledger, month }: { ledger: LedgerV2; month: string }) {
  const count = 12
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const keys = useMemo(
    () => Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1)),
    [month],
  )
  const snapshots = useMemo(
    () => new Map(keys.map((key) => [key, getSnapshot(ledger, key)])),
    [keys, ledger],
  )
  const categories = useMemo(
    () =>
      CATEGORIES.filter((category) =>
        keys.some((key) => categoryTotalOf(snapshots.get(key), ledger, category.key) > 0),
      ),
    [keys, snapshots, ledger],
  )
  const points: Point[] = useMemo(
    () =>
      keys.map((key) => {
        const snapshot = snapshots.get(key)
        return {
          key,
          values: categories.map((category) => categoryTotalOf(snapshot, ledger, category.key)),
        }
      }),
    [keys, snapshots, categories, ledger],
  )

  const current = points[points.length - 1]
  const currentValues = current?.values ?? []
  const allValues = points.flatMap((point) => point.values)
  const dataMax = Math.max(0, ...allValues)
  const max = dataMax > 0 ? dataMax * 1.08 : 1
  const min = 0
  const ticks = [max, max / 2, 0]

  if (categories.length === 0) {
    return <div className="small faint" style={{ padding: '12px 0' }}>还没有可展示的账户余额</div>
  }

  const width = 360
  const height = 190
  const top = 10
  const bottom = 22
  const left = 44
  const right = 18
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const xFor = (index: number) => left + (index / (count - 1)) * plotWidth
  const yFor = (value: number) => top + plotHeight - ((value - min) / (max - min)) * plotHeight

  const toggle = (key: string) => {
    setHidden((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        role="img"
        aria-label="一级账户每月余额绝对值曲线"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="var(--separator)"
              strokeWidth="0.7"
              strokeDasharray={tick === 0 ? undefined : '2 4'}
            />
            <text
              x={left - 5}
              y={yFor(tick) + 3}
              textAnchor="end"
              fontSize="8"
              fill="var(--text-3)"
              fontFamily="inherit"
            >
              {ledger.settings.hideAmounts ? '••' : formatCompact(tick)}
            </text>
          </g>
        ))}

        {categories.map((category, categoryIndex) => {
          if (hidden.has(category.key)) return null
          const color = categoryOf(category.key).color
          const pointsString = points
            .map((point, index) => `${xFor(index)},${yFor(point.values[categoryIndex] ?? 0)}`)
            .join(' ')
          return (
            <g key={category.key}>
              <polyline
                points={pointsString}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.map((point, index) => {
                const value = point.values[categoryIndex] ?? 0
                const isSelected = point.key === month
                return (
                  <circle
                    key={point.key}
                    cx={xFor(index)}
                    cy={yFor(value)}
                    r={isSelected ? 3.2 : 1.9}
                    fill={color}
                    stroke="var(--card)"
                    strokeWidth={isSelected ? 1 : 0.5}
                  >
                    <title>
                      {`${monthLabel(point.key)} · ${categoryOf(category.key).label} · ${
                        ledger.settings.hideAmounts ? '••••' : formatMoney(value)
                      }`}
                    </title>
                  </circle>
                )
              })}
            </g>
          )
        })}

        {points.map((point, index) => (
          <text
            key={point.key}
            x={xFor(index)}
            y={height - 5}
            textAnchor="middle"
            fontSize="8"
            fill={point.key === month ? 'var(--text)' : 'var(--text-3)'}
            fontWeight={point.key === month ? 650 : 400}
            fontFamily="inherit"
          >
            {shortMonthLabel(point.key)}
          </text>
        ))}
      </svg>

      <div className="tiny faint" style={{ marginTop: 1 }}>
        每个一级账户每月的余额绝对值（元）· 点击图例筛选
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 14px',
          marginTop: 10,
          paddingTop: 10,
          borderTop: '0.5px solid var(--separator)',
        }}
      >
        {categories.map((category, index) => {
          const value = currentValues[index] ?? 0
          const dimmed = hidden.has(category.key)
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => toggle(category.key)}
              aria-pressed={!dimmed}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                padding: 3,
                margin: -3,
                border: 0,
                borderRadius: 7,
                background: 'none',
                color: 'inherit',
                cursor: 'pointer',
                opacity: dimmed ? 0.35 : 1,
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 3,
                  background: category.color,
                  flex: 'none',
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {category.label}
              </span>
              <span className="money tiny" style={{ color: 'var(--text-2)', fontWeight: 650 }}>
                {ledger.settings.hideAmounts ? '••••' : formatMoney(value)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
