import { CATEGORIES } from './categories'
import type { Account, CategoryKey } from './types'

export interface DefaultAccountSeed {
  name: string
  category: CategoryKey
  institution?: string
  tags?: string[]
}

/** 用户期望的默认账户结构：现金 4、储蓄 2、理财 3、基金 1、股票 1。 */
export const DEFAULT_ACCOUNTS: DefaultAccountSeed[] = [
  { name: '微信零钱', category: 'cash', institution: '微信', tags: ['流动资金'] },
  { name: '农行现金', category: 'cash', institution: '中国农业银行', tags: ['流动资金'] },
  { name: '中行现金', category: 'cash', institution: '中国银行', tags: ['流动资金'] },
  { name: '招行现金', category: 'cash', institution: '招商银行', tags: ['流动资金'] },
  { name: '余额宝', category: 'savings', institution: '支付宝', tags: ['流动资金'] },
  { name: '招行储蓄', category: 'savings', institution: '招商银行', tags: ['流动资金'] },
  { name: '农行理财', category: 'bond', institution: '中国农业银行', tags: ['投资'] },
  { name: '招行理财', category: 'bond', institution: '招商银行', tags: ['投资'] },
  { name: '中行理财', category: 'bond', institution: '中国银行', tags: ['投资'] },
  { name: '基金', category: 'fund', tags: ['投资'] },
  { name: '股票', category: 'stock', tags: ['投资'] },
]

export function defaultAccountId(index: number): string {
  return `def_${index}`
}

export function createDefaultAccounts(now = Date.now()): Account[] {
  return DEFAULT_ACCOUNTS.map((seed, index) => ({
    id: defaultAccountId(index),
    name: seed.name,
    category: seed.category,
    institution: seed.institution,
    tags: seed.tags ?? [],
    archived: false,
    order: index,
    createdAt: now,
    updatedAt: now,
  }))
}

export function defaultAccountNames(): Set<string> {
  return new Set(DEFAULT_ACCOUNTS.map((account) => account.name))
}

/** 旧版/导入数据里可能的账户整理建议：余额宝归储蓄。 */
export function normalizedCategoryForName(name: string, category: CategoryKey): CategoryKey {
  if (category === 'cash' && /余额宝/.test(name)) return 'savings'
  return category
}

export function primaryCategories() {
  return CATEGORIES.filter((category) => category.primary)
}
