import { buildDemoLedger } from '../domain/demo'
import type { LegacyCandidate, LedgerV2 } from '../domain/types'
import { readPreviewConfig } from '../lib/preview'
import {
  emptyLedger,
  latestBackup,
  readLedger,
  readLegacy,
  saveCorruptRaw,
} from './storage'

export interface BootState {
  ledger: LedgerV2
  demo: boolean
  legacyCandidate: LegacyCandidate | null
  legacyRaw: { recordsRaw: string; configRaw: string | null } | null
  legacyError: string | null
  corruptError: string | null
  restoredBackupKey: string | null
  shouldOfferMigration: boolean
}

export function bootState(now = new Date()): BootState {
  const preview = readPreviewConfig()
  if (preview.demo) {
    return {
      ledger: buildDemoLedger({ now }),
      demo: true,
      legacyCandidate: null,
      legacyRaw: null,
      legacyError: null,
      corruptError: null,
      restoredBackupKey: null,
      shouldOfferMigration: false,
    }
  }

  const read = readLedger()
  let ledger = read.ledger
  let corruptError: string | null = null
  let restoredBackupKey: string | null = null

  if (read.error) {
    corruptError = read.error
    if (read.corruptRaw) saveCorruptRaw(read.corruptRaw)
    const backup = latestBackup()
    if (backup) {
      ledger = backup.ledger
      restoredBackupKey = backup.key
      corruptError = `${read.error}，已自动恢复最近备份`
    }
  }

  const legacy = readLegacy()
  const shouldOfferMigration =
    legacy.parsed !== null &&
    (!ledger || (ledger.snapshots.length === 0 && !ledger.meta.migratedAt))

  return {
    ledger: ledger ?? emptyLedger(now.getTime()),
    demo: false,
    legacyCandidate: legacy.parsed?.candidate ?? null,
    legacyRaw: legacy.raw,
    legacyError: legacy.error,
    corruptError,
    restoredBackupKey,
    shouldOfferMigration,
  }
}
