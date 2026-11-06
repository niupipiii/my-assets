import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Share2 } from 'lucide-react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import {
  allocationOf,
  categoryTotalOf,
  categoryTotalsOf,
  currentMonthKey,
  effectiveSalary,
  getSnapshot,
  latestSnapshotKey,
  monthKey,
  monthLabel,
  monthMetrics,
  monthSeries,
  prevMonthKey,
  snapshotKey,
  totalOf,
  topMovers,
} from '../../domain/selectors'
import { formatMoney, formatPercent, formatSignedMoney } from '../../domain/money'
import type { CategoryKey } from '../../domain/types'
import { useLedger } from '../../store/LedgerProvider'
import { useToast } from '../../components/Toast'
import { Segmented } from '../../components/Segmented'
import { EmptyState } from '../../components/EmptyState'
import { CategoryIcon } from '../../components/CategoryIcon'
import { MiniBars } from '../../components/charts/MiniBars'
import { shareMonthReport } from '../../lib/shareReport'

export function ReportsScreen({
  month,
  onPickMonth,
  onSelectMonth,
}: {
  month: string
  onPickMonth: () => void
  onSelectMonth: (key: string) => void
}) {
  const ledger = useLedger()
  const toast = useToast()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [sharing, setSharing] = useState(false)
  const snapshot = getSnapshot(ledger, month)
  const metrics = monthMetrics(ledger, month)
  const series = monthSeries(ledger, month, 12)
  const prevSnapshot = getSnapshot(ledger, prevMonthKey(month))
  const prevKey = prevMonthKey(month)

  const year = Number(month.slice(0, 4))
  const yearMonths = useMemo(() => Array.from({ length: 12 }, (_, index) => monthKey(year, index + 1)), [year])
  const yearRows = yearMonths.map((key) => ({
    key,
    snapshot: getSnapshot(ledger, key),
    metrics: monthMetrics(ledger, key),
  }))
  const yearLast = [...yearRows].reverse().find((row) => row.snapshot)
  const yearFirst = yearRows.find((row) => row.snapshot)
  const previousYearEnd = getSnapshot(ledger, monthKey(year - 1, 12))
  const yearStartSnapshot = previousYearEnd ?? yearFirst?.snapshot
  const yearEndSnapshot = yearLast?.snapshot
  const yearStartTotal = yearStartSnapshot ? totalOf(yearStartSnapshot, ledger) : null
  const yearEndTotal = yearEndSnapshot ? totalOf(yearEndSnapshot, ledger) : null
  const yearDelta = yearStartTotal !== null && yearEndTotal !== null ? yearEndTotal - yearStartTotal : null
  const yearMetrics = yearRows.filter((row) => row.snapshot).map((row) => row.metrics)
  const yearSalary = yearMetrics.reduce((sum, item) => sum + (item.salary ?? 0), 0)
  const yearNetSpend = yearMetrics.reduce((sum, item) => sum + (item.netSpend ?? 0), 0)
  const yearSavingsRate = yearSalary > 0 ? (yearSalary - yearNetSpend) / yearSalary : null
  const yearSeries = yearRows.map((row) => ({
    key: row.key,
    value: row.metrics.netSpend,
    reference: row.metrics.salary,
  }))

  const categoryDeltas = CATEGORIES.map((category) => {
    const current = categoryTotalOf(snapshot, ledger, category.key)
    const previous = categoryTotalOf(prevSnapshot, ledger, category.key)
    return { category: category.key, current, previous, delta: current - previous }
  }).filter((row) => row.current !== 0 || row.previous !== 0)

  const drift = CATEGORIES.map((category) => {
    const current = categoryTotalOf(snapshot, ledger, category.key)
    const previous = categoryTotalOf(prevSnapshot, ledger, category.key)
    const currentTotal = totalOf(snapshot, ledger)
    const previousTotal = prevSnapshot ? totalOf(prevSnapshot, ledger) : 0
    const currentShare = currentTotal > 0 ? current / currentTotal : 0
    const previousShare = previousTotal > 0 ? previous / previousTotal : 0
    return { category: category.key, currentShare, previousShare, diff: currentShare - previousShare, current }
  }).filter((row) => row.current !== 0)

  const movers = topMovers(ledger, month, 5)
  const topContribution = [...categoryDeltas].sort((a, b) => b.delta - a.delta)[0]
  const maxAbsDelta = Math.max(1, ...categoryDeltas.map((row) => Math.abs(row.delta)))

  const summaryParts: string[] = []
  if (metrics.delta !== null && metrics.prevTotal) {
    summaryParts.push(`总资产较上月 ${formatPercent(metrics.delta / metrics.prevTotal)}`)
  }
  if (metrics.netSpend !== null) {
    summaryParts.push(
      `${metrics.netSpend >= 0 ? '净开销' : '净结余'} ${formatMoney(Math.abs(metrics.netSpend))}`,
    )
  }
  if (metrics.savingsRate !== null) {
    summaryParts.push(`储蓄率 ${formatPercent(metrics.savingsRate, 0)}`)
  }

  const share = async () => {
    setSharing(true)
    try {
      const result = await shareMonthReport(ledger, month)
      if (result === 'shared') toast.show('已打开分享')
      else if (result === 'downloaded') toast.show('月报图片已下载')
      else toast.show('生成月报失败，请先记录本月余额')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="screen">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div>
          <h1 className="large-title">报表</h1>
          <p className="page-subtitle">把数字变成能看懂的变化</p>
        </div>
        <button className="pill" onClick={onPickMonth} style={{ padding: '8px 11px', background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
          <CalendarDays size={14} />
          <span className="mono">{monthLabel(month)}</span>
          <ChevronRight size={13} className="faint" />
        </button>
      </header>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'month', label: '月度' },
          { value: 'year', label: '年度' },
        ]}
        ariaLabel="报表周期"
      />

      {mode === 'month' ? (
        !snapshot ? (
          <div className="card" style={{ marginTop: 12 }}>
            <EmptyState
              icon={<CalendarDays size={24} />}
              title={`${monthLabel(month)}还没有数据`}
              description="记录余额、设置工资后，月报会自动生成。"
            />
          </div>
        ) : (
          <>
            <section
              className="card"
              style={{
                marginTop: 12,
                background: 'var(--card)',
                border: '0.5px solid var(--separator)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div className="tiny" style={{ color: 'var(--accent)', fontWeight: 750, letterSpacing: '.04em' }}>
                {monthLabel(month)} 概览
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
                <div>
                  <div className="tiny faint">总资产</div>
                  <div className="money" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
                    {ledger.settings.hideAmounts ? '••••' : formatMoney(totalOf(snapshot, ledger))}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tiny faint">较上月</div>
                  <div
                    className="money"
                    style={{
                      fontSize: 15,
                      fontWeight: 750,
                      color: (metrics.delta ?? 0) >= 0 ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {metrics.delta === null
                      ? '—'
                      : `${formatSignedMoney(metrics.delta)}${metrics.prevTotal ? ` · ${formatPercent(metrics.delta / metrics.prevTotal)}` : ''}`}
                  </div>
                </div>
              </div>
              <div className="small" style={{ marginTop: 10, color: 'var(--text-2)', lineHeight: 1.6 }}>
                {summaryParts.length > 0 ? summaryParts.join('，') + '。' : '补齐上月余额与工资后，月报会更完整。'}
                {topContribution && topContribution.delta > 0 && (
                  <>
                    {' '}主要变动来自 {categoryOf(topContribution.category).short}{' '}
                    {formatSignedMoney(topContribution.delta)}。
                  </>
                )}
              </div>
              <button
                className="btn"
                style={{ width: '100%', marginTop: 12, minHeight: 40, fontSize: 14 }}
                onClick={share}
                disabled={sharing}
              >
                <Share2 size={15} /> {sharing ? '生成中…' : '分享月报图片'}
              </button>
            </section>

            <section className="card" style={{ marginTop: 12 }}>
              <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
                净开销趋势
                <span className="tiny faint">绿线为工资</span>
              </div>
              <MiniBars points={series.map((point) => ({ key: point.key, value: point.netSpend, reference: point.salary }))} />
            </section>

            <section className="card" style={{ marginTop: 12 }}>
              <div className="section-title" style={{ margin: 0, marginBottom: 4 }}>
                本月推导
                <span className="tiny faint">工资 + 收益 − 资产变化</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <DerivationRow label="工资" value={metrics.salary} />
                <DerivationRow label="其他收入" value={metrics.otherIncome || null} />
                <DerivationRow label="投资收益（估算）" value={metrics.investReturn} />
                <DerivationRow label="资产变化" value={metrics.delta} />
                <DerivationRow label="其他流出（非消费）" value={metrics.otherOutflow || null} negative />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: 10,
                    marginTop: 6,
                    borderTop: '0.5px solid var(--separator)',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {metrics.netSpend !== null && metrics.netSpend < 0 ? '净结余' : '净开销'}
                  </span>
                  <span className="money" style={{ fontSize: 17, fontWeight: 800 }}>
                    {metrics.netSpend === null ? '—' : formatMoney(Math.abs(metrics.netSpend))}
                  </span>
                </div>
              </div>
              <p className="tiny faint" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                投资收益 = 投资类资产变化 − 本月净转入投资。转入/转出投资请在"记录 → 调整项"填写。
              </p>
            </section>

            <section className="card" style={{ marginTop: 12 }}>
              <div className="section-title" style={{ margin: 0, marginBottom: 6 }}>
                变动归因
                <span className="tiny faint">较 {monthLabel(prevKey)}</span>
              </div>
              {categoryDeltas.length === 0 ? (
                <div className="small faint" style={{ padding: '10px 0' }}>
                  本月没有分类变化
                </div>
              ) : (
                <>
                  <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 8px' }}>
                    <span>期初 {metrics.prevTotal !== null ? formatMoney(metrics.prevTotal) : '—'}</span>
                    <span>期末 {formatMoney(totalOf(snapshot, ledger))}</span>
                  </div>
                  {categoryDeltas
                    .slice()
                    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                    .map((row) => (
                      <div key={row.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                        <CategoryIcon category={row.category} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span>{categoryOf(row.category).short}</span>
                            <span className="money" style={{ color: row.delta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 650 }}>
                              {formatSignedMoney(row.delta)}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 99,
                              marginTop: 4,
                              background: 'var(--fill-2)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${(Math.abs(row.delta) / maxAbsDelta) * 100}%`,
                                borderRadius: 99,
                                background: row.delta >= 0 ? 'var(--green)' : 'var(--red)',
                                opacity: 0.75,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </section>

            <section className="card" style={{ marginTop: 12 }}>
              <div className="section-title" style={{ margin: 0, marginBottom: 6 }}>
                配置漂移
                <span className="tiny faint">百分点变化</span>
              </div>
              {drift.map((row) => {
                const pp = Math.round(row.diff * 100)
                return (
                  <div key={row.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                    <span className="dot" style={{ background: categoryOf(row.category).color }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{categoryOf(row.category).short}</span>
                    <span className="money tiny" style={{ color: 'var(--text-2)' }}>
                      {Math.round(row.currentShare * 100)}%
                    </span>
                    <span
                      className="money tiny"
                      style={{
                        width: 54,
                        textAlign: 'right',
                        fontWeight: 650,
                        color: pp === 0 ? 'var(--text-2)' : pp > 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {pp === 0 ? '0pp' : `${pp > 0 ? '+' : ''}${pp}pp`}
                    </span>
                  </div>
                )
              })}
            </section>

            {movers.length > 0 && (
              <section className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
                <div className="section-title" style={{ margin: 0, padding: '14px 16px 8px' }}>
                  账户涨跌 Top 5
                </div>
                {movers.map((row) => (
                  <div key={row.account.id} className="list-row" style={{ background: 'transparent' }}>
                    <CategoryIcon category={row.account.category} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{row.account.name}</div>
                      <div className="tiny faint">{categoryOf(row.account.category).short}</div>
                    </div>
                    <div className="money" style={{ fontSize: 14, fontWeight: 700, color: row.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {formatSignedMoney(row.delta)}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )
      ) : (
        <YearView
          year={year}
          yearRows={yearRows}
          yearStartTotal={yearStartTotal}
          yearEndTotal={yearEndTotal}
          yearDelta={yearDelta}
          yearSalary={yearSalary}
          yearNetSpend={yearNetSpend}
          yearSavingsRate={yearSavingsRate}
          yearSeries={yearSeries}
          startSnapshot={yearStartSnapshot}
          endSnapshot={yearEndSnapshot}
          onSelectMonth={(key) => {
            onSelectMonth(key)
            setMode('month')
          }}
        />
      )}
    </div>
  )
}

function DerivationRow({ label, value, negative = false }: { label: string; value: number | null; negative?: boolean }) {
  const ledger = useLedger()
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span className="small muted">{label}</span>
      <span className="money small" style={{ fontWeight: 650, color: negative && value ? 'var(--red)' : 'var(--text)' }}>
        {value === null || value === 0
          ? value === 0
            ? '¥0'
            : '—'
          : ledger.settings.hideAmounts
            ? '••••'
            : negative
              ? `−${formatMoney(value)}`
              : formatMoney(value)}
      </span>
    </div>
  )
}

function YearView({
  year,
  yearRows,
  yearStartTotal,
  yearEndTotal,
  yearDelta,
  yearSalary,
  yearNetSpend,
  yearSavingsRate,
  yearSeries,
  startSnapshot,
  endSnapshot,
  onSelectMonth,
}: {
  year: number
  yearRows: Array<{ key: string; snapshot: ReturnType<typeof getSnapshot>; metrics: ReturnType<typeof monthMetrics> }>
  yearStartTotal: number | null
  yearEndTotal: number | null
  yearDelta: number | null
  yearSalary: number
  yearNetSpend: number
  yearSavingsRate: number | null
  yearSeries: Array<{ key: string; value: number | null; reference: number | null }>
  startSnapshot: ReturnType<typeof getSnapshot>
  endSnapshot: ReturnType<typeof getSnapshot>
  onSelectMonth: (key: string) => void
}) {
  const ledger = useLedger()
  if (!endSnapshot) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <EmptyState
          icon={<CalendarDays size={24} />}
          title={`${year} 年还没有数据`}
          description="先记录几个月余额，再回来看年度汇总。"
        />
      </div>
    )
  }
  const startTotals = startSnapshot ? categoryTotalsOf(startSnapshot, ledger) : null
  const endTotals = categoryTotalsOf(endSnapshot, ledger)
  const categoryChanges = CATEGORIES.map((category) => ({
    category: category.key,
    start: startTotals?.[category.key] ?? 0,
    end: endTotals[category.key] ?? 0,
    delta: (endTotals[category.key] ?? 0) - (startTotals?.[category.key] ?? 0),
  })).filter((row) => row.end !== 0 || row.start !== 0)
  const maxChange = Math.max(1, ...categoryChanges.map((row) => Math.abs(row.delta)))

  return (
    <>
      <section className="card" style={{ marginTop: 12 }}>
        <div className="tiny" style={{ color: 'var(--accent)', fontWeight: 750, letterSpacing: '.04em' }}>
          {year} 年度汇总
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
          <div>
            <div className="tiny faint">年末总资产</div>
            <div className="money" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
              {yearEndTotal !== null ? formatMoney(yearEndTotal) : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tiny faint">年度变化</div>
            <div className="money" style={{ fontSize: 15, fontWeight: 700, color: (yearDelta ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {yearDelta === null ? '—' : formatSignedMoney(yearDelta)}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--separator)' }}>
          <div>
            <div className="tiny faint">年度工资</div>
            <div className="money" style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{formatMoney(yearSalary)}</div>
          </div>
          <div>
            <div className="tiny faint">年度净开销</div>
            <div className="money" style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{formatMoney(yearNetSpend)}</div>
          </div>
          <div>
            <div className="tiny faint">储蓄率</div>
            <div className="money" style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{formatPercent(yearSavingsRate, 0)}</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
          每月净开销
          <span className="tiny faint">绿线为工资</span>
        </div>
        <MiniBars points={yearSeries} />
      </section>

      <section className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="section-title" style={{ margin: 0, padding: '14px 16px 8px' }}>
          月度明细
          <span className="tiny faint">{yearRows.filter((row) => row.snapshot).length} 个月</span>
        </div>
        {yearRows.map((row) => {
          if (!row.snapshot) return null
          return (
            <button
              key={row.key}
              className="list-row"
              style={{ background: 'transparent' }}
              onClick={() => onSelectMonth(row.key)}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'var(--fill-2)',
                  color: 'var(--accent)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 750,
                }}
              >
                {row.snapshot.month}月
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{monthLabel(row.key, false)}</div>
                <div className="tiny faint">
                  工资 {row.metrics.salary !== null ? formatMoney(row.metrics.salary) : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="money" style={{ fontSize: 13, fontWeight: 700 }}>
                  {formatMoney(totalOf(row.snapshot, ledger))}
                </div>
                <div className="tiny money" style={{ color: (row.metrics.netSpend ?? 0) >= 0 ? 'var(--text-2)' : 'var(--green)' }}>
                  {row.metrics.netSpend === null ? '净开销 —' : `${row.metrics.netSpend >= 0 ? '净开销' : '结余'} ${formatMoney(Math.abs(row.metrics.netSpend))}`}
                </div>
              </div>
              <ChevronRight size={14} className="faint" />
            </button>
          )
        })}
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="section-title" style={{ margin: 0, marginBottom: 6 }}>
          年度分类变化
          <span className="tiny faint">年初 → 年末</span>
        </div>
        {categoryChanges.map((row) => (
          <div key={row.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <CategoryIcon category={row.category} size={26} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{categoryOf(row.category).short}</span>
                <span className="money" style={{ color: row.delta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 650 }}>
                  {formatSignedMoney(row.delta)}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 99, marginTop: 4, background: 'var(--fill-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(Math.abs(row.delta) / maxChange) * 100}%`, background: row.delta >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.75 }} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="tiny faint" style={{ margin: '14px 4px 4px', lineHeight: 1.5 }}>
        年度净开销只统计有上月快照且设置了工资的月份；缺失月份不计入。
      </div>
    </>
  )
}
