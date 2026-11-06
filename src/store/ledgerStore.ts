import { getSnapshot, monthKey, splitMonthKey } from '../domain/selectors'
import { roundMoney } from '../domain/money'
import type { Account, LedgerSettings, LedgerV2, MonthFlow, Snapshot } from '../domain/types'
import { maybeDailyBackup, writeLedger } from './storage'

export interface LedgerStoreOptions {
  persist: boolean
  onPersistError?: (message: string) => void
}

export interface LedgerActions {
  replaceLedger: (ledger: LedgerV2, options?: { backup?: boolean }) => void
  saveSnapshot: (input: {
    year: number
    month: number
    balances: Record<string, number>
    note?: string
  }) => void
  deleteSnapshot: (key: string) => void
  saveFlow: (key: string, flow: MonthFlow) => void
  addAccount: (input: {
    name: string
    category: Account['category']
    institution?: string
    tags?: string[]
    note?: string
  }) => string | null
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => void
  archiveAccount: (id: string, archived: boolean) => void
  deleteAccount: (id: string) => boolean
  moveAccount: (id: string, direction: -1 | 1) => void
  updateSettings: (patch: Partial<LedgerSettings>) => void
  importLedger: (ledger: LedgerV2, mode: 'replace' | 'merge') => void
}

export interface LedgerStore {
  getState: () => LedgerV2
  subscribe: (listener: () => void) => () => void
  actions: LedgerActions
  persist: boolean
}

