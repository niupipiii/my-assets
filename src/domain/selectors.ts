import { CATEGORIES, CATEGORY_MAP, MONTH_NAMES } from './categories'
import { formatMoney, formatPercent, formatSignedMoney, fromCents, round2, toCents } from './money'
import type {
  Account,
  CategoryKey,
  LedgerV2,
  MonthFlow,
  MonthMetrics,
  Snapshot,
} from './types'

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`
}

export function splitMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-')
  return { year: Number(y), month: Number(m) }
}

export function snapshotKey(snapshot: Pick<Snapshot, 'year' | 'month'>): string {
  return monthKey(snapshot.year, snapshot.month)
}

export function monthLabel(key: string, withYear = true): string {
  const { year, month } = splitMonthKey(key)
  return withYear ? `${year}年${MONTH_NAMES[month - 1] ?? `${month}月`}` : MONTH_NAMES[month - 1] ?? `${month}月`
}

export function shortMonthLabel(key: string): string {
  const { year, month } = splitMonthKey(key)
  return `${String(year).slice(2)}.${pad2(month)}`
}

export function currentMonthKey(now = new Date()): string {
  return monthKey(now.getFullYear(), now.getMonth() + 1)
}

export function shiftMonth(key: string, delta: number): string {
  const { year, month } = splitMonthKey(key)
  const index = year * 12 + (month - 1) + delta
  return monthKey(Math.floor(index / 12), (index % 12) + 1)
}

export function prevMonthKey(key: string): string {
  return shiftMonth(key, -1)
}

export function monthsBetween(startKey: string, endKey: string): number {
  const a = splitMonthKey(startKey)
  const b = splitMonthKey(endKey)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

export function getSnapshot(ledger: LedgerV2, key: string): Snapshot | undefined {
  const { year, month } = splitMonthKey(key)
  return ledger.snapshots.find((s) => s.year === year && s.month === month)
}

export function sortedSnapshots(ledger: LedgerV2): Snapshot[] {
  return [...ledger.snapshots].sort((a, b) => a.year - b.year || a.month - b.month)
}

export function latestSnapshot(ledger: LedgerV2): Snapshot | undefined {
  const sorted = sortedSnapshots(ledger)
  return sorted[sorted.length - 1]
}

export function latestSnapshotKey(ledger: LedgerV2): string | null {
  const latest = latestSnapshot(ledger)
  return latest ? snapshotKey(latest) : null
}

export function earliestSnapshot(ledger: LedgerV2): Snapshot | undefined {
  return sortedSnapshots(ledger)[0]
}

export function snapshotKeys(ledger: LedgerV2): string[] {
  return sortedSnapshots(ledger).map(snapshotKey)
}

export function activeAccounts(ledger: LedgerV2): Account[] {
  return ledger.accounts.filter((a) => !a.archived)
}

export function accountsOfCategory(ledger: LedgerV2, category: CategoryKey, includeArchived = false): Account[] {
  return ledger.accounts
    .filter((a) => a.category === category && (includeArchived || !a.archived))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
}

export function accountById(ledger: LedgerV2, id: string): Account | undefined {
  return ledger.accounts.find((a) => a.id === id)
}

export function balanceOf(snapshot: Snapshot | undefined, accountId: string): number {
  if (!snapshot) return 0
  const value = snapshot.balances[accountId]
  return Number.isFinite(value) ? value : 0
}

/** 所有账户余额之和（历史归档账户只要在快照中有余额也计入）。 */
export function totalOf(snapshot: Snapshot | undefined, ledger: LedgerV2): number {
  if (!snapshot) return 0
  const known = new Set(ledger.accounts.map((a) => a.id))
  let cents = 0
  for (const [accountId, value] of Object.entries(snapshot.balances)) {
    if (!known.has(accountId)) continue
    cents += toCents(Number(value) || 0)
  }
  return fromCents(cents)
}

export function totalCentsOf(snapshot: Snapshot | undefined, ledger: LedgerV2): number {
  if (!snapshot) return 0
  const known = new Set(ledger.accounts.map((a) => a.id))
  let cents = 0
  for (const [accountId, value] of Object.entries(snapshot.balances)) {
    if (!known.has(accountId)) continue
    cents += toCents(Number(value) || 0)
  }
  return cents
}

export function categoryTotalOf(
  snapshot: Snapshot | undefined,
  ledger: LedgerV2,
  category: CategoryKey,
): number {
  if (!snapshot) return 0
  const ids = new Set(ledger.accounts.filter((a) => a.category === category).map((a) => a.id))
  let cents = 0
  for (const [accountId, value] of Object.entries(snapshot.balances)) {
    if (!ids.has(accountId)) continue
    cents += toCents(Number(value) || 0)
  }
  return fromCents(cents)
}

export function categoryTotalsOf(
  snapshot: Snapshot | undefined,
  ledger: LedgerV2,
): Record<CategoryKey, number> {
  const result = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<CategoryKey, number>
  for (const category of CATEGORIES) {
    result[category.key] = categoryTotalOf(snapshot, ledger, category.key)
  }
  return result
}

export function investTotalOf(snapshot: Snapshot | undefined, ledger: LedgerV2): number {
  if (!snapshot) return 0
  const categories = new Set(ledger.settings.investmentCategories)
  const ids = new Set(
    ledger.accounts.filter((a) => categories.has(a.category)).map((a) => a.id),
  )
  let cents = 0
  for (const [accountId, value] of Object.entries(snapshot.balances)) {
    if (!ids.has(accountId)) continue
    cents += toCents(Number(value) || 0)
  }
  return fromCents(cents)
}

export function effectiveSalary(ledger: LedgerV2, key: string): number | null {
  const flow = ledger.flows[key]
  const override = flow?.salary
  if (typeof override === 'number' && Number.isFinite(override)) return round2(override)
  const def = ledger.settings.defaultSalary
  return typeof def === 'number' && Number.isFinite(def) ? round2(def) : null
}

export function flowOf(ledger: LedgerV2, key: string): MonthFlow {
  return ledger.flows[key] ?? {}
}

/**
 * 净开销推导：
 *   R = Δ投资类资产 − 净转入投资
 *   C = 工资 + 其他收入 + R − Δ总资产 − 其他流出
 */
export function monthMetrics(ledger: LedgerV2, key: string): MonthMetrics {
  const { year, month } = splitMonthKey(key)
  const snapshot = getSnapshot(ledger, key)
  const prevKey = prevMonthKey(key)
  const prevSnapshot = getSnapshot(ledger, prevKey)
  const flow = flowOf(ledger, key)

  const total = totalOf(snapshot, ledger)
  const prevTotal = prevSnapshot ? totalOf(prevSnapshot, ledger) : null
  const delta = prevTotal === null ? null : round2(fromCents(toCents(total) - toCents(prevTotal)))

  const investTotal = investTotalOf(snapshot, ledger)
  const prevInvestTotal = prevSnapshot ? investTotalOf(prevSnapshot, ledger) : null

  const transfer = round2(Number(flow.investTransfer) || 0)
  const otherIncome = round2(Number(flow.otherIncome) || 0)
  const otherOutflow = round2(Number(flow.otherOutflow) || 0)
  const salary = effectiveSalary(ledger, key)

  const warnings: string[] = []
  const hasCurrent = snapshot !== undefined
  const hasPrev = prevSnapshot !== undefined

  if (!hasCurrent) warnings.push('本月还没有余额快照')
  if (!hasPrev) warnings.push('缺少上月快照，无法推导净开销')
  if (salary === null) warnings.push('未设置本月工资')

  let investDelta: number | null = null
  let investReturn: number | null = null
  let netSpend: number | null = null
  let savingsRate: number | null = null

  if (prevInvestTotal !== null) {
    investDelta = round2(fromCents(toCents(investTotal) - toCents(prevInvestTotal)))
    investReturn = round2(fromCents(toCents(investDelta) - toCents(transfer)))
  }

  if (hasCurrent && hasPrev && salary !== null && investReturn !== null && delta !== null) {
    const cents =
      toCents(salary) +
      toCents(otherIncome) +
      toCents(investReturn) -
      toCents(delta) -
      toCents(otherOutflow)
    netSpend = fromCents(cents)
    savingsRate = salary > 0 ? (salary - netSpend) / salary : null
  }

  if (
    investDelta !== null &&
    investDelta !== 0 &&
    transfer === 0 &&
    hasCurrent &&
    hasPrev
  ) {
    warnings.push(
      `投资类资产本月变化 ${formatSignedMoney(investDelta)}；若有转入/转出投资，请在调整项填写，否则会算进净开销或收益。`,
    )
  }
  if (netSpend !== null && netSpend < 0) {
    warnings.push('资产增幅超过工资与投资收益，可能漏记其他收入，或有大额资产变动。')
  }

  return {
    key,
    year,
    month,
    total,
    prevTotal,
    delta,
    investTotal,
    prevInvestTotal,
    investDelta,
    transfer,
    investReturn,
    salary,
    otherIncome,
    otherOutflow,
    netSpend,
    savingsRate,
    hasCurrent,
    hasPrev,
    warnings,
  }
}

export interface AccountDelta {
  account: Account
  current: number
  previous: number
  delta: number
}

export function accountDeltas(ledger: LedgerV2, key: string): AccountDelta[] {
  const snapshot = getSnapshot(ledger, key)
  const prev = getSnapshot(ledger, prevMonthKey(key))
  return ledger.accounts
    .map((account) => {
      const current = balanceOf(snapshot, account.id)
      const previous = balanceOf(prev, account.id)
      return { account, current, previous, delta: round2(fromCents(toCents(current) - toCents(previous))) }
    })
    .filter((row) => row.current !== 0 || row.previous !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current)
}

export function topMovers(ledger: LedgerV2, key: string, limit = 5): AccountDelta[] {
  return accountDeltas(ledger, key)
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit)
}

export interface AllocationSlice {
  category: CategoryKey
  label: string
  color: string
  value: number
  share: number
}

export function allocationOf(ledger: LedgerV2, key: string): AllocationSlice[] {
  const snapshot = getSnapshot(ledger, key)
  const totals = categoryTotalsOf(snapshot, ledger)
  const totalCents = Object.values(totals).reduce((sum, v) => sum + toCents(v), 0)
  return CATEGORIES.map((category) => {
    const value = totals[category.key]
    return {
      category: category.key,
      label: category.label,
      color: category.color,
      value,
      share: totalCents > 0 ? toCents(value) / totalCents : 0,
    }
  }).filter((slice) => slice.value !== 0)
}

export interface MonthSeriesPoint {
  key: string
  total: number | null
  netSpend: number | null
  salary: number | null
  delta: number | null
}

/** 以 endKey 结尾的连续 count 个月；没有快照的月份 total 为 null。 */
export function monthSeries(ledger: LedgerV2, endKey: string, count: number): MonthSeriesPoint[] {
  const points: MonthSeriesPoint[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const key = shiftMonth(endKey, -i)
    const snapshot = getSnapshot(ledger, key)
    const prev = getSnapshot(ledger, prevMonthKey(key))
    const salary = effectiveSalary(ledger, key)
    const total = snapshot ? totalOf(snapshot, ledger) : null
    const prevTotal = prev ? totalOf(prev, ledger) : null
    const delta =
      total !== null && prevTotal !== null
        ? round2(fromCents(toCents(total) - toCents(prevTotal)))
        : null
    const metrics = snapshot && prev ? monthMetrics(ledger, key) : null
    points.push({
      key,
      total,
      netSpend: metrics?.netSpend ?? null,
      salary,
      delta,
    })
  }
  return points
}

/** 录入时使用：最近一次不晚于 key 的快照，优先取更早的月份作为带入值。 */
export function prefillSnapshot(
  ledger: LedgerV2,
  key: string,
  options: { before?: boolean } = {},
): { snapshot: Snapshot | undefined; sourceKey: string | null } {
  const sorted = sortedSnapshots(ledger)
  let candidate: Snapshot | undefined
  for (const snapshot of sorted) {
    const snapKey = snapshotKey(snapshot)
    const isBefore = snapKey < key
    const isSame = snapKey === key
    if (options.before === false ? isSame || isBefore : isBefore) {
      candidate = snapshot
    }
  }
  return { snapshot: candidate, sourceKey: candidate ? snapshotKey(candidate) : null }
}

export function formatDelta(value: number | null): string {
  if (value === null) return '—'
  return formatSignedMoney(value)
}

export function formatShare(share: number): string {
  return formatPercent(share, 1)
}

export function categoryLabel(category: CategoryKey): string {
  return CATEGORY_MAP[category].label
}

export function formatMoneyOrDash(value: number | null): string {
  return value === null ? '—' : formatMoney(value)
}
