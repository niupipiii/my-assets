import { describe, expect, it } from 'vitest'
import { parseLegacy, LegacyParseError, legacyAccountId } from './migration'

const records = [
  {
    year: 2026,
    month: 9,
    ts: 1000,
    assets: { cash: { 招商银行: 100000, 微信零钱: '20000.6' }, stock: { A股: 50000 } },
  },
  {
    year: 2026,
    month: 10,
    ts: 2000,
    assets: { cash: { 招商银行: 110000, 微信零钱: 21000 }, stock: { A股: 52000 } },
  },
  {
    year: 2026,
    month: 10,
    ts: 3000,
    assets: { cash: { 招商银行: 111000, 微信零钱: 22000 }, stock: { A股: 53000 } },
  },
  { year: 2026, month: 13, ts: 4000, assets: {} },
]

const config = {
  subAccounts: { cash: ['招商银行', '微信零钱', '余额宝'], stock: ['A股', '港股'] },
}

describe('legacy migration', () => {
  it('maps accounts, snapshots and totals', () => {
    const { ledger, candidate } = parseLegacy(JSON.stringify(records), JSON.stringify(config), 5000)
    expect(ledger.snapshots).toHaveLength(2)
    expect(ledger.accounts).toHaveLength(5)
    expect(candidate.months).toBe(2)
    expect(candidate.accounts).toBe(5)
    expect(candidate.latestKey).toBe('2026-10')
    expect(candidate.latestTotal).toBe(111000 + 22000 + 53000)
    expect(candidate.warnings.some((warning) => warning.includes('重复'))).toBe(true)
    expect(ledger.meta.migratedFrom).toBe('asset-records@1')
    expect(ledger.flows).toEqual({})
    expect(ledger.settings.defaultSalary).toBeNull()
    expect(ledger.accounts.find((account) => account.name === '余额宝')?.category).toBe('savings')
    const september = ledger.snapshots.find((snapshot) => snapshot.month === 9)
    const wechat = ledger.accounts.find((account) => account.name === '微信零钱')
    expect(september && wechat ? september.balances[wechat.id] : null).toBe(20001)
  })

  it('uses deterministic account ids', () => {
    const first = parseLegacy(JSON.stringify(records), JSON.stringify(config), 1)
    const second = parseLegacy(JSON.stringify(records), JSON.stringify(config), 2)
    const ids = (value: typeof first) => value.ledger.accounts.map((account) => account.id).sort()
    expect(ids(first)).toEqual(ids(second))
    expect(legacyAccountId('cash', '招商银行')).toMatch(/^acc_/)
  })

  it('keeps config-only accounts', () => {
    const { ledger } = parseLegacy(JSON.stringify(records), JSON.stringify(config), 1)
    expect(ledger.accounts.map((account) => account.name)).toContain('余额宝')
    expect(ledger.accounts.map((account) => account.name)).toContain('港股')
  })

  it('rejects malformed data', () => {
    expect(() => parseLegacy('not json', null)).toThrow(LegacyParseError)
    expect(() => parseLegacy('{}', null)).toThrow(LegacyParseError)
  })
})
