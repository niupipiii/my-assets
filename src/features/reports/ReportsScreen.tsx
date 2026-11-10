import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Share2 } from 'lucide-react'
import {
  getSnapshot,
  monthKey,
  monthLabel,
  monthMetrics,
  monthSeries,
  totalOf,
} from '../../domain/selectors'
import { formatMoney, formatPercent, formatSignedMoney } from '../../domain/money'
import { useLedger } from '../../store/LedgerProvider'
import { useToast } from '../../components/Toast'
import { Segmented } from '../../components/Segmented'
import { EmptyState } from '../../components/EmptyState'
import { MiniBars } from '../../components/charts/MiniBars'
import { AccountStackChart } from '../../components/charts/AccountStackChart'
import { AccountBalanceChart } from '../../components/charts/AccountBalanceChart'
import { shareMonthReport } from '../../lib/shareReport'

export function ReportsScreen({
  month,
  onPickMonth,
}: {
  month: string
  onPickMonth: () => void
}) {
  const ledger = useLedger()
  const toast = useToast()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [sharing, setSharing] = useState(false)
  const snapshot = getSnapshot(ledger, month)
  const metrics = monthMetrics(ledger, month)
  const series = monthSeries(ledger, month, 12)

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
              <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
                一级账户月度构成
                <span className="tiny faint">每月 100% · 按一级账户</span>
              </div>
              <AccountStackChart ledger={ledger} month={month} />
            </section>

            <section className="card" style={{ marginTop: 12 }}>
              <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
                一级账户余额趋势
                <span className="tiny faint">每月余额 · 点击图例筛选</span>
              </div>
              <AccountBalanceChart ledger={ledger} month={month} />
            </section>
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
          endSnapshot={yearEndSnapshot}
        />
      )}
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
  endSnapshot,
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
  endSnapshot: ReturnType<typeof getSnapshot>
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

      <section className="card" style={{ marginTop: 12 }}>
        <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
          一级账户月度构成
          <span className="tiny faint">每月 100% · 按一级账户</span>
        </div>
        <AccountStackChart
          ledger={ledger}
          month={monthKey(year, 12)}
          highlight={endSnapshot ? monthKey(endSnapshot.year, endSnapshot.month) : monthKey(year, 12)}
        />
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="section-title" style={{ margin: 0, marginBottom: 8 }}>
          一级账户余额趋势
          <span className="tiny faint">每月余额 · 点击图例筛选</span>
        </div>
        <AccountBalanceChart
          ledger={ledger}
          month={monthKey(year, 12)}
          highlight={endSnapshot ? monthKey(endSnapshot.year, endSnapshot.month) : monthKey(year, 12)}
        />
      </section>

      <div className="tiny faint" style={{ margin: '14px 4px 4px', lineHeight: 1.5 }}>
        年度净开销只统计有上月快照且设置了工资的月份；缺失月份不计入。
      </div>
    </>
  )
}
