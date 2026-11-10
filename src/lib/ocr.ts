import { categoryOf } from '../domain/categories'
import { parseAmount } from '../domain/money'
import type { Account, CategoryKey } from '../domain/types'

export interface OcrBalance {
  label: string
  section?: string
  isTotal?: boolean
  amount: number
  currency: string
  confidence: number
  evidence?: string
}

export interface OcrResult {
  institution: string
  kind: 'bank' | 'wechat' | 'alipay' | 'other'
  asOf: string
  balances: OcrBalance[]
}

export class OcrError extends Error {
  code: string

  constructor(message: string, code = 'ocr_error') {
    super(message)
    this.code = code
  }
}

export async function recognizeImage(image: string, token: string, signal?: AbortSignal): Promise<OcrResult> {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ocr-token': token,
    },
    body: JSON.stringify({ image, locale: 'zh-CN' }),
    signal,
  })
  let payload: {
    ok?: boolean
    data?: OcrResult
    error?: { code?: string; message?: string }
  } = {}
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    throw new OcrError('识别服务返回了无法解析的内容', 'bad_response')
  }
  if (!response.ok || !payload.ok || !payload.data) {
    throw new OcrError(payload.error?.message ?? '识别失败，请稍后重试', payload.error?.code ?? 'failed')
  }
  return payload.data
}

export async function pingOcr(token: string): Promise<{ configured: boolean; model: string | null }> {
  const response = await fetch('/api/ocr?ping=1', {
    headers: { 'x-ocr-token': token },
    cache: 'no-store',
  })
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    configured?: boolean
    model?: string | null
    error?: { message?: string }
  }
  if (!response.ok || !payload.ok) {
    throw new OcrError(payload.error?.message ?? '接口不可用', 'ping_failed')
  }
  return { configured: Boolean(payload.configured), model: payload.model ?? null }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取'))
    image.src = url
  })
}

/** 压缩到最长边 2048、JPEG 0.85；返回值可直接作为 img src 和上传体。 */
export async function compressImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const longest = Math.max(image.naturalWidth, image.naturalHeight)
    const maxSide = 2048
    const scale = longest > maxSide ? maxSide / longest : 1
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器不支持图片处理')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    let dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    if (dataUrl.length > 2_800_000) {
      const smaller = document.createElement('canvas')
      const nextScale = Math.min(1, 1600 / Math.max(width, height))
      smaller.width = Math.max(1, Math.round(width * nextScale))
      smaller.height = Math.max(1, Math.round(height * nextScale))
      const ctx = smaller.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, smaller.width, smaller.height)
        ctx.drawImage(image, 0, 0, smaller.width, smaller.height)
        dataUrl = smaller.toDataURL('image/jpeg', 0.78)
      }
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function normalize(text: string): string {
  return text.replace(/[\s\-_·]/g, '').toLowerCase()
}

export function categoryFromText(text: string): CategoryKey {
  if (/活期|现金|零钱|存款|尾号/.test(text)) return 'cash'
  if (/储蓄|余额宝/.test(text)) return 'savings'
  if (/理财|定期/.test(text)) return 'bond'
  if (/基金/.test(text)) return 'fund'
  if (/股票|证券/.test(text)) return 'stock'
  return 'other'
}

export function institutionShort(institution: string): string | undefined {
  const text = normalize(institution)
  if (!text) return undefined
  if (/农业银行|农行/.test(text)) return '农行'
  if (/招商银行|招行/.test(text)) return '招行'
  if (/中国银行|中行/.test(text)) return '中行'
  if (/建设银行|建行/.test(text)) return '建行'
  if (/工商银行|工行/.test(text)) return '工行'
  if (/交通银行|交行/.test(text)) return '交行'
  if (/微信/.test(text)) return '微信'
  if (/支付宝/.test(text)) return '支付宝'
  return undefined
}

export interface AccountSuggestion {
  category: CategoryKey
  name: string
  institution?: string
}

/** 根据机构 + 一级分类给出默认账户名，例如 农行 + 现金 → 农行现金。 */
export function suggestAccount(
  balance: OcrBalance,
  result: Pick<OcrResult, 'kind' | 'institution'>,
  accounts: Account[],
): AccountSuggestion | undefined {
  const text = `${result.institution} ${balance.section ?? ''} ${balance.label}`
  const category = categoryFromText(text)
  const short = institutionShort(result.institution)
  const label = balance.label.trim()

  if (/微信|零钱/.test(text) && category === 'cash') {
    return { category: 'cash', name: '微信零钱', institution: '微信' }
  }
  if (/余额宝/.test(text)) {
    return { category: 'savings', name: '余额宝', institution: '支付宝' }
  }
  if (short) {
    if (category === 'cash') {
      return { category, name: `${short}现金`, institution: result.institution }
    }
    if (category === 'savings') {
      return { category, name: `${short}储蓄`, institution: result.institution }
    }
    if (category === 'bond') {
      return { category, name: `${short}理财`, institution: result.institution }
    }
  }
  if (category === 'fund') return { category, name: '基金', institution: result.institution }
  if (category === 'stock') return { category, name: '股票', institution: result.institution }
  if (category === 'cash' && label) return { category, name: label, institution: result.institution }
  if (category === 'savings' && label) return { category, name: label, institution: result.institution }
  if (category === 'bond' && label) return { category, name: label, institution: result.institution }

  const exact = accounts.find((account) => !account.archived && normalize(account.name) === normalize(label))
  if (exact) return { category: exact.category, name: exact.name, institution: exact.institution }
  return label ? { category, name: label, institution: result.institution } : undefined
}

