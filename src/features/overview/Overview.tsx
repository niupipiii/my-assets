import {
  CalendarDays,
  ChevronRight,
  Info,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import {
  allocationOf,
  categoryTotalOf,
  currentMonthKey,
  getSnapshot,
  latestSnapshot,
  latestSnapshotKey,
  monthLabel,
  monthMetrics,
  monthSeries,
  prevMonthKey,
  snapshotKey,
  topMovers,
  totalOf,
} from '../../domain/selectors'
import { formatMoney, formatPercent, formatSignedMoney } from '../../domain/money'
import { useLedger } from '../../store/LedgerProvider'
import { EmptyState } from '../../components/EmptyState'
import { Money } from '../../components/Money'
import { Segmented } from '../../components/Segmented'
import { AreaChart } from '../../components/charts/AreaChart'
import { DonutChart } from '../../components/charts/DonutChart'
import { CategoryIcon } from '../../components/CategoryIcon'

export function Overview({
  month,
  onMonthChange,
  onPickMonth,
  onOpenEntry,
  onOpenFlow,
  onOpenSnapshot,
}: {
  month: string
  onMonthChange: (key: string) => void
  onPickMonth: () => void
  onOpenEntry: (month?: string) => void
  onOpenFlow: () => void
  onOpenSnapshot: (key: string) => void
}) {
  const ledger = useLedger()
  const [range, setRange] = useState<'6' | '12'>('12')
  const snapshot = getSnapshot(ledger, month)
  const metrics = monthMetrics(ledger, month)
  const latest = latestSnapshot(ledger)
  const latestKey = latestSnapshotKey(ledger)
  const now = new Date()
  const currentKey = currentMonthKey(now)
  const reminder = ledger.settings.remindEntry && now.getDate() >= 25 && !getSnapshot(ledger, currentKey)

  const prevKey = prevMonthKey(month)
  const prevSnapshot = getSnapshot(ledger, prevKey)
  const deltaPercent =
    metrics.delta !== null && metrics.prevTotal ? metrics.delta / metrics.prevTotal : null
  const series = monthSeries(ledger, month, range === '6' ? 6 : 12)
  const allocation = allocationOf(ledger, month)
  const movers = topMovers(ledger, month, 4)
  const recent = [...ledger.snapshots]
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .slice(0, 4)

  const salary = metrics.salary
  const netSpend = metrics.netSpend
  const wealth = totalOf(snapshot, ledger)

  return (
    <div className="screen">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div>
          <h1 className="large-title">资产全景</h1>
          <p className="page-subtitle">
            {now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 · 只存在这台手机上
          </p>
        </div>
        <button
          className="pill"
          onClick={onPickMonth}
          style={{ padding: '8px 11px', background: 'var(--card)', boxShadow: 'var(--shadow)' }}
        >
          <CalendarDays size={14} />
          <span className="mono">{monthLabel(month)}</span>
          <ChevronRight size={13} className="faint" />
        </button>
      </header>

      {reminder && (
        <button
          className="card"
          onClick={() => onOpenEntry(currentKey)}
          style={{
            width: '100%',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            background: 'var(--accent-soft)',
            border: '0.5px solid transparent',
            boxShadow: 'none',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--card)',
              color: 'var(--accent)',
              flex: 'none',
            }}
          >
            <Plus size={17} />
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              本月还没有记录余额
            </span>
            <span className="tiny" style={{ color: 'var(--text-2)' }}>
              花 1 分钟更新一下，净开销和报表才完整
            </span>
          </span>
          <ChevronRight size={16} className="faint" />
        </button>
      )}

      {!snapshot ? (
        <div className="card">
          <EmptyState
            icon={<CalendarDays size={24} />}
            title={`${monthLabel(month)}还没有余额快照`}
            description="记录当月各账户余额后，就能看到总资产、配置和净开销。"
            action={
              <button className="btn btn-primary" onClick={() => onOpenEntry(month)}>
                记录 {monthLabel(month)}
              </button>
            }
          />
        </div>
      ) : (
        <>
          <section
            style={{
              borderRadius: 22,
              padding: '18px 18px 16px',
              color: '#fff',
              background: 'linear-gradient(135deg, #5553d8 0%, #7367ef 52%, #9b8cf5 100%)',
              boxShadow: '0 12px 28px rgba(86, 83, 216, 0.26)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                right: -30,
                top: -60,
                width: 180,
                height: 180,
                borderRadius: 999,
                background: 'rgba(255,255,255,.14)',
                filter: 'blur(2px)',
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 650, opacity: 0.78, letterSpacing: '.03em' }}>
              总资产
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginTop: 4,
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-1px',
              }}
            >
              <Money value={wealth} className="money" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {metrics.delta !== null && (
                <span
                  className="money"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 9px',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,.18)',
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  {metrics.delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {formatSignedMoney(metrics.delta)}
                  {deltaPercent !== null ? ` · ${formatPercent(deltaPercent)}` : ''}
                </span>
              )}
              <span className="tiny" style={{ opacity: 0.72 }}>
                较 {monthLabel(prevKey)}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 14,
                paddingTop: 12,
                borderTop: '0.5px solid rgba(255,255,255,.18)',
              }}
            >
              <div>
                <div className="tiny" style={{ opacity: 0.65 }}>
                  投资类资产
                </div>
                <div className="money" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {ledger.settings.hideAmounts ? '••••' : formatMoney(metrics.investTotal)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tiny" style={{ opacity: 0.65 }}>
                  更新
                </div>
                <div style={{ fontSize: 12, fontWeight: 650, marginTop: 3, opacity: 0.9 }}>
                  {new Date(snapshot.updatedAt || snapshot.createdAt).toLocaleDateString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* 净开销 */}
          <section className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>本月净开销</span>
                <span className="tiny faint">工资 + 投资收益 − 资产变化</span>
              </div>
              <button className="icon-btn icon-btn-plain" onClick={onOpenFlow} aria-label="编辑工资与调整">
                <Pencil size={16} />
              </button>
            </div>

            {netSpend !== null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                  <span className="money" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px' }}>
                    {formatMoney(Math.abs(netSpend))}
                  </span>
                  <span className="small" style={{ color: netSpend < 0 ? 'var(--green)' : 'var(--text-2)', fontWeight: 600 }}>
                    {netSpend < 0 ? '净结余' : '净开销'}
                  </span>
                </div>
                <div className="small" style={{ color: 'var(--text-2)', marginTop: 2 }}>
                  工资 {salary !== null ? formatMoney(salary) : '—'} · 结余{' '}
                  {salary !== null ? formatMoney(salary - netSpend) : '—'}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: '0.5px solid var(--separator)',
                  }}
                >
                  <Metric label="工资" value={salary} />
                  <Metric label="投资收益" value={metrics.investReturn} />
                  <Metric label="资产变化" value={metrics.delta} />
                </div>
                {(metrics.otherIncome !== 0 || metrics.otherOutflow !== 0 || metrics.transfer !== 0) && (
                  <div className="tiny faint" style={{ marginTop: 8 }}>
                    调整项：其他收入 {formatMoney(metrics.otherIncome)} · 其他流出{' '}
                    {formatMoney(metrics.otherOutflow)} · 转入投资 {formatMoney(metrics.transfer)}
                  </div>
                )}
                <div className="tiny faint" style={{ marginTop: 6 }}>
                  投资收益为估算（投资类资产变化 − 转入投资）
                </div>
              </>
            ) : (
              <div style={{ marginTop: 6 }}>
                <div className="small" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
                  {metrics.warnings[0] ?? '补齐上月快照并设置工资后显示'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" style={{ flex: 1, minHeight: 40, fontSize: 14 }} onClick={onOpenFlow}>
                    设置工资 / 调整
                  </button>
                  {!metrics.hasPrev && (
                    <button
                      className="btn"
                      style={{ flex: 1, minHeight: 40, fontSize: 14 }}
                      onClick={() => onOpenEntry(prevMonthKey(month))}
                    >
                      补 {monthLabel(prevKey)}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="section-title" style={{ margin: 0 }}>
                总资产趋势
              </div>
              <div style={{ width: 110 }}>
                <Segmented
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: '6', label: '6月' },
                    { value: '12', label: '12月' },
                  ]}
                />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <AreaChart points={series.map((point) => ({ key: point.key, value: point.total }))} />
            </div>
          </section>

          <section className="card" style={{ marginTop: 12 }}>
            <div className="section-title" style={{ margin: 0, marginBottom: 10 }}>
              资产配置
              <span className="tiny faint">占比</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <DonutChart
                slices={allocation.map((slice) => ({
                  key: slice.category,
                  label: slice.label,
                  value: slice.value,
                  color: slice.color,
                }))}
                centerTop={ledger.settings.hideAmounts ? '••••' : formatMoney(wealth)}
                centerBottom="总资产"
              />
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 5 }}>
                {allocation.length === 0 && <span className="small faint">暂无配置</span>}
                {allocation.map((slice) => (
                  <div key={slice.category} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: slice.color, flex: 'none' }} />
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {categoryOf(slice.category).short}
                    </span>
                    <span className="money tiny" style={{ fontWeight: 650, color: 'var(--text-2)' }}>
                      {ledger.settings.hideAmounts ? '••' : `${(slice.share * 100).toFixed(0)}%`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--separator)' }}>
              <div style={{ flex: 1 }}>
                <div className="tiny faint">本月流入</div>
                <div className="money" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {ledger.settings.hideAmounts ? '••••' : formatMoney((salary ?? 0) + (metrics.investReturn ?? 0))}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div className="tiny faint">本月结余</div>
                <div className="money" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                  {ledger.settings.hideAmounts
                    ? '••••'
                    : salary !== null && netSpend !== null
                      ? formatMoney(salary - netSpend)
                      : '—'}
                </div>
              </div>
            </div>
          </section>

          {prevSnapshot && movers.length > 0 && (
            <section className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
              <div className="section-title" style={{ margin: 0, padding: '14px 16px 8px' }}>
                本月变动 Top
                <span className="tiny faint">较 {monthLabel(prevKey)}</span>
              </div>
              {movers.map((row) => {
                const def = categoryOf(row.account.category)
                return (
                  <div key={row.account.id} className="list-row" style={{ background: 'transparent' }}>
                    <CategoryIcon category={row.account.category} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.account.name}
                      </div>
                      <div className="tiny faint">{def.short}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="money" style={{ fontSize: 14, fontWeight: 700, color: row.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {ledger.settings.hideAmounts ? '••••' : formatSignedMoney(row.delta)}
                      </div>
                      <div className="tiny faint money">
                        {ledger.settings.hideAmounts ? '' : formatMoney(row.current)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => onOpenEntry(month)}>
              <Pencil size={16} /> 编辑本月
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onOpenEntry(currentKey)}>
              <Plus size={17} /> 记录本月
            </button>
          </div>
        </>
      )}

      {recent.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <div className="section-title">
            最近记录
            <button
              className="tiny btn-ghost"
              style={{ fontWeight: 600 }}
              onClick={() => onOpenSnapshot(latestKey ?? (recent[0] ? snapshotKey(recent[0]) : ''))}
            >
              查看明细
            </button>
          </div>
          <div className="list">
            {recent.map((item) => {
              const key = snapshotKey(item)
              const value = totalOf(item, ledger)
              const previous = getSnapshot(ledger, prevMonthKey(key))
              const delta = previous ? value - totalOf(previous, ledger) : null
              return (
                <button key={item.id} className="list-row" onClick={() => onMonthChange(key)}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'var(--fill-2)',
                      fontSize: 11,
                      fontWeight: 750,
                      color: 'var(--accent)',
                    }}
                  >
                    {item.month}月
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{monthLabel(key)}</div>
                    <div className="tiny faint">
                      {Object.keys(item.balances).length} 个账户
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="money" style={{ fontSize: 14, fontWeight: 700 }}>
                      <Money value={value} />
                    </div>
                    {delta !== null && (
                      <div
                        className="tiny money"
                        style={{ color: delta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 650 }}
                      >
                        {ledger.settings.hideAmounts ? '' : formatSignedMoney(delta)}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {latest && latestKey !== month && (
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 16 }} onClick={() => onMonthChange(latestKey ?? month)}>
          回到最新记录 {monthLabel(latestKey ?? month)}
        </button>
      )}

      <div className="tiny faint" style={{ display: 'flex', gap: 6, margin: '18px 4px 4px', lineHeight: 1.5 }}>
        <Info size={13} style={{ flex: 'none', marginTop: 1 }} />
        <span>
          净开销是推导值，不是银行流水。转账、借款、买入投资请在"调整项"里填写，才能算得准。
        </span>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | null }) {
  const ledger = useLedger()
  return (
    <div>
      <div className="tiny faint">{label}</div>
      <div className="money" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
        {value === null ? '—' : ledger.settings.hideAmounts ? '••••' : formatMoney(value)}
      </div>
    </div>
  )
}
