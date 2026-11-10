import { type ReactNode, useMemo, useState } from 'react'
import { ChevronRight, Pencil, Search, Tag, Trash2, X } from 'lucide-react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import {
  accountDeltas,
  accountById,
  currentMonthKey,
  displayCategories,
  monthLabel,
  monthMetrics,
  snapshotKey,
  totalOf,
} from '../../domain/selectors'
import { formatMoney, formatSignedMoney } from '../../domain/money'
import { useLedger, useLedgerActions } from '../../store/LedgerProvider'
import { Sheet } from '../../components/Sheet'
import { EmptyState } from '../../components/EmptyState'
import { CategoryIcon } from '../../components/CategoryIcon'
import { useToast } from '../../components/Toast'
import type { CategoryKey } from '../../domain/types'

export function HistoryScreen({
  onOpenEntry,
}: {
  onOpenEntry: (month: string) => void
}) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryKey | 'all'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)

  const tags = useMemo(() => {
    const set = new Set<string>()
    for (const account of ledger.accounts) for (const item of account.tags) set.add(item)
    return [...set]
  }, [ledger.accounts])

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase()
    return [...ledger.snapshots]
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map((snapshot) => {
        const key = snapshotKey(snapshot)
        const accounts = Object.keys(snapshot.balances)
          .map((id) => accountById(ledger, id))
          .filter((account): account is NonNullable<typeof account> => account !== undefined)
        const matched = accounts.filter((account) => {
          if (category !== 'all' && account.category !== category) return false
          if (tag && !account.tags.includes(tag)) return false
          if (text === '') return true
          return (
            account.name.toLowerCase().includes(text) ||
            (account.institution ?? '').toLowerCase().includes(text) ||
            account.tags.some((item) => item.toLowerCase().includes(text))
          )
        })
        const noteMatch = snapshot.note?.toLowerCase().includes(text) ?? false
        if (category !== 'all' && !accounts.some((account) => account.category === category)) {
          return null
        }
        if (tag && !accounts.some((account) => account.tags.includes(tag))) return null
        if (text !== '' && matched.length === 0 && !noteMatch) return null
        const metrics = monthMetrics(ledger, key)
        return { snapshot, key, matched, noteMatch, metrics, accounts }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  }, [ledger, query, category, tag])

  const detail = detailKey
    ? {
        key: detailKey,
        snapshot: ledger.snapshots.find((snapshot) => snapshotKey(snapshot) === detailKey),
        metrics: monthMetrics(ledger, detailKey),
        rows: accountDeltas(ledger, detailKey),
      }
    : null

  const remove = () => {
    if (!detailKey) return
    if (!window.confirm(`删除 ${monthLabel(detailKey)} 的记录？此操作不可撤销。`)) return
    actions.deleteSnapshot(detailKey)
    setDetailKey(null)
    toast.show('已删除该月记录')
  }

  return (
    <div className="screen">
      <header style={{ marginBottom: 12 }}>
        <h1 className="large-title">明细</h1>
      </header>

      <div className="search-box">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索账户、机构、标签或备注"
          enterKeyHint="search"
        />
        {query !== '' && (
          <button onClick={() => setQuery('')} aria-label="清除搜索">
            <X size={15} className="faint" />
          </button>
        )}
      </div>

      <div className="chart-scroll" style={{ display: 'flex', gap: 7, marginTop: 10, paddingBottom: 2 }}>
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
          全部
        </FilterChip>
        {displayCategories(ledger, true).map((item) => (
          <FilterChip
            key={item.key}
            active={category === item.key}
            onClick={() => setCategory(category === item.key ? 'all' : item.key)}
            color={item.color}
          >
            {item.short}
          </FilterChip>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="chart-scroll" style={{ display: 'flex', gap: 7, marginTop: 8, paddingBottom: 2 }}>
          <FilterChip active={tag === null} onClick={() => setTag(null)}>
            <Tag size={12} /> 全部标签
          </FilterChip>
          {tags.map((item) => (
            <FilterChip key={item} active={tag === item} onClick={() => setTag(tag === item ? null : item)}>
              {item}
            </FilterChip>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Search size={23} />}
              title={ledger.snapshots.length === 0 ? '还没有记录' : '没有匹配的记录'}
              description={
                ledger.snapshots.length === 0
                  ? '记录第一笔余额后，这里会按月份列出你的资产变化。'
                  : '换个关键词，或清除分类/标签筛选。'
              }
              action={
                ledger.snapshots.length === 0 ? (
                  <button className="btn btn-primary" onClick={() => onOpenEntry(currentMonthKey())}>
                    开始记录
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          rows.map((row) => {
            const delta = row.metrics.delta
            return (
              <button
                key={row.key}
                className="card"
                style={{ width: '100%', textAlign: 'left', marginBottom: 10, display: 'block' }}
                onClick={() => setDetailKey(row.key)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 750 }}>{monthLabel(row.key)}</div>
                    <div className="tiny faint" style={{ marginTop: 2 }}>
                      {row.accounts.length} 个账户
                      {row.metrics.netSpend !== null && (
                        <>
                          {' · '}净开销{' '}
                          {ledger.settings.hideAmounts
                            ? '••••'
                            : formatMoney(Math.abs(row.metrics.netSpend))}
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="money" style={{ fontSize: 17, fontWeight: 800 }}>
                      {ledger.settings.hideAmounts ? '••••' : formatMoney(totalOf(row.snapshot, ledger))}
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
                </div>

                {query !== '' && row.matched.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
                    {row.matched.slice(0, 4).map((account) => (
                      <span key={account.id} className="pill" style={{ fontSize: 10, padding: '3px 7px' }}>
                        {account.name}
                      </span>
                    ))}
                    {row.matched.length > 4 && (
                      <span className="pill" style={{ fontSize: 10, padding: '3px 7px' }}>
                        +{row.matched.length - 4}
                      </span>
                    )}
                  </div>
                )}
                {row.noteMatch && row.snapshot.note && (
                  <div className="tiny faint" style={{ marginTop: 8 }}>
                    备注：{row.snapshot.note}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {CATEGORIES.filter((item) =>
                    row.accounts.some((account) => account.category === item.key),
                  ).map((item) => (
                    <span
                      key={item.key}
                      className="pill"
                      style={{
                        fontSize: 10,
                        padding: '3px 7px',
                        background: `${item.color}18`,
                        color: item.color,
                      }}
                    >
                      {item.short}
                    </span>
                  ))}
                  <ChevronRight size={15} className="faint" style={{ marginLeft: 'auto' }} />
                </div>
              </button>
            )
          })
        )}
      </div>

      <Sheet
        open={detailKey !== null}
        onClose={() => setDetailKey(null)}
        title={detail ? monthLabel(detail.key) : '月份详情'}
        subtitle={
          detail?.metrics.netSpend !== null && detail
            ? `净开销 ${formatMoney(Math.abs(detail.metrics.netSpend ?? 0))}${(detail.metrics.netSpend ?? 0) < 0 ? '（净结余）' : ''}`
            : undefined
        }
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-danger"
              style={{ flex: 1 }}
              onClick={remove}
              disabled={!detail}
            >
              <Trash2 size={16} /> 删除
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={() => {
                if (!detail) return
                onOpenEntry(detail.key)
                setDetailKey(null)
              }}
            >
              <Pencil size={16} /> 编辑这个月
            </button>
          </div>
        }
      >
        {detail && (
          <>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div className="tiny faint">总资产</div>
                  <div className="money" style={{ fontSize: 24, fontWeight: 800 }}>
                    {ledger.settings.hideAmounts ? '••••' : formatMoney(totalOf(detail.snapshot, ledger))}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tiny faint">较上月</div>
                  <div
                    className="money"
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: (detail.metrics.delta ?? 0) >= 0 ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {detail.metrics.delta === null
                      ? '—'
                      : ledger.settings.hideAmounts
                        ? '••••'
                        : formatSignedMoney(detail.metrics.delta)}
                  </div>
                </div>
              </div>
              {detail.metrics.netSpend !== null && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '0.5px solid var(--separator)',
                  }}
                >
                  <span className="small muted">本月净开销</span>
                  <span className="money small" style={{ fontWeight: 700 }}>
                    {ledger.settings.hideAmounts ? '••••' : formatMoney(detail.metrics.netSpend)}
                  </span>
                </div>
              )}
              {detail.snapshot?.note && (
                <div className="small muted" style={{ marginTop: 10 }}>
                  {detail.snapshot.note}
                </div>
              )}
            </div>

            {displayCategories(ledger, true).map((item) => {
              const accounts = detail.rows.filter((row) => row.account.category === item.key)
              if (accounts.length === 0) return null
              return (
                <div key={item.key} style={{ marginTop: 16 }}>
                  <div className="section-title" style={{ margin: '0 2px 6px' }}>
                    {item.label}
                    <span className="tiny faint money">
                      {ledger.settings.hideAmounts ? '••••' : formatMoney(accounts.reduce((sum, row) => sum + row.current, 0))}
                    </span>
                  </div>
                  <div className="list">
                    {accounts.map((row) => (
                      <div key={row.account.id} className="list-row">
                        <CategoryIcon category={item.key} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{row.account.name}</div>
                          {row.account.tags.length > 0 && (
                            <div className="tiny faint">{row.account.tags.join(' · ')}</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="money" style={{ fontSize: 14, fontWeight: 700 }}>
                            {ledger.settings.hideAmounts ? '••••' : formatMoney(row.current)}
                          </div>
                          {row.delta !== 0 && (
                            <div
                              className="tiny money"
                              style={{ color: row.delta >= 0 ? 'var(--green)' : 'var(--red)' }}
                            >
                              {formatSignedMoney(row.delta)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {detail.rows.length === 0 && (
              <div className="small faint" style={{ textAlign: 'center', padding: 20 }}>
                这个月没有账户余额
              </div>
            )}
          </>
        )}
      </Sheet>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        background: active ? color ?? 'var(--accent)' : 'var(--fill-2)',
        color: active ? '#fff' : 'var(--text-2)',
        transition: 'background .15s ease',
      }}
    >
      {children}
    </button>
  )
}
