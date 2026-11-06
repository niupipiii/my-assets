export function toCents(yuan: number): number {
  return Math.round((Number.isFinite(yuan) ? yuan : 0) * 100)
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

export function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

/** 金额统一取整：正负都按"四舍五入远离 0"，避免 -1234.5 变成 -1234。 */
export function roundMoney(value: number): number {
  const number = Number.isFinite(value) ? value : 0
  return number < 0 ? -Math.round(-number) : Math.round(number)
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

/** 统一显示为整数；负数写成 -¥1,234 */
export function formatMoney(yuan: number): string {
  const rounded = roundMoney(yuan)
  return `${rounded < 0 ? '-' : ''}¥${grouped.format(Math.abs(rounded))}`
}

/** 不带符号的纯数字，用于输入框旁的展示 */
export function formatNumber(yuan: number): string {
  return grouped.format(roundMoney(yuan))
}

/** 紧凑金额：1万 / 3亿 / 3,500；不出现小数点 */
export function formatCompact(yuan: number): string {
  const rounded = roundMoney(yuan)
  const abs = Math.abs(rounded)
  if (abs >= 1e8) return `${Math.round(rounded / 1e8)}亿`
  if (abs >= 1e4) return `${Math.round(rounded / 1e4)}万`
  return grouped.format(rounded)
}

export function formatSignedMoney(yuan: number): string {
  if (Math.abs(toCents(yuan)) === 0) return '¥0'
  return `${yuan > 0 ? '+' : '-'}${formatMoney(Math.abs(yuan))}`
}

export function formatPercent(ratio: number | null, digits = 0): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  const fixed = (ratio * 100).toFixed(digits)
  return `${Number(fixed) === 0 ? '0' : fixed}%`
}

export function formatSignedPercent(ratio: number | null, digits = 0): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—'
  const fixed = (ratio * 100).toFixed(digits)
  if (Number(fixed) === 0) return '0%'
  return `${ratio > 0 ? '+' : ''}${fixed}%`
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
