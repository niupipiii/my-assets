import { ALLOCATION_CATEGORY_KEYS, CATEGORIES, DEFAULT_INVESTMENT_CATEGORIES } from './categories'
import { createDefaultAccounts } from './defaults'
import { roundMoney } from './money'
import { monthKey, shiftMonth } from './selectors'
import type { LedgerV2, MonthFlow, Snapshot } from './types'

const START: Record<string, number> = {
  微信零钱: 20000,
  农行现金: 8000,
  中行现金: 15000,
  招行现金: 100000,
  余额宝: 25000,
  招行储蓄: 80000,
  农行理财: 42000,
  招行理财: 60000,
  中行理财: 30000,
  基金: 150000,
  股票: 250000,
}

const GROWTH: Record<string, number> = {
  农行理财: 0.003,
  招行理财: 0.0026,
  中行理财: 0.0034,
  基金: 0.006,
  股票: 0.008,
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoOptions {
  now?: Date
  months?: number
}

/**
 * 演示数据：使用用户期望的默认账户结构，只有现金/储蓄/理财/基金/股票 5 类。
 * 工资、消费、投资收益按公式自洽，方便在预览里检查净开销和配置图。
 */
export function buildDemoLedger(options: DemoOptions = {}): LedgerV2 {
  const now = options.now ?? new Date()
  const months = options.months ?? 12
  const endKey = monthKey(now.getFullYear(), now.getMonth() + 1)
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) keys.push(shiftMonth(endKey, -i))

  const random = mulberry32(20261106)
  const accounts = createDefaultAccounts(now.getTime())
  const byName = new Map(accounts.map((account) => [account.name, account]))
  const values = new Map<string, number>()
  for (const account of accounts) {
    values.set(account.id, roundMoney(START[account.name] ?? 0))
  }

  const cashAccounts = accounts.filter((account) => account.category === 'cash')
  const savingsAccounts = accounts.filter((account) => account.category === 'savings')
  const investAccounts = accounts.filter((account) =>
    DEFAULT_INVESTMENT_CATEGORIES.includes(account.category),
  )
  const startCash = cashAccounts.reduce((sum, account) => sum + (values.get(account.id) ?? 0), 0)
  const cashShares = cashAccounts.map(
    (account) => (values.get(account.id) ?? 0) / (startCash || 1),
  )
  let cashTotal = startCash

  const flows: Record<string, MonthFlow> = {}
  const snapshots: Snapshot[] = []

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    const salary = index === 5 || index === 11 ? 30000 : 25000
    const spending = 8000 + Math.round(random() * 9000)
    const transfer = index === 2 || index === 7 ? 5000 : 0

    if (index > 0) {
      for (const account of investAccounts) {
        const growth = GROWTH[account.name] ?? 0
        if (growth === 0) continue
        const current = values.get(account.id) ?? 0
        const noise = 0.65 + random() * 0.7
        values.set(account.id, roundMoney(current * (1 + growth * noise)))
      }
      for (const account of savingsAccounts) {
        const current = values.get(account.id) ?? 0
        values.set(account.id, roundMoney(current * (1 + 0.002 * (0.8 + random() * 0.4))))
      }
      cashTotal = roundMoney(cashTotal + salary - spending - transfer + cashTotal * 0.0003)
      if (cashTotal < 0) cashTotal = 0
      const noise = cashShares.map((share) => share * (0.97 + random() * 0.06))
      const noiseSum = noise.reduce((sum, value) => sum + value, 0)
      cashAccounts.forEach((account, accountIndex) => {
        const share = noise[accountIndex] / noiseSum
        values.set(account.id, roundMoney(cashTotal * share))
      })
    }

    if (transfer > 0) {
      const target = byName.get('股票')
      if (target) values.set(target.id, roundMoney((values.get(target.id) ?? 0) + transfer))
    }

    const balances: Record<string, number> = {}
    for (const account of accounts) {
      balances[account.id] = roundMoney(values.get(account.id) ?? 0)
    }

    snapshots.push({
      id: `demo_snap_${key}`,
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5, 7)),
      balances,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    })

    const flow: MonthFlow = { salary }
    if (transfer > 0) flow.investTransfer = transfer
    if (index === 11) flow.note = '双十一，消费略高'
    flows[key] = flow
  }

  return {
    schemaVersion: 2,
    accounts,
    snapshots,
    flows,
    settings: {
      theme: 'system',
      hideAmounts: false,
      defaultSalary: 25000,
      investmentCategories: [...DEFAULT_INVESTMENT_CATEGORIES],
      allocationCategories: [...ALLOCATION_CATEGORY_KEYS],
      lastTab: 'overview',
      remindEntry: true,
    },
    meta: {},
  }
}

export function demoCategoryCoverage(): string[] {
  return CATEGORIES.map((category) => category.key)
}
