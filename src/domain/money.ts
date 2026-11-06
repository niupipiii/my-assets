export function toCents(yuan: number): number {
  return Math.round((Number.isFinite(yuan) ? yuan : 0) * 100)
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

export function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function safeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[,，\s¥￥元]/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const grouped = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const grouped2 = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** ¥1,234.56 / ¥1,234（整数不显示小数）；负数写成 -¥1,234 */
export function formatMoney(yuan: number): string {
  const cents = toCents(yuan)
  const hasCents = Math.abs(cents) % 100 !== 0
  const text = hasCents ? grouped2.format(Math.abs(cents) / 100) : grouped.format(Math.abs(cents) / 100)
  return `${cents < 0 ? '-' : ''}¥${text}`
}

/** 不带符号的纯数字，用于输入框旁的展示 */
export function formatNumber(yuan: number): string {
  const cents = toCents(yuan)
  const hasCents = Math.abs(cents) % 100 !== 0
  return hasCents ? grouped2.format(cents / 100) : grouped.format(cents / 100)
}

/** 紧凑金额：1.2万 / 3.50亿 / 3,500 */
export function formatCompact(yuan: number): string {
  const abs = Math.abs(yuan)
  if (abs >= 1e8) return `${(yuan / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(yuan / 1e4).toFixed(abs >= 1e6 ? 0 : 1)}万`
  return grouped.format(yuan)
}

export function formatSignedMoney(yuan: number): string {
  if (Math.abs(toCents(yuan)) === 0) return '¥0'
  return `${yuan > 0 ? '+' : '-'}${formatMoney(Math.abs(yuan))}`
}

export function formatPercent(ratio: number | null, digits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

export function formatSignedPercent(ratio: number | null, digits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  const value = (ratio * 100).toFixed(digits)
  return `${ratio > 0 ? '+' : ''}${value}%`
}

/** 隐藏金额模式 */
export function maskMoney(hidden: boolean, text: string): string {
  return hidden ? '••••••' : text
}

const FULLWIDTH_DIGITS = '０１２３４５６７８９'
const FULLWIDTH_DOTS = '．。'
const FULLWIDTH_MINUS = '－'

/**
 * 解析用户输入的金额：支持 ¥、千分位、全角数字、万/亿、括号负数。
 * 解析失败返回 NaN。
 */
export function parseAmount(raw: string): number {
  if (typeof raw !== 'string') return NaN
  let text = raw.trim()
  if (text === '') return NaN

  text = text
    .replace(/[０-９]/g, (ch) => String(FULLWIDTH_DIGITS.indexOf(ch)))
    .replace(/[．。]/g, '.')
    .replace(/[－−]/g, '-')
    .replace(/[¥￥,，\s元]/g, '')
    .replace(/^\((.*)\)$/, '-$1')

  let multiplier = 1
  if (text.endsWith('亿')) {
    multiplier = 1e8
    text = text.slice(0, -1)
  } else if (text.endsWith('万')) {
    multiplier = 1e4
    text = text.slice(0, -1)
  }

  if (!/^-?\d*(\.\d*)?$/.test(text) || text === '' || text === '-' || text === '.') {
    return NaN
  }
  const value = Number(text)
  return Number.isFinite(value) ? round2(value * multiplier) : NaN
}

export function clampAmount(value: number): number {
  return Math.max(-1e12, Math.min(1e12, value))
}
