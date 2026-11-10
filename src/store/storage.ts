import { ALLOCATION_CATEGORY_KEYS, DEFAULT_INVESTMENT_CATEGORIES } from '../domain/categories'
import { createDefaultAccounts } from '../domain/defaults'
import { parseLegacy, LEGACY_CONFIG_KEY, LEGACY_RECORDS_KEY, type ParsedLegacy } from '../domain/migration'
import { parseLedgerJson } from '../domain/validation'
import { latestSnapshot, snapshotKey, totalOf } from '../domain/selectors'
import type { LedgerV2 } from '../domain/types'

export const LEDGER_KEY = 'myassets:v2:ledger'
export const OCR_TOKEN_KEY = 'myassets:v2:ocr-token'
export const BACKUP_PREFIX = 'myassets:v2:backup:'
export const LEGACY_COPY_KEY = 'myassets:v2:legacy-copy'
export const CORRUPT_PREFIX = 'myassets:v2:corrupt:'

export type BackupReason = 'auto' | 'manual' | 'before-migration' | 'before-import' | 'before-restore'

export interface BackupMeta {
  key: string
  at: number
  reason: BackupReason
  months: number
  accounts: number
  total: number
}

export function getStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage
    if (!storage) return null
    const probe = '__asset_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

function readRaw(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    getStorage()?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeRaw(key: string): boolean {
  try {
    getStorage()?.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function emptyLedger(now = Date.now()): LedgerV2 {
  return {
    schemaVersion: 2,
    accounts: createDefaultAccounts(now),
    snapshots: [],
    flows: {},
    settings: {
      theme: 'system',
      hideAmounts: false,
      defaultSalary: null,
      investmentCategories: [...DEFAULT_INVESTMENT_CATEGORIES],
      allocationCategories: [...ALLOCATION_CATEGORY_KEYS],
      lastTab: 'overview',
      remindEntry: true,
    },
    meta: {},
  }
}

export interface ReadResult {
  ledger: LedgerV2 | null
  corruptRaw: string | null
  error: string | null
}

export function readLedger(): ReadResult {
  const raw = readRaw(LEDGER_KEY)
  if (!raw) return { ledger: null, corruptRaw: null, error: null }
  try {
    const parsed = parseLedgerJson(raw)
    return { ledger: parsed.ledger, corruptRaw: null, error: null }
  } catch (error) {
    return {
      ledger: null,
      corruptRaw: raw,
      error: error instanceof Error ? error.message : '本地数据无法解析',
    }
  }
}

export function writeLedger(ledger: LedgerV2): boolean {
  return writeRaw(LEDGER_KEY, JSON.stringify(ledger))
}

export function saveCorruptRaw(raw: string): string | null {
  const key = `${CORRUPT_PREFIX}${Date.now()}`
  return writeRaw(key, raw) ? key : null
}

export interface LegacyRaw {
  recordsRaw: string
  configRaw: string | null
}

export function detectLegacyRaw(): LegacyRaw | null {
  const recordsRaw = readRaw(LEGACY_RECORDS_KEY)
  if (recordsRaw === null || recordsRaw.trim() === '') return null
  return { recordsRaw, configRaw: readRaw(LEGACY_CONFIG_KEY) }
}

export interface BootLegacy {
  parsed: ParsedLegacy | null
  error: string | null
  raw: LegacyRaw | null
}

export function readLegacy(): BootLegacy {
  const raw = detectLegacyRaw()
  if (!raw) return { parsed: null, error: null, raw: null }
  try {
    return { parsed: parseLegacy(raw.recordsRaw, raw.configRaw), error: null, raw }
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error.message : '旧版数据解析失败',
      raw,
    }
  }
}

export function saveLegacyCopy(raw: LegacyRaw): boolean {
  return writeRaw(
    LEGACY_COPY_KEY,
    JSON.stringify({ savedAt: Date.now(), records: raw.recordsRaw, config: raw.configRaw }),
  )
}

export function readLegacyCopy(): { savedAt: number; records: string; config: string | null } | null {
  const raw = readRaw(LEGACY_COPY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as { savedAt: number; records: string; config: string | null }
  } catch {
    return null
  }
}

export function backupLedger(ledger: LedgerV2, reason: BackupReason): string | null {
  const at = Date.now()
  const key = `${BACKUP_PREFIX}${at}_${Math.random().toString(36).slice(2, 6)}`
  const ok = writeRaw(key, JSON.stringify({ at, reason, ledger }))
  if (!ok) return null
  pruneBackups(8)
  return key
}

export function latestBackup(): { key: string; ledger: LedgerV2; at: number; reason: BackupReason } | null {
  const metas = listBackups()
  for (const meta of metas) {
    const loaded = loadBackup(meta.key)
    if (loaded) return { key: meta.key, ...loaded }
  }
  return null
}

export function listBackups(): BackupMeta[] {
  const storage = getStorage()
  if (!storage) return []
  const metas: BackupMeta[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key || !key.startsWith(BACKUP_PREFIX)) continue
    const raw = storage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as { at?: number; reason?: BackupReason; ledger?: LedgerV2 }
      if (!parsed.ledger) continue
      const latest = latestSnapshot(parsed.ledger)
      metas.push({
        key,
        at: Number(parsed.at) || 0,
        reason: parsed.reason ?? 'auto',
        months: parsed.ledger.snapshots.length,
        accounts: parsed.ledger.accounts.length,
        total: latest ? totalOf(latest, parsed.ledger) : 0,
      })
    } catch {
      // ignore damaged backup entry
    }
  }
  return metas.sort((a, b) => b.at - a.at)
}

export function loadBackup(key: string): { ledger: LedgerV2; at: number; reason: BackupReason } | null {
  const raw = readRaw(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { at?: number; reason?: BackupReason; ledger?: LedgerV2 }
    if (!parsed.ledger) return null
    const result = parseLedgerJson(JSON.stringify(parsed.ledger))
    return { ledger: result.ledger, at: Number(parsed.at) || 0, reason: parsed.reason ?? 'auto' }
  } catch {
    return null
  }
}

export function deleteBackup(key: string): boolean {
  return removeRaw(key)
}

function pruneBackups(max: number): void {
  const metas = listBackups()
  for (const meta of metas.slice(max)) removeRaw(meta.key)
}

function localDateKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** 每天最多一份自动快照；返回是否新建。 */
export function maybeDailyBackup(ledger: LedgerV2): boolean {
  const today = localDateKey(Date.now())
  const hasToday = listBackups().some(
    (meta) => meta.reason === 'auto' && localDateKey(meta.at) === today,
  )
  if (hasToday) return false
  return backupLedger(ledger, 'auto') !== null
}

export function getOcrToken(): string {
  return readRaw(OCR_TOKEN_KEY) ?? ''
}

export function setOcrToken(token: string): boolean {
  if (token.trim() === '') return removeRaw(OCR_TOKEN_KEY)
  return writeRaw(OCR_TOKEN_KEY, token.trim())
}

export function clearAllAppData(): void {
  const storage = getStorage()
  if (!storage) return
  const keys: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key && key.startsWith('myassets:')) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}

export function legacySummaryLine(ledger: LedgerV2): string {
  const latest = latestSnapshot(ledger)
  return latest ? `${snapshotKey(latest)} · ${ledger.snapshots.length} 个月` : '无快照'
}
