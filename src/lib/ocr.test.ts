import { describe, expect, it } from 'vitest'
import { matchAccount, parseTextAmounts, suggestAccount } from './ocr'
import type { Account } from '../domain/types'

const accounts: Account[] = [
  { id: 'wechat', name: '微信零钱', category: 'cash', institution: '微信', tags: [], archived: false, order: 0, createdAt: 0, updatedAt: 0 },
  { id: 'alipay', name: '支付宝', category: 'cash', institution: '支付宝', tags: [], archived: false, order: 1, createdAt: 0, updatedAt: 0 },
  { id: 'cmb', name: '招商银行', category: 'cash', institution: '招商银行', tags: [], archived: false, order: 2, createdAt: 0, updatedAt: 0 },
  { id: 'abc-cash', name: '农行现金', category: 'cash', institution: '中国农业银行', tags: [], archived: false, order: 3, createdAt: 0, updatedAt: 0 },
  { id: 'abc-bond', name: '农行理财', category: 'bond', institution: '中国农业银行', tags: [], archived: false, order: 4, createdAt: 0, updatedAt: 0 },
]

describe('parseTextAmounts', () => {
  it('extracts balance candidates and ignores noise', () => {
    const candidates = parseTextAmounts(
      ['零钱 ¥12,345.67', '余额 8,000.00', '2026年11月6日', '收益率 3.2%', '手机号 13800138000', '可用余额 1.2万'].join('\n'),
    )
    const amounts = candidates.map((candidate) => candidate.amount)
    expect(amounts).toContain(12345.67)
    expect(amounts).toContain(8000)
    expect(amounts).toContain(12000)
    expect(amounts).not.toContain(3.2)
    expect(amounts).not.toContain(2026)
  })
})

describe('matchAccount', () => {
  it('matches by institution', () => {
    const id = matchAccount(
      { label: '零钱', amount: 100, currency: 'CNY', confidence: 0.9 },
      { kind: 'wechat', institution: '微信' },
      accounts,
    )
    expect(id).toBe('wechat')
  })

  it('matches by label', () => {
    const id = matchAccount(
      { label: '招商银行', amount: 100, currency: 'CNY', confidence: 0.9 },
      { kind: 'bank', institution: '招商银行' },
      accounts,
    )
    expect(id).toBe('cmb')
  })

  it('maps a bank category total to 农行现金 / 农行理财', () => {
    const cash = matchAccount(
      { label: '活期', section: '现金', isTotal: true, amount: 8855, currency: 'CNY', confidence: 0.95 },
      { kind: 'bank', institution: '中国农业银行' },
      accounts,
    )
    const bond = matchAccount(
      { label: '理财', section: '理财', isTotal: true, amount: 42366, currency: 'CNY', confidence: 0.95 },
      { kind: 'bank', institution: '中国农业银行' },
      accounts,
    )
    expect(cash).toBe('abc-cash')
    expect(bond).toBe('abc-bond')
  })

  it('suggests default account names from institution + section', () => {
    const suggestion = suggestAccount(
      { label: '活期', section: '现金', isTotal: true, amount: 8855, currency: 'CNY', confidence: 0.95 },
      { kind: 'bank', institution: '中国农业银行' },
      accounts,
    )
    expect(suggestion).toMatchObject({ name: '农行现金', category: 'cash' })
  })
})
