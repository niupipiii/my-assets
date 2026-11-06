import { CATEGORIES, DEFAULT_INVESTMENT_CATEGORIES } from './categories'
import { monthKey, shiftMonth } from './selectors'
import { round2 } from './money'
import type { Account, LedgerV2, MonthFlow, Snapshot } from './types'

interface DemoAccountSeed {
  name: string
  category: Account['category']
  institution?: string
  start: number
  growth?: number
  share?: number
}

const DEMO_ACCOUNTS: DemoAccountSeed[] = [
  { name: '招商银行', category: 'cash', institution: '招商银行', start: 100000, share: 0.58 },
  { name: '微信零钱', category: 'cash', institution: '微信', start: 20000, share: 0.12 },
  { name: '支付宝', category: 'cash', institution: '支付宝', start: 15000, share: 0.1 },
  { name: '余额宝', category: 'cash', institution: '支付宝', start: 25000, share: 0.2 },
  { name: 'A股', category: 'stock', start: 120000, growth: 0.008 },
  { name: '港股', category: 'stock', start: 60000, growth: 0.006 },
  { name: '美股', category: 'stock', start: 40000, growth: 0.01 },
  { name: '指数基金', category: 'fund', start: 90000, growth: 0.005 },
  { name: '主动基金', category: 'fund', start: 60000, growth: 0.004 },
  { name: '银行理财', category: 'bond', start: 100000, growth: 0.003 },
  { name: '国债', category: 'bond', start: 50000, growth: 0.002 },
  { name: '自住房产', category: 'property', start: 1800000 },
  { name: '年金险', category: 'insurance', start: 200000, growth: 0.001 },
  { name: 'BTC', category: 'crypto', start: 50000, growth: 0.012 },
  { name: 'ETH', category: 'crypto', start: 30000, growth: 0.009 },
  { name: '应收款', category: 'other', start: 12000 },
]

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
 * 构造 12 个月的演示数据：工资、转入投资、投资收益率、消费都按公式自洽，
 * 这样预览里的"净开销"卡片和报表不会出现奇怪数字。
 */
export function buildDemoLedger(options: DemoOptions = {}): LedgerV2 {
  const now = options.now ?? new Date()
  const months = options.months ?? 12
  const endKey = monthKey(now.getFullYear(), now.getMonth() + 1)
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) keys.push(shiftMonth(endKey, -i))

  const random = mulberry32(20261106)
  const accounts: Account[] = DEMO_ACCOUNTS.map((seed, index) => ({
    id: `demo_${index}`,
    name: seed.name,
    category: seed.category,
    institution: seed.institution,
    tags: seed.category === 'cash' ? ['流动资金'] : seed.category === 'property' ? ['长期'] : [],
    archived: false,
    order: index,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  }))
  const byName = new Map(accounts.map((account) => [account.name, account]))

  const cashAccounts = accounts.filter((a) => a.category === 'cash')
  const cashShares = DEMO_ACCOUNTS.filter((s) => s.category === 'cash').map((s) => s.share ?? 0.25)
  const investAccounts = accounts.filter((a) =>
    DEFAULT_INVESTMENT_CATEGORIES.includes(a.category),
  )
  const otherAccounts = accounts.filter(
    (a) => a.category !== 'cash' && !DEFAULT_INVESTMENT_CATEGORIES.includes(a.category),
  )

  const values = new Map<string, number>()
  for (const seed of DEMO_ACCOUNTS) {
    const account = byName.get(seed.name)
    if (account) values.set(account.id, seed.start)
  }

  let cashTotal = cashAccounts.reduce((sum, a) => sum + (values.get(a.id) ?? 0), 0)

  const flows: Record<string, MonthFlow> = {}
  const snapshots: Snapshot[] = []

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    const salary = index === 5 || index === 11 ? 30000 : 25000
    const spending = 8000 + Math.round(random() * 9000)
    const transfer = index === 2 || index === 7 ? 5000 : 0

    if (index > 0) {
      // 投资类按月收益
      for (const seed of DEMO_ACCOUNTS) {
        if (!seed.growth) continue
        const account = byName.get(seed.name)
        if (!account) continue
        const current = values.get(account.id) ?? 0
        const noise = 1 + (random() - 0.5) * 0.012
        values.set(account.id, round2(current * (1 + (seed.growth ?? 0) * noise)))
      }
      // 现金：工资 − 消费 − 转入 + 少量利息
      cashTotal = cashTotal + salary - spending - transfer + cashTotal * 0.0004
      if (cashTotal < 0) cashTotal = 0
    }

    // 把现金总量分配到现金账户
    const cashNoise = cashShares.map((share) => share * (0.97 + random() * 0.06))
    const cashNoiseSum = cashNoise.reduce((sum, v) => sum + v, 0)
    cashAccounts.forEach((account, accountIndex) => {
      const share = cashNoise[accountIndex] / cashNoiseSum
      values.set(account.id, round2(cashTotal * share))
    })

    if (transfer > 0) {
      const target = byName.get('A股')
      if (target) values.set(target.id, round2((values.get(target.id) ?? 0) + transfer))
    }

    const balances: Record<string, number> = {}
    for (const account of accounts) {
      balances[account.id] = round2(values.get(account.id) ?? 0)
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
      lastTab: 'overview',
      remindEntry: true,
    },
    meta: {},
  }
}

export function demoCategoryCoverage(): string[] {
  return CATEGORIES.map((c) => c.key)
}
