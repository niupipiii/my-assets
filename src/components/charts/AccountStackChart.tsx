import { useMemo } from 'react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import { getSnapshot, monthLabel, prevMonthKey, shortMonthLabel, shiftMonth } from '../../domain/selectors'
import { formatMoney } from '../../domain/money'
import type { Account, LedgerV2 } from '../../domain/types'

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function mix(base: string, target: string, amount: number): string {
  const a = hexToRgb(base)
  const b = hexToRgb(target)
  const t = Math.max(0, Math.min(1, amount))
  return `#${a
    .map((channel, index) => Math.round(channel + (b[index] - channel) * t).toString(16).padStart(2, '0'))
    .join('')}`
}

const SHADES = [0, 0.28, -0.22, 0.5, -0.42, 0.12]

function accountColor(account: Account, index: number): string {
  const base = categoryOf(account.category).color
  const shade = SHADES[index % SHADES.length]
  return shade === 0 ? base : mix(base, shade > 0 ? '#ffffff' : '#000000', Math.abs(shade))
}

interface Point {
  key: string
  total: number
  values: number[]
}

export function AccountStackChart({ ledger, month }: { ledger: LedgerV2; month: string }) {
  const count = 12
  const keys = useMemo(
    () => Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1)),
    [month],
  )
  const snapshots = useMemo(
    () => new Map(keys.map((key) => [key, getSnapshot(ledger, key)])),
    [keys, ledger],
  )
  const accounts = useMemo(() => {
    return ledger.accounts
      .filter((account) =>
        keys.some((key) => Math.abs(snapshots.get(key)?.balances[account.id] ?? 0) > 0),
      )
      .sort((a, b) => {
        const orderA = CATEGORIES.findIndex((category) => category.key === a.category)
        const orderB = CATEGORIES.findIndex((category) => category.key === b.category)
        return orderA - orderB || a.order - b.order
      })
  }, [ledger.accounts, keys, snapshots])

  const colors = useMemo(() => {
    const perCategory = new Map<string, number>()
    const map = new Map<string, string>()
    for (const account of accounts) {
      const index = perCategory.get(account.category) ?? 0
      map.set(account.id, accountColor(account, index))
      perCategory.set(account.category, index + 1)
    }
    return map
  }, [accounts])

  const points: Point[] = useMemo(
    () =>
      keys.map((key) => {
        const snapshot = snapshots.get(key)
        const values = accounts.map((account) => Math.max(0, snapshot?.balances[account.id] ?? 0))
        const total = values.reduce((sum, value) => sum + value, 0)
        return { key, values, total }
      }),
    [keys, snapshots, accounts],
  )

  const current = points[points.length - 1]
  const prevSnapshot = getSnapshot(ledger, prevMonthKey(month))
  const prevValues = accounts.map((account) => Math.max(0, prevSnapshot?.balances[account.id] ?? 0))
  const prevTotal = prevValues.reduce((sum, value) => sum + value, 0)

  if (accounts.length === 0) {
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
        aria-label="账户月度构成 100% 堆积图"
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
          const isSelected = point.key === month
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
                accounts.map((account, accountIndex) => {
                  const value = point.values[accountIndex] ?? 0
                  if (value <= 0) return null
                  const segment = (value / point.total) * plotHeight
                  y -= segment
                  const share = Math.round((value / point.total) * 100)
                  return (
                    <rect
                      key={account.id}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={segment}
                      fill={colors.get(account.id)}
                      stroke="var(--card)"
                      strokeWidth="0.5"
                    >
                      <title>
                        {`${monthLabel(point.key)} · ${account.name} · ${
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
        <span>{monthLabel(month)}</span>
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
        {accounts.map((account, index) => {
          const currentValue = current.values[index] ?? 0
          const share = current.total > 0 ? currentValue / current.total : 0
          const prevValue = prevValues[index] ?? 0
          const prevShare = prevTotal > 0 ? prevValue / prevTotal : 0
          const pp = Math.round((share - prevShare) * 100)
          return (
            <div key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 3,
                  background: colors.get(account.id),
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
                {account.name}
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
