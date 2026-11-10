import { describe, expect, it } from 'vitest'
import { monthMetrics } from './selectors'
import type { LedgerV2 } from './types'

function makeLedger(overrides: Partial<LedgerV2['settings']> = {}): LedgerV2 {
  return {
    schemaVersion: 2,
    accounts: [
      { id: 'cash', name: '现金', category: 'cash', tags: [], archived: false, order: 0, createdAt: 0, updatedAt: 0 },
      { id: 'stock', name: '股票', category: 'stock', tags: [], archived: false, order: 1, createdAt: 0, updatedAt: 0 },
    ],
    snapshots: [
      { id: 's10', year: 2026, month: 10, balances: { cash: 700000, stock: 300000 }, createdAt: 0, updatedAt: 0 },
      { id: 's11', year: 2026, month: 11, balances: { cash: 714700, stock: 303500 }, createdAt: 0, updatedAt: 1 },
    ],
    flows: { '2026-11': { salary: 20000 } },
    settings: {
      theme: 'system',
      hideAmounts: false,
      defaultSalary: null,
      investmentCategories: ['stock'],
      allocationCategories: ['cash', 'savings', 'bond', 'fund', 'stock'],
      lastTab: 'overview',
      remindEntry: true,
      ...overrides,
    },
    meta: {},
  }
}

describe('monthMetrics', () => {
  it('derives net spend from salary, returns and asset change', () => {
    const metrics = monthMetrics(makeLedger(), '2026-11')
    expect(metrics.delta).toBe(18200)
    expect(metrics.investDelta).toBe(3500)
    expect(metrics.investReturn).toBe(3500)
    expect(metrics.netSpend).toBe(5300)
    expect(metrics.savingsRate).toBeCloseTo((20000 - 5300) / 20000)
  })

  it('subtracts transfers into investments', () => {
    const ledger = makeLedger()
    ledger.flows['2026-11'] = { salary: 20000, investTransfer: 2000 }
    const metrics = monthMetrics(ledger, '2026-11')
    expect(metrics.investReturn).toBe(1500)
    expect(metrics.netSpend).toBe(3300)
  })

  it('supports a per-month salary override without touching other months', () => {
    const ledger = makeLedger({ defaultSalary: 20000 })
    ledger.flows['2026-11'] = { salary: 25000 }
    expect(monthMetrics(ledger, '2026-11').netSpend).toBe(10300)
    ledger.flows['2026-11'] = {}
    expect(monthMetrics(ledger, '2026-11').netSpend).toBe(5300)
  })

  it('returns null when the previous snapshot is missing', () => {
    const ledger = makeLedger()
    ledger.snapshots = ledger.snapshots.filter((snapshot) => snapshot.month === 11)
    const metrics = monthMetrics(ledger, '2026-11')
    expect(metrics.hasPrev).toBe(false)
    expect(metrics.netSpend).toBeNull()
  })

  it('returns null when salary is not configured', () => {
    const ledger = makeLedger()
    ledger.flows = {}
    const metrics = monthMetrics(ledger, '2026-11')
    expect(metrics.salary).toBeNull()
    expect(metrics.netSpend).toBeNull()
  })

  it('handles negative investment returns', () => {
    const ledger = makeLedger()
    ledger.snapshots[1].balances.stock = 298000
    const metrics = monthMetrics(ledger, '2026-11')
    expect(metrics.investReturn).toBe(-2000)
    expect(metrics.delta).toBe(12700)
    expect(metrics.netSpend).toBe(5300)
  })
})
