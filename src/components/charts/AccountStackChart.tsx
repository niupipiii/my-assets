import { useMemo } from 'react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import {
  categoryTotalOf,
  getSnapshot,
  monthLabel,
  prevMonthKey,
  shortMonthLabel,
  shiftMonth,
} from '../../domain/selectors'
import { formatMoney } from '../../domain/money'
import type { LedgerV2 } from '../../domain/types'

interface Point {
  key: string
  total: number
  values: number[]
}

export function AccountStackChart({
  ledger,
  month,
  highlight,
}: {
  ledger: LedgerV2
  month: string
  highlight?: string
}) {
  const count = 12
  const selectedKey = highlight ?? month
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
        const values = categories.map((category) => categoryTotalOf(snapshot, ledger, category.key))
        return { key, values, total: values.reduce((sum, value) => sum + value, 0) }
      }),
    [keys, snapshots, categories, ledger],
  )

  const current = points.find((point) => point.key === selectedKey) ?? points[points.length - 1]
  const prevSnapshot = getSnapshot(ledger, prevMonthKey(selectedKey))
  const prevValues = categories.map((category) => categoryTotalOf(prevSnapshot, ledger, category.key))
  const prevTotal = prevValues.reduce((sum, value) => sum + value, 0)

  if (categories.length === 0) {
    return <div className="small faint" style={{ padding: '12px 0' }}>还没有可展示的账户余额</div>
  }

  const width = 360
  const height = 186
  const top = 8
  const bottom = 22
  const plotHeight = height - top - bottom
  const slot = (width - 8) / count
  const barWidth = Math.min(22, slot * 0.66)

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        role="img"
        aria-label="一级账户月度构成 100% 堆积图"
      >
        <line x1="4" x2={width - 4} y1={top} y2={top} stroke="var(--separator)" strokeWidth="0.7" strokeDasharray="2 4" />
        <line
          x1="4"
          x2={width - 4}
          y1={top + plotHeight / 2}
          y2={top + plotHeight / 2}
          stroke="var(--separator)"
          strokeWidth="0.7"
          strokeDasharray="2 4"
        />
        <line x1="4" x2={width - 4} y1={top + plotHeight} y2={top + plotHeight} stroke="var(--separator)" strokeWidth="0.8" />
        {points.map((point, pointIndex) => {
          const x = 4 + pointIndex * slot + (slot - barWidth) / 2
          const isSelected = point.key === selectedKey
          let y = top + plotHeight
          return (
            <g key={point.key}>
              {isSelected && point.total > 0 && (
                <rect
                  x={x - 2}
                  y={top - 4}
                  width={barWidth + 4}
                  height={plotHeight + 8}
                  rx={5}
                  fill="var(--fill-2)"
                />
              )}
              {point.total > 0 &&
                categories.map((category, categoryIndex) => {
                  const value = point.values[categoryIndex] ?? 0
                  if (value <= 0) return null
                  const segment = (value / point.total) * plotHeight
                  y -= segment
                  const share = Math.round((value / point.total) * 100)
                  return (
                    <rect
                      key={category.key}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={segment}
                      fill={categoryOf(category.key).color}
                      stroke="var(--card)"
                      strokeWidth="0.5"
                    >
                      <title>
                        {`${monthLabel(point.key)} · ${categoryOf(category.key).label} · ${
                          ledger.settings.hideAmounts ? `${share}%` : `${formatMoney(value)} · ${share}%`
                        }`}
                      </title>
                    </rect>
                  )
                })}
              <text
                x={x + barWidth / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize="8"
                fill={isSelected ? 'var(--text)' : 'var(--text-3)'}
                fontWeight={isSelected ? 650 : 400}
                fontFamily="inherit"
              >
                {shortMonthLabel(point.key)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="tiny faint" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span>每月总资产 = 100%</span>
        <span>{monthLabel(selectedKey)}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 14px',
          marginTop: 12,
          paddingTop: 10,
          borderTop: '0.5px solid var(--separator)',
        }}
      >
        {categories.map((category, index) => {
          const currentValue = current.values[index] ?? 0
          const share = current.total > 0 ? currentValue / current.total : 0
          const prevValue = prevValues[index] ?? 0
          const prevShare = prevTotal > 0 ? prevValue / prevTotal : 0
          const pp = Math.round((share - prevShare) * 100)
          return (
            <div key={category.key} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
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
                {Math.round(share * 100)}%
              </span>
              <span
                className="money"
                style={{
                  width: 36,
                  textAlign: 'right',
                  fontSize: 10,
                  fontWeight: 650,
                  color: pp === 0 ? 'var(--text-3)' : pp > 0 ? 'var(--green)' : 'var(--red)',
                }}
              >
                {pp === 0 ? '0pp' : `${pp > 0 ? '+' : ''}${pp}pp`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
