import { describe, expect, it } from 'vitest'
import { formatCompact, formatMoney, formatPercent, formatSignedMoney, parseAmount, round2, toCents } from './money'

describe('money', () => {
  it('parses common formats', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('¥1,234.56')).toBe(1234.56)
    expect(parseAmount('￥ 1,234')).toBe(1234)
    expect(parseAmount('1.2万')).toBe(12000)
    expect(parseAmount('0.5亿')).toBe(50000000)
    expect(parseAmount('(1,000)')).toBe(-1000)
    expect(parseAmount('１２３４．５６')).toBe(1234.56)
    expect(Number.isNaN(parseAmount('abc'))).toBe(true)
    expect(Number.isNaN(parseAmount(''))).toBe(true)
  })

  it('rounds to cents', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('formats', () => {
    expect(formatMoney(1234.5)).toBe('¥1,235')
    expect(formatMoney(1234)).toBe('¥1,234')
    expect(formatMoney(-1234.5)).toBe('-¥1,235')
    expect(formatSignedMoney(1234)).toBe('+¥1,234')
    expect(formatSignedMoney(-1234)).toBe('-¥1,234')
    expect(formatSignedMoney(0)).toBe('¥0')
    expect(formatCompact(150000)).toBe('15万')
    expect(formatPercent(0.007)).toBe('1%')
    expect(formatPercent(0.5)).toBe('50%')
  })
})
