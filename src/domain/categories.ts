import type { CategoryKey } from './types'

export interface CategoryDef {
  key: CategoryKey
  label: string
  short: string
  color: string
  /** lucide 图标名，在 components/CategoryIcon 中映射 */
  icon: string
  defaults: string[]
  /** 默认计入投资收益估算 */
  investment: boolean
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'cash',
    label: '现金 / 存款',
    short: '现金',
    color: '#2DD4BF',
    icon: 'wallet',
    defaults: ['余额宝', '微信零钱', '支付宝', '招商银行'],
    investment: false,
  },
  {
    key: 'stock',
    label: '股票',
    short: '股票',
    color: '#818CF8',
    icon: 'trending-up',
    defaults: ['A股', '港股', '美股'],
    investment: true,
  },
  {
    key: 'fund',
    label: '基金',
    short: '基金',
    color: '#6366F1',
    icon: 'pie-chart',
    defaults: ['指数基金', '主动基金'],
    investment: true,
  },
  {
    key: 'bond',
    label: '债券 / 理财',
    short: '理财',
    color: '#FB923C',
    icon: 'landmark',
    defaults: ['银行理财', '国债'],
    investment: true,
  },
  {
    key: 'property',
    label: '房产',
    short: '房产',
    color: '#F472B6',
    icon: 'home',
    defaults: ['自住房产'],
    investment: false,
  },
  {
    key: 'insurance',
    label: '保险',
    short: '保险',
    color: '#A78BFA',
    icon: 'shield',
    defaults: ['年金险', '增额寿'],
    investment: false,
  },
  {
    key: 'crypto',
    label: '数字货币',
    short: '数字货币',
    color: '#FBBF24',
    icon: 'bitcoin',
    defaults: ['BTC', 'ETH'],
    investment: true,
  },
  {
    key: 'other',
    label: '其他',
    short: '其他',
    color: '#94A3B8',
    icon: 'package',
    defaults: ['其他'],
    investment: false,
  },
]

export const CATEGORY_MAP: Record<CategoryKey, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryDef>

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)

export const DEFAULT_INVESTMENT_CATEGORIES: CategoryKey[] = CATEGORIES.filter(
  (c) => c.investment,
).map((c) => c.key)

export const MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
]

export function categoryOf(key: string): CategoryDef {
  return CATEGORY_MAP[key as CategoryKey] ?? CATEGORY_MAP.other
}

export function isCategoryKey(value: unknown): value is CategoryKey {
  return typeof value === 'string' && value in CATEGORY_MAP
}
