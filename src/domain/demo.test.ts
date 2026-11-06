import { describe, expect, it } from 'vitest'
import { buildDemoLedger } from './demo'
import { latestSnapshot, monthMetrics } from './selectors'

describe('demo ledger', () => {
  it('creates a coherent 12 month demo', () => {
    const ledger = buildDemoLedger({ now: new Date('2026-11-06T12:00:00+08:00') })
    expect(ledger.snapshots).toHaveLength(12)
    expect(ledger.accounts.length).toBeGreaterThan(10)
    const latest = latestSnapshot(ledger)
    expect(latest).toBeTruthy()
    const metrics = monthMetrics(ledger, '2026-11')
    expect(metrics.netSpend).not.toBeNull()
    expect(metrics.netSpend! > 0).toBe(true)
    expect(metrics.salary).toBeGreaterThan(0)
  })
})
