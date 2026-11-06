import { CATEGORIES, DEFAULT_INVESTMENT_CATEGORIES, isCategoryKey } from './categories'
import { monthKey, snapshotKey } from './selectors'
import { roundMoney, safeNumber } from './money'
import type {
  Account,
  CategoryKey,
  LedgerV2,
  LegacyCandidate,
  Snapshot,
} from './types'

export const LEGACY_RECORDS_KEY = 'asset-records'
export const LEGACY_CONFIG_KEY = 'asset-config'

interface LegacyRecord {
  year?: unknown
  month?: unknown
  ts?: unknown
  assets?: unknown
}

export class LegacyParseError extends Error {}

function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function legacyAccountId(category: CategoryKey, name: string): string {
  return `acc_${hashString(`${category}|${name.trim()}`)}`
}

export function inferInstitution(name: string, category: CategoryKey): string | undefined {
  const text = name.trim()
  const banks: Array<[RegExp, string]> = [
    [/招商/, '招商银行'],
    [/工商/, '工商银行'],
    [/建设/, '建设银行'],
    [/中国银行/, '中国银行'],
    [/农业/, '农业银行'],
    [/交通银行/, '交通银行'],
    [/浦发/, '浦发银行'],
    [/中信/, '中信银行'],
    [/平安/, '平安银行'],
    [/民生/, '民生银行'],
    [/兴业/, '兴业银行'],
    [/光大/, '光大银行'],
    [/华夏/, '华夏银行'],
    [/广发/, '广发银行'],
    [/北京银行/, '北京银行'],
    [/上海银行/, '上海银行'],
  ]
  for (const [pattern, bank] of banks) {
    if (pattern.test(text)) return bank
  }
  if (/微信/.test(text)) return '微信'
  if (/支付宝|余额宝/.test(text)) return '支付宝'
  if (category === 'crypto') return '数字货币'
  if (category === 'property') return '房产'
  if (category === 'insurance') return '保险'
  return undefined
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim()
}

/** 旧版 ts 是 Date.now() 毫秒；缺失或异常时回退到当月 1 号。 */
function validTimestamp(value: unknown, fallback: number): number {
  const stamp = Number(value)
  return Number.isFinite(stamp) && stamp > 1e11 ? stamp : fallback
}

function normalizeRecord(raw: unknown, index: number): LegacyRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as LegacyRecord
  const year = Number(record.year)
  const month = Number(record.month)
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!record.assets || typeof record.assets !== 'object') return null
  return { ...record, year, month, assets: record.assets }
}

function collectConfigNames(config: unknown): Partial<Record<CategoryKey, string[]>> {
  if (!config || typeof config !== 'object') return {}
  const subAccounts = (config as { subAccounts?: unknown }).subAccounts
  if (!subAccounts || typeof subAccounts !== 'object') return {}
  const result: Partial<Record<CategoryKey, string[]>> = {}
  for (const [key, value] of Object.entries(subAccounts as Record<string, unknown>)) {
    if (!isCategoryKey(key) || !Array.isArray(value)) continue
    result[key] = value
      .map((item) => normalizeName(item))
      .filter((item, index, list) => item !== '' && list.indexOf(item) === index)
  }
  return result
}

export interface ParsedLegacy {
  ledger: LedgerV2
  candidate: LegacyCandidate
}

