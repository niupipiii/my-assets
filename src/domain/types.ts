export type CategoryKey =
  | 'cash'
  | 'stock'
  | 'fund'
  | 'bond'
  | 'property'
  | 'insurance'
  | 'crypto'
  | 'other'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Account {
  id: string
  name: string
  category: CategoryKey
  institution?: string
  tags: string[]
  note?: string
  archived: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export interface Snapshot {
  id: string
  year: number
  month: number
  /** accountId -> 元（CNY） */
  balances: Record<string, number>
  note?: string
  createdAt: number
  updatedAt: number
}

/** 每月现金流与工资设置，键为 `YYYY-MM`。 */
export interface MonthFlow {
  /** 本月工资覆盖值；缺省使用 settings.defaultSalary */
  salary?: number
  /** 非工资收入 */
  otherIncome?: number
  /** 非消费流出（借款、转出、赠与等） */
  otherOutflow?: number
  /** 本月净转入投资：正=从现金买入投资，负=卖出变现；缺省 0 */
  investTransfer?: number
  note?: string
}

export interface LedgerSettings {
  theme: ThemeMode
  hideAmounts: boolean
  /** 默认税后月薪；null 表示未设置 */
  defaultSalary: number | null
  /** 计入"投资收益"估算的资产类别 */
  investmentCategories: CategoryKey[]
  lastTab: string
  remindEntry: boolean
}

export interface LedgerMeta {
  migratedFrom?: 'asset-records@1'
  migratedAt?: number
  lastBackupAt?: number
}

export interface LedgerV2 {
  schemaVersion: 2
  accounts: Account[]
  snapshots: Snapshot[]
  flows: Record<string, MonthFlow>
  settings: LedgerSettings
  meta: LedgerMeta
}

export interface MonthMetrics {
  key: string
  year: number
  month: number
  total: number
  prevTotal: number | null
  delta: number | null
  investTotal: number
  prevInvestTotal: number | null
  investDelta: number | null
  transfer: number
  investReturn: number | null
  salary: number | null
  otherIncome: number
  otherOutflow: number
  netSpend: number | null
  savingsRate: number | null
  hasCurrent: boolean
  hasPrev: boolean
  warnings: string[]
}

export interface LegacyCandidate {
  recordsRaw: string
  configRaw: string | null
  months: number
  accounts: number
  latestTotal: number
  latestKey: string | null
  warnings: string[]
}
