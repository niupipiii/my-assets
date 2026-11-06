import { z } from 'zod'
import { CATEGORY_KEYS } from './categories'
import type { LedgerV2 } from './types'
import { roundMoney } from './money'

export const LEDGER_KEY = 'myassets:v2:ledger'
export const OCR_TOKEN_KEY = 'myassets:v2:ocr-token'
export const BACKUP_PREFIX = 'myassets:v2:backup:'
export const LEGACY_COPY_KEY = 'myassets:v2:legacy-copy'
export const CORRUPT_PREFIX = 'myassets:v2:corrupt:'

const CategorySchema = z.enum(CATEGORY_KEYS as [string, ...string[]])

const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: CategorySchema,
  institution: z.string().optional(),
  tags: z.array(z.string()).default([]),
  note: z.string().optional(),
  archived: z.boolean().default(false),
  order: z.number().default(0),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
})

const SnapshotSchema = z.object({
  id: z.string().min(1),
  year: z.number().int().min(1990).max(2100),
  month: z.number().int().min(1).max(12),
  balances: z.record(z.string(), z.number()),
  note: z.string().optional(),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
})

const FlowSchema = z.object({
  salary: z.number().optional(),
  otherIncome: z.number().optional(),
  otherOutflow: z.number().optional(),
  investTransfer: z.number().optional(),
  note: z.string().optional(),
})

const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  hideAmounts: z.boolean().default(false),
  defaultSalary: z.number().nullable().default(null),
  investmentCategories: z.array(CategorySchema).default(['stock', 'fund', 'bond', 'crypto']),
  lastTab: z.string().default('overview'),
  remindEntry: z.boolean().default(true),
})

export const LedgerSchema = z.object({
  schemaVersion: z.literal(2),
  accounts: z.array(AccountSchema),
  snapshots: z.array(SnapshotSchema),
  flows: z.record(z.string(), FlowSchema).default({}),
  settings: SettingsSchema,
  meta: z
    .object({
      migratedFrom: z.literal('asset-records@1').optional(),
      migratedAt: z.number().optional(),
      lastBackupAt: z.number().optional(),
    })
    .default({}),
})

export class ImportError extends Error {}

export interface ParsedImport {
  ledger: LedgerV2
  warnings: string[]
}

function normalizeKey(key: string): string {
  const match = /^(\d{4})-(\d{1,2})$/.exec(key.trim())
  if (!match) return key
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`
}

export function normalizeLedger(input: LedgerV2): { ledger: LedgerV2; warnings: string[] } {
  const warnings: string[] = []
  const seenAccounts = new Set<string>()
  const accounts = input.accounts.filter((account) => {
    if (seenAccounts.has(account.id)) {
      warnings.push(`账户 ${account.name} 的 id 重复，已忽略后一条`)
      return false
    }
    seenAccounts.add(account.id)
    return true
  })

  const byMonth = new Map<string, (typeof input.snapshots)[number]>()
  for (const snapshot of input.snapshots) {
    const key = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`
    const existing = byMonth.get(key)
    if (!existing || snapshot.updatedAt >= existing.updatedAt) {
      if (existing) warnings.push(`${key} 有重复快照，已保留较新的一条`)
      byMonth.set(key, snapshot)
    }
  }

  const snapshots = [...byMonth.values()]
    .map((snapshot) => {
      const balances: Record<string, number> = {}
      for (const [accountId, value] of Object.entries(snapshot.balances)) {
        if (!seenAccounts.has(accountId)) continue
        if (!Number.isFinite(value)) continue
        balances[accountId] = roundMoney(value)
      }
      return { ...snapshot, balances }
    })
    .sort((a, b) => a.year - b.year || a.month - b.month)

  const flows: LedgerV2['flows'] = {}
  for (const [key, flow] of Object.entries(input.flows ?? {})) {
    const normalizedKey = normalizeKey(key)
    const cleaned: LedgerV2['flows'][string] = {}
    for (const field of ['salary', 'otherIncome', 'otherOutflow', 'investTransfer'] as const) {
      const value = flow[field]
      if (typeof value === 'number' && Number.isFinite(value)) cleaned[field] = roundMoney(value)
    }
    if (typeof flow.note === 'string' && flow.note.trim() !== '') cleaned.note = flow.note
    flows[normalizedKey] = cleaned
  }

  const investmentCategories = input.settings.investmentCategories.filter((category, index, list) =>
    CATEGORY_KEYS.includes(category) && list.indexOf(category) === index,
  )

  return {
    ledger: {
      ...input,
      accounts,
      snapshots,
      flows,
      settings: {
        ...input.settings,
        defaultSalary:
          input.settings.defaultSalary === null || input.settings.defaultSalary === undefined
            ? null
            : roundMoney(input.settings.defaultSalary),
        investmentCategories:
          investmentCategories.length > 0 ? investmentCategories : ['stock', 'fund', 'bond', 'crypto'],
      },
    },
    warnings,
  }
}

export function parseLedgerJson(text: string): ParsedImport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('文件不是合法 JSON')
  }
  const candidate =
    raw && typeof raw === 'object' && 'ledger' in raw
      ? (raw as { ledger: unknown }).ledger
      : raw
  const result = LedgerSchema.safeParse(candidate)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new ImportError(
      `数据格式不兼容${first ? `：${first.path.join('.')} ${first.message}` : ''}`,
    )
  }
  return normalizeLedger(result.data as LedgerV2)
}