export function parseLegacy(
  recordsRaw: string,
  configRaw: string | null,
  now = Date.now(),
): ParsedLegacy {
  let parsedRecords: unknown
  try {
    parsedRecords = JSON.parse(recordsRaw)
  } catch {
    throw new LegacyParseError('旧版记录不是合法 JSON')
  }
  if (!Array.isArray(parsedRecords)) {
    throw new LegacyParseError('旧版记录格式不正确（期望数组）')
  }

  const warnings: string[] = []
  const records: LegacyRecord[] = []
  parsedRecords.forEach((raw, index) => {
    const record = normalizeRecord(raw, index)
    if (!record) {
      warnings.push(`跳过第 ${index + 1} 条无法识别的旧记录`)
      return
    }
    records.push(record)
  })

  let config: unknown = null
  if (configRaw) {
    try {
      config = JSON.parse(configRaw)
    } catch {
      warnings.push('旧版账户配置不是合法 JSON，已仅从记录中反推账户')
    }
  }

  // 按月份去重，保留 ts 较新的记录
  const byMonth = new Map<string, LegacyRecord>()
  for (const record of records) {
    const key = monthKey(Number(record.year), Number(record.month))
    const existing = byMonth.get(key)
    const stamp = Number(record.ts) || 0
    const existingStamp = existing ? Number(existing.ts) || 0 : -1
    if (!existing || stamp >= existingStamp) {
      if (existing) warnings.push(`${key} 存在重复记录，已保留较新的一条`)
      byMonth.set(key, record)
    }
  }

  const configNames = collectConfigNames(config)
  const nameMap = new Map<string, { category: CategoryKey; name: string }>()

  const addName = (category: CategoryKey, name: string) => {
    const clean = normalizeName(name)
    if (!clean) return
    const id = `${category}|${clean}`
    if (!nameMap.has(id)) nameMap.set(id, { category, name: clean })
  }

  for (const category of CATEGORIES) {
    for (const name of configNames[category.key] ?? []) addName(category.key, name)
  }

  for (const record of byMonth.values()) {
    const assets = record.assets as Record<string, unknown>
    for (const [categoryKey, subs] of Object.entries(assets)) {
      if (!isCategoryKey(categoryKey)) {
        warnings.push(`旧数据中有未知分类「${categoryKey}」，已忽略`)
        continue
      }
      if (!subs || typeof subs !== 'object') continue
      for (const name of Object.keys(subs as Record<string, unknown>)) {
        addName(categoryKey, name)
      }
    }
  }

  const categoryOrder = new Map(CATEGORIES.map((c, index) => [c.key, index]))
  const sortedNames = [...nameMap.values()].sort((a, b) => {
    const orderA = categoryOrder.get(a.category) ?? 99
    const orderB = categoryOrder.get(b.category) ?? 99
    return orderA - orderB || a.name.localeCompare(b.name, 'zh-CN')
  })

  const firstTs = [...byMonth.values()].reduce((min, record) => {
    const fallback = Date.UTC(Number(record.year), Number(record.month) - 1, 1)
    const ts = validTimestamp(record.ts, fallback)
    return min === 0 ? ts : Math.min(min, ts)
  }, 0)

  const accounts: Account[] = sortedNames.map((item, index) => ({
    id: legacyAccountId(item.category, item.name),
    name: item.name,
    category: item.category,
    institution: inferInstitution(item.name, item.category),
    tags: [],
    archived: false,
    order: index,
    createdAt: firstTs || now,
    updatedAt: now,
  }))

  const accountIndex = new Map(accounts.map((account) => [`${account.category}|${account.name}`, account]))

  const snapshots: Snapshot[] = []
  for (const record of [...byMonth.values()].sort(
    (a, b) => Number(a.year) - Number(b.year) || Number(a.month) - Number(b.month),
  )) {
    const year = Number(record.year)
    const month = Number(record.month)
    const key = monthKey(year, month)
    const assets = record.assets as Record<string, unknown>
    const balances: Record<string, number> = {}
    for (const [categoryKey, subs] of Object.entries(assets)) {
      if (!isCategoryKey(categoryKey) || !subs || typeof subs !== 'object') continue
      for (const [rawName, rawValue] of Object.entries(subs as Record<string, unknown>)) {
        const name = normalizeName(rawName)
        const account = accountIndex.get(`${categoryKey}|${name}`)
        if (!account) continue
        const value = safeNumber(rawValue)
        balances[account.id] = roundMoney(value)
      }
    }
    const created = validTimestamp(record.ts, Date.UTC(year, month - 1, 1))
    snapshots.push({
      id: `snap_${key}`,
      year,
      month,
      balances,
      createdAt: created,
      updatedAt: created,
    })
  }

  const ledger: LedgerV2 = {
    schemaVersion: 2,
    accounts,
    snapshots,
    flows: {},
    settings: {
      theme: 'system',
      hideAmounts: false,
      defaultSalary: null,
      investmentCategories: [...DEFAULT_INVESTMENT_CATEGORIES],
      lastTab: 'overview',
      remindEntry: true,
    },
    meta: {
      migratedFrom: 'asset-records@1',
      migratedAt: now,
    },
  }

  const latest = snapshots[snapshots.length - 1]
  const latestTotal = latest
    ? Object.entries(latest.balances).reduce((sum, [accountId, value]) => {
        const account = accounts.find((a) => a.id === accountId)
        return account ? sum + roundMoney(value) : sum
      }, 0)
    : 0

  const candidate: LegacyCandidate = {
    recordsRaw,
    configRaw,
    months: snapshots.length,
    accounts: accounts.length,
    latestTotal,
    latestKey: latest ? snapshotKey(latest) : null,
    warnings,
  }

  return { ledger, candidate }
}

/** 只做摘要，不构建完整 ledger；用于迁移前提示。 */
export function summarizeLegacy(recordsRaw: string, configRaw: string | null, now = Date.now()): LegacyCandidate {
  return parseLegacy(recordsRaw, configRaw, now).candidate
}

export function hasLegacyData(storage: Storage): boolean {
  try {
    return storage.getItem(LEGACY_RECORDS_KEY) !== null
  } catch {
    return false
  }
}