/** 根据机构/关键词把识别结果匹配到已有账户，返回账户 id。 */
export function matchAccount(
  balance: OcrBalance,
  result: Pick<OcrResult, 'kind' | 'institution'>,
  accounts: Account[],
): string | undefined {
  const candidates = accounts.filter((account) => !account.archived)
  const suggestion = suggestAccount(balance, result, candidates)
  if (!suggestion) return undefined

  const exact = candidates.find((account) => normalize(account.name) === normalize(suggestion.name))
  if (exact) return exact.id

  const contains = candidates.find((account) => {
    const name = normalize(account.name)
    const target = normalize(suggestion.name)
    return name.includes(target) || target.includes(name)
  })
  if (contains) return contains.id

  const short = institutionShort(result.institution)
  const sameCategory = candidates.filter((account) => account.category === suggestion.category)
  if (short) {
    const byInstitution = sameCategory.find((account) => {
      const institution = normalize(account.institution ?? '')
      return institution.includes(short) || (account.name.includes(short) && account.category === suggestion.category)
    })
    if (byInstitution) return byInstitution.id
  }
  if (sameCategory.length === 1) return sameCategory[0].id

  const label = normalize(balance.label)
  if (label) {
    const byLabel = candidates.find(
      (account) =>
        normalize(account.name).includes(label) || label.includes(normalize(account.name)),
    )
    if (byLabel) return byLabel.id
  }
  return undefined
}

export interface TextCandidate {
  label: string
  amount: number
  confidence: number
}

const AMOUNT_PATTERN = /[¥￥]?\s*\d[\d,，]*(?:\.\d{1,2})?\s*(?:万|亿|元)?/g
const KEYWORDS = /余额|可用|总资产|总额|零钱|理财|存款|市值|资产|账户|待收/

/** 没配置云端识别时的兜底：从 iOS 实况文本粘贴的文字里抽取金额候选。 */
export function parseTextAmounts(text: string): TextCandidate[] {
  const lines = text.split(/\n+/)
  const candidates: TextCandidate[] = []
  const seen = new Set<string>()

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '' || line.length > 120) continue
    if (/收益|涨跌|涨幅|收益率|时间|日期|尾号|卡号|手机号|验证码|积分|优惠|额度/.test(line)) continue
    const matches = line.match(AMOUNT_PATTERN) ?? []
    for (const token of matches) {
      const cleaned = token.replace(/[¥￥\s元]/g, '')
      if (cleaned === '') continue
      if (/^\d{4}$/.test(cleaned) && Number(cleaned) >= 1990 && Number(cleaned) <= 2100) continue
      if (/^\d{5,}$/.test(cleaned)) continue
      const amount = parseAmount(token)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e10) continue
      const key = `${line}|${amount}`
      if (seen.has(key)) continue
      seen.add(key)
      const hasKeyword = KEYWORDS.test(line)
      const hasDecimals = /\.\d{1,2}/.test(token)
      candidates.push({
        label: line.length > 44 ? `${line.slice(0, 42)}…` : line,
        amount,
        confidence: hasKeyword ? 0.72 : hasDecimals ? 0.45 : 0.3,
      })
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 12)
}

export function accountOptions(accounts: Account[]): Array<{ group: string; accounts: Account[] }> {
  const groups = new Map<CategoryKey, Account[]>()
  for (const account of accounts) {
    if (account.archived) continue
    const list = groups.get(account.category) ?? []
    list.push(account)
    groups.set(account.category, list)
  }
  return [...groups.entries()].map(([category, list]) => ({
    group: categoryOf(category).label,
    accounts: list,
  }))
}

export function accountName(accounts: Account[], id: string | undefined | null): string {
  if (!id) return '未匹配'
  return accounts.find((account) => account.id === id)?.name ?? '未匹配'
}

export function isCategory(value: string): value is CategoryKey {
  return categoryOf(value).key === value
}

export function accountByIdIn(accounts: Account[], id: string): Account | undefined {
  return accounts.find((account) => account.id === id)
}