function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && 'randomUUID' in cryptoApi) return `${prefix}_${cryptoApi.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeBalances(
  ledger: LedgerV2,
  balances: Record<string, number>,
): Record<string, number> {
  const known = new Set(ledger.accounts.map((account) => account.id))
  const result: Record<string, number> = {}
  for (const [accountId, value] of Object.entries(balances)) {
    if (!known.has(accountId)) continue
    if (!Number.isFinite(value)) continue
    result[accountId] = roundMoney(value)
  }
  return result
}

function cleanFlow(flow: MonthFlow): MonthFlow {
  const result: MonthFlow = {}
  for (const field of ['salary', 'otherIncome', 'otherOutflow', 'investTransfer'] as const) {
    const value = flow[field]
    if (typeof value === 'number' && Number.isFinite(value)) result[field] = roundMoney(value)
  }
  if (typeof flow.note === 'string' && flow.note.trim() !== '') result.note = flow.note.trim()
  return result
}

function sortSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.year - b.year || a.month - b.month)
}

function mergeLedgers(base: LedgerV2, incoming: LedgerV2): LedgerV2 {
  const accounts = new Map(base.accounts.map((account) => [account.id, account]))
  for (const account of incoming.accounts) {
    const existing = accounts.get(account.id)
    accounts.set(account.id, existing ? { ...existing, ...account, updatedAt: Date.now() } : account)
  }
  const snapshots = new Map(
    base.snapshots.map((snapshot) => [monthKey(snapshot.year, snapshot.month), snapshot]),
  )
  for (const snapshot of incoming.snapshots) {
    const key = monthKey(snapshot.year, snapshot.month)
    const existing = snapshots.get(key)
    if (!existing || snapshot.updatedAt >= existing.updatedAt) snapshots.set(key, snapshot)
  }
  const flows = { ...base.flows }
  for (const [key, flow] of Object.entries(incoming.flows)) {
    flows[key] = { ...(flows[key] ?? {}), ...flow }
  }
  return {
    ...base,
    accounts: [...accounts.values()],
    snapshots: sortSnapshots([...snapshots.values()]),
    flows,
    settings: { ...base.settings, ...incoming.settings },
    meta: { ...base.meta, ...incoming.meta },
  }
}

export function createLedgerStore(initial: LedgerV2, options: LedgerStoreOptions): LedgerStore {
  let state = initial
  const listeners = new Set<() => void>()
  let persistTimer: number | undefined
  let lastWriteFailed = false

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const persist = () => {
    if (!options.persist) return
    const ok = writeLedger(state)
    if (!ok && !lastWriteFailed) {
      lastWriteFailed = true
      options.onPersistError?.('本地存储写入失败，可能是空间不足或浏览器限制')
    }
    if (ok) lastWriteFailed = false
  }

  const schedulePersist = () => {
    if (!options.persist) return
    if (persistTimer !== undefined) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      persistTimer = undefined
      persist()
      maybeDailyBackup(state)
    }, 250)
  }

  const commit = (updater: (current: LedgerV2) => LedgerV2) => {
    state = updater(state)
    emit()
    schedulePersist()
  }

  const actions: LedgerActions = {
    replaceLedger: (ledger, config = {}) => {
      commit(() => ledger)
      if (config.backup !== false && options.persist) {
        // 由调用方在替换前负责备份；这里只保证持久化
        persist()
      }
    },

    saveSnapshot: ({ year, month, balances, note }) => {
      const now = Date.now()
      commit((current) => {
        const clean = sanitizeBalances(current, balances)
        const existing = getSnapshot(current, monthKey(year, month))
        const snapshot: Snapshot = {
          id: existing?.id ?? createId('snap'),
          year,
          month,
          balances: clean,
          note: note?.trim() || existing?.note,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        const snapshots = current.snapshots.filter(
          (item) => !(item.year === year && item.month === month),
        )
        return { ...current, snapshots: sortSnapshots([...snapshots, snapshot]) }
      })
    },

    deleteSnapshot: (key) => {
      const { year, month } = splitMonthKey(key)
      commit((current) => ({
        ...current,
        snapshots: current.snapshots.filter((item) => !(item.year === year && item.month === month)),
        flows: Object.fromEntries(Object.entries(current.flows).filter(([flowKey]) => flowKey !== key)),
      }))
    },

    saveFlow: (key, flow) => {
      commit((current) => {
        const cleaned = cleanFlow(flow)
        const flows = { ...current.flows }
        if (Object.keys(cleaned).length === 0) delete flows[key]
        else flows[key] = cleaned
        return { ...current, flows }
      })
    },

    addAccount: ({ name, category, institution, tags, note }) => {
      const clean = name.trim()
      if (!clean) return null
      const now = Date.now()
      const duplicate = state.accounts.some(
        (account) => account.category === category && account.name.trim() === clean,
      )
      if (duplicate) return null
      const id = createId('acc')
      const maxOrder = state.accounts.reduce((max, account) => Math.max(max, account.order), 0)
      const account: Account = {
        id,
        name: clean,
        category,
        institution: institution?.trim() || undefined,
        tags: (tags ?? []).map((tag) => tag.trim()).filter(Boolean),
        note: note?.trim() || undefined,
        archived: false,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      }
      commit((current) => ({ ...current, accounts: [...current.accounts, account] }))
      return id
    },

    updateAccount: (id, patch) => {
      commit((current) => ({
        ...current,
        accounts: current.accounts.map((account) =>
          account.id === id ? { ...account, ...patch, updatedAt: Date.now() } : account,
        ),
      }))
    },

    archiveAccount: (id, archived) => {
      commit((current) => ({
        ...current,
        accounts: current.accounts.map((account) =>
          account.id === id ? { ...account, archived, updatedAt: Date.now() } : account,
        ),
      }))
    },

    deleteAccount: (id) => {
      const hasBalance = state.snapshots.some((snapshot) => {
        const value = snapshot.balances[id]
        return typeof value === 'number' && value !== 0
      })
      if (hasBalance) return false
      commit((current) => ({
        ...current,
        accounts: current.accounts.filter((account) => account.id !== id),
        snapshots: current.snapshots.map((snapshot) => {
          if (!(id in snapshot.balances)) return snapshot
          const balances = { ...snapshot.balances }
          delete balances[id]
          return { ...snapshot, balances }
        }),
      }))
      return true
    },

    moveAccount: (id, direction) => {
      commit((current) => {
        const target = current.accounts.find((account) => account.id === id)
        if (!target) return current
        const siblings = current.accounts
          .filter((account) => account.category === target.category)
          .sort((a, b) => a.order - b.order)
        const index = siblings.findIndex((account) => account.id === id)
        const swapIndex = index + direction
        if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return current
        const other = siblings[swapIndex]
        if (!other) return current
        const targetOrder = target.order
        const otherOrder = other.order
        return {
          ...current,
          accounts: current.accounts.map((account) => {
            if (account.id === target.id) return { ...account, order: otherOrder }
            if (account.id === other.id) return { ...account, order: targetOrder }
            return account
          }),
        }
      })
    },

    updateSettings: (patch) => {
      commit((current) => {
        const settings = { ...current.settings, ...patch }
        if (typeof settings.defaultSalary === 'number') {
          settings.defaultSalary = roundMoney(settings.defaultSalary)
        }
        return { ...current, settings }
      })
    },

    importLedger: (ledger, mode) => {
      commit((current) => (mode === 'replace' ? ledger : mergeLedgers(current, ledger)))
    },
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
    persist: options.persist,
  }
}
