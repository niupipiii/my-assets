import { describe, expect, it } from 'vitest'
import { buildCsv, serializeLedger } from './importExport'
import { parseLedgerJson } from './validation'
import type { LedgerV2 } from './types'

const ledger: LedgerV2 = {
  schemaVersion: 2,
  accounts: [
    { id: 'a', name: '招商银行', category: 'cash', institution: '招商银行', tags: ['流动'], archived: false, order: 0, createdAt: 0, updatedAt: 0 },
  ],
  snapshots: [
    { id: 's', year: 2026, month: 11, balances: { a: 1234.5 }, createdAt: 0, updatedAt: 0 },
  ],
  flows: { '2026-11': { salary: 20000 } },
  settings: {
    theme: 'system',
    hideAmounts: false,
    defaultSalary: 20000,
    investmentCategories: ['stock'],
    lastTab: 'overview',
    remindEntry: true,
  },
  meta: {},
}

describe('import/export', () => {
  it('round trips json', () => {
    const parsed = parseLedgerJson(serializeLedger(ledger))
    expect(parsed.ledger.accounts[0].name).toBe('招商银行')
    expect(parsed.ledger.snapshots[0].balances.a).toBe(1234.5)
    expect(parsed.ledger.flows['2026-11'].salary).toBe(20000)
  })

  it('exports csv rows', () => {
    const csv = buildCsv(ledger)
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('招商银行')
    expect(csv).toContain('1234.5')
  })

  it('rejects malformed import', () => {
    expect(() => parseLedgerJson('{}')).toThrow()
    expect(() => parseLedgerJson('not json')).toThrow()
  })
})
