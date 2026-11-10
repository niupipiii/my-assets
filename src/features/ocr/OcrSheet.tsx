import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Plus, ScanLine, ShieldCheck, Trash2, Wand2 } from 'lucide-react'
import { CATEGORIES } from '../../domain/categories'
import { formatMoney, parseAmount, roundMoney } from '../../domain/money'
import type { Account, CategoryKey } from '../../domain/types'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'
import { useLedgerActions } from '../../store/LedgerProvider'
import { getOcrToken, setOcrToken } from '../../store/storage'
import {
  categoryFromText,
  compressImage,
  matchAccount,
  parseTextAmounts,
  recognizeImage,
  suggestAccount,
  type OcrResult,
} from '../../lib/ocr'

const MAX_IMAGES = 20
const GLOBAL_TOTAL = /总资产|总负债|资产总额|负债总额|资产合计|负债合计|汇总|总计/

interface Item {
  id: string
  source: string
  institution: string
  label: string
  section: string
  isTotal: boolean
  amount: string
  confidence: number
  evidence?: string
  accountId: string
  suggestedName: string
  suggestedCategory: CategoryKey | null
  suggestedInstitution?: string
  include: boolean
}

interface ImageState {
  id: string
  dataUrl: string
}

let itemSeq = 0
function nextId(): string {
  itemSeq += 1
  return `ocr_${Date.now()}_${itemSeq}`
}

function sectionRank(section: string): number {
  const order = ['现金', '储蓄', '理财', '基金', '股票', '其他']
  const index = order.indexOf(section)
  return index < 0 ? order.length : index
}

function mergeItems(raw: Item[]): Item[] {
  const usable = raw.filter((item) => !GLOBAL_TOTAL.test(item.label) && !GLOBAL_TOTAL.test(item.section))
  const base = usable.length > 0 ? usable : raw

  const byGroup = new Map<string, Item[]>()
  for (const item of base) {
    const group = `${item.institution}|${item.section}`
    const list = byGroup.get(group) ?? []
    list.push(item)
    byGroup.set(group, list)
  }
  const grouped = [...byGroup.values()].flatMap((list) => {
    const totals = list.filter((item) => item.isTotal)
    return totals.length > 0 ? totals : list
  })

  const unique = new Map<string, Item>()
  for (const item of grouped) {
    const key = item.suggestedName || `${item.section}|${item.label}|${item.institution}`
    const existing = unique.get(key)
    if (!existing) {
      unique.set(key, item)
      continue
    }
    if (item.isTotal && !existing.isTotal) {
      unique.set(key, item)
      continue
    }
    if (item.isTotal === existing.isTotal && item.confidence > existing.confidence) {
      unique.set(key, item)
    }
  }

  return [...unique.values()]
    .sort((a, b) => {
      const sectionDiff = sectionRank(a.section) - sectionRank(b.section)
      if (sectionDiff !== 0) return sectionDiff
      if (a.isTotal !== b.isTotal) return a.isTotal ? -1 : 1
      return a.label.localeCompare(b.label, 'zh-CN')
    })
    .slice(0, 40)
}

export function OcrSheet({
  open,
  accounts,
  onClose,
  onApply,
}: {
  open: boolean
  accounts: Account[]
  onClose: () => void
  onApply: (balances: Record<string, number>) => void
}) {
  const toast = useToast()
  const actions = useLedgerActions()
  const [token, setToken] = useState(getOcrToken())
  const [tokenDraft, setTokenDraft] = useState(token)
  const [mode, setMode] = useState<'image' | 'text'>('image')
  const [images, setImages] = useState<ImageState[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const stored = getOcrToken()
    setToken(stored)
    setTokenDraft(stored)
    setError(null)
  }, [open])

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts])
  const grouped = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        list: activeAccounts.filter((account) => account.category === category.key),
      })).filter((group) => group.list.length > 0),
    [activeAccounts],
  )

  const resetResults = () => {
    setItems([])
    setError(null)
  }

  const addImages = async (files: FileList | null) => {
    if (!files) return
    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      toast.show(`最多 ${MAX_IMAGES} 张截图`)
      return
    }
    resetResults()
    const selected = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (selected.length > room) toast.show(`最多 ${MAX_IMAGES} 张，已加入前 ${room} 张`)
    const next: ImageState[] = []
    for (const file of selected.slice(0, room)) {
      try {
        const dataUrl = await compressImage(file)
        next.push({ id: nextId(), dataUrl })
      } catch {
        toast.show(`${file.name} 读取失败`)
      }
    }
    if (next.length > 0) setImages((current) => [...current, ...next])
  }

  const itemsFromResult = (result: OcrResult, sourceLabel: string): Item[] => {
    return result.balances.map((balance) => {
      const suggestion = suggestAccount(balance, result, activeAccounts)
      const matched = matchAccount(balance, result, activeAccounts)
      return {
        id: nextId(),
        source: sourceLabel,
        institution: result.institution,
        label: balance.label || suggestion?.name || result.institution || '未命名账户',
        section: balance.section ?? '',
        isTotal: Boolean(balance.isTotal),
        amount: String(roundMoney(balance.amount)),
        confidence: balance.confidence,
        evidence: balance.evidence,
        accountId: matched ?? '',
        suggestedName: suggestion?.name ?? '',
        suggestedCategory: suggestion?.category ?? null,
        suggestedInstitution: suggestion?.institution ?? result.institution,
        include: true,
      }
    })
  }

  const recognize = async () => {
    if (images.length === 0) {
      setError('请先选择至少一张截图')
      return
    }
    if (!token) {
      setError('请先在设置里填写识别口令，或在下方直接保存口令')
      return
    }
    setBusy(true)
    setError(null)
    setItems([])
    const collected: Item[] = []
    let failed = 0
    let firstError = ''
    try {
      for (let index = 0; index < images.length; index += 1) {
        setProgress(`识别第 ${index + 1}/${images.length} 张…`)
        const image = images[index]
        try {
          const result = await recognizeImage(image.dataUrl, token)
          collected.push(...itemsFromResult(result, `图 ${index + 1}`))
        } catch (recognizeError) {
          failed += 1
          if (!firstError) {
            firstError = recognizeError instanceof Error ? recognizeError.message : '识别失败'
          }
        }
      }
      if (collected.length === 0) {
        setError(firstError || '没有识别到余额。可以换一张更清晰、只包含余额区域的截图，或用"粘贴文字"兜底。')
      } else {
        const merged = mergeItems(collected)
        setItems(merged)
        const totals = merged.filter((item) => item.isTotal).length
        toast.show(
          failed > 0
            ? `识别到 ${merged.length} 条（${totals} 条分类合计），${failed} 张失败`
            : `识别到 ${merged.length} 条（${totals} 条分类合计），请确认账户`,
        )
        if (failed > 0) setError(`${failed} 张截图识别失败：${firstError}`)
      }
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const usePaste = () => {
    const candidates = parseTextAmounts(pasteText)
    if (candidates.length === 0) {
      setError('这段文字里没有找到可用的金额')
      return
    }
    setError(null)
    const next = candidates.map((candidate) => {
      const category = categoryFromText(candidate.label)
      const section =
        category === 'cash'
          ? '现金'
          : category === 'savings'
            ? '储蓄'
            : category === 'bond'
              ? '理财'
              : category === 'fund'
                ? '基金'
                : category === 'stock'
                  ? '股票'
                  : ''
      const balance = {
        label: candidate.label,
        amount: candidate.amount,
        currency: 'CNY',
        confidence: candidate.confidence,
        section,
        isTotal: false,
      }
      const result = { kind: 'other' as const, institution: '' }
      const suggestion = suggestAccount(balance, result, activeAccounts)
      const matched = matchAccount(balance, result, activeAccounts)
      return {
        id: nextId(),
        source: '粘贴',
        institution: '',
        label: candidate.label,
        section: balance.section,
        isTotal: false,
        amount: String(roundMoney(candidate.amount)),
        confidence: candidate.confidence,
        accountId: matched ?? '',
        suggestedName: suggestion?.name ?? '',
        suggestedCategory: suggestion?.category ?? null,
        suggestedInstitution: undefined,
        include: true,
      }
    })
    setItems(mergeItems(next))
  }

  const updateItem = (id: string, patch: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const createSuggestedAccount = (item: Item) => {
    if (!item.suggestedName || !item.suggestedCategory) return
    const existing = activeAccounts.find(
      (account) => account.name.trim() === item.suggestedName.trim(),
    )
    if (existing) {
      updateItem(item.id, { accountId: existing.id })
      return
    }
    const id = actions.addAccount({
      name: item.suggestedName,
      category: item.suggestedCategory,
      institution: item.suggestedInstitution,
      tags: ['OCR'],
    })
    if (!id) {
      toast.show('创建账户失败，可能同名账户已存在')
      return
    }
    updateItem(item.id, { accountId: id })
    toast.show(`已新建「${item.suggestedName}」`)
  }

  const apply = () => {
    const included = items.filter((item) => item.include && item.accountId)
    if (included.length === 0) {
      setError('请至少选择一条结果并指定账户')
      return
    }
    const balances: Record<string, number> = {}
    const conflicts = new Set<string>()
    for (const item of included) {
      const amount = roundMoney(parseAmount(item.amount))
      if (!Number.isFinite(amount) || amount <= 0) continue
      if (item.accountId in balances) conflicts.add(item.accountId)
      balances[item.accountId] = amount
    }
    if (Object.keys(balances).length === 0) {
      setError('金额都不合法，请检查')
      return
    }
    if (conflicts.size > 0) toast.show('有账户被匹配了多条，已采用最后一条')
    onApply(balances)
  }

  const useSample = () => {
    const samples = [
      { label: '活期', section: '现金', amount: '8855', name: '农行现金', institution: '中国农业银行' },
      { label: '理财', section: '理财', amount: '42366', name: '农行理财', institution: '中国农业银行' },
      { label: '零钱', section: '现金', amount: '12346', name: '微信零钱', institution: '微信' },
    ]
    const next = samples.map((sample) => {
      const account = activeAccounts.find((item) => item.name === sample.name)
      return {
        id: nextId(),
        source: '示例',
        institution: sample.institution,
        label: sample.label,
        section: sample.section,
        isTotal: true,
        amount: sample.amount,
        confidence: 0.92,
        evidence: `${sample.label} ${sample.amount}`,
        accountId: account?.id ?? '',
        suggestedName: sample.name,
        suggestedCategory: categoryFromText(sample.section),
        suggestedInstitution: sample.institution,
        include: true,
      }
    })
    setItems(next)
    setError(null)
    toast.show('已填入示例结果，可检查确认界面')
  }

  const saveToken = () => {
    setOcrToken(tokenDraft)
    setToken(tokenDraft.trim())
    toast.show('识别口令已保存')
  }

  const includedCount = items.filter((item) => item.include && item.accountId).length
  const totalCount = items.length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="截图识别余额"
      subtitle={`最多 ${MAX_IMAGES} 张 · 优先取分类合计`}
      footer={
        items.length > 0 ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={apply} disabled={includedCount === 0}>
              填入 {includedCount} 条余额
            </button>
          </div>
        ) : (
          <button className="btn" style={{ width: '100%' }} onClick={onClose}>
            关闭
          </button>
        )
      }
    >
      {!token && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>先设置识别口令</div>
          <p className="tiny faint" style={{ margin: '4px 0 10px', lineHeight: 1.5 }}>
            口令与本地 .env.local / Vercel 的 OCR_ACCESS_TOKEN 一致，只存在这台设备。它不是模型 API Key。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              type="password"
              placeholder="粘贴识别口令"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
            />
            <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={saveToken}>
              保存
            </button>
          </div>
        </div>
      )}

      <div className="segmented" style={{ marginTop: 12 }} role="tablist">
        <button data-active={mode === 'image'} onClick={() => setMode('image')} type="button">
          上传截图
        </button>
        <button data-active={mode === 'text'} onClick={() => setMode('text')} type="button">
          粘贴文字
        </button>
      </div>

      {mode === 'image' ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              void addImages(event.target.files)
              event.target.value = ''
            }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              className="btn"
              style={{ flex: 1, minHeight: 76, flexDirection: 'column', gap: 4, fontSize: 13 }}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={20} />
              选择截图（最多 {MAX_IMAGES} 张）
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, minHeight: 76, flexDirection: 'column', gap: 4, fontSize: 13 }}
              onClick={recognize}
              disabled={busy || images.length === 0}
            >
              {busy ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} />}
              {busy ? progress : '开始识别'}
            </button>
          </div>

          {images.length > 0 && (
            <>
              <div className="tiny faint" style={{ marginTop: 8 }}>
                已选 {images.length} / {MAX_IMAGES} 张
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }} className="no-scrollbar">
                {images.map((image, index) => (
                  <div key={image.id} style={{ position: 'relative', flex: 'none' }}>
                    <img
                      src={image.dataUrl}
                      alt={`截图 ${index + 1}`}
                      style={{ width: 64, height: 84, objectFit: 'cover', borderRadius: 10, border: '0.5px solid var(--separator)' }}
                    />
                    <button
                      aria-label="移除截图"
                      onClick={() => {
                        setImages((current) => current.filter((item) => item.id !== image.id))
                        resetResults()
                      }}
                      style={{
                        position: 'absolute',
                        right: -5,
                        top: -5,
                        width: 20,
                        height: 20,
                        borderRadius: 99,
                        background: 'var(--text)',
                        color: 'var(--bg)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="tiny faint" style={{ margin: '10px 2px 0', lineHeight: 1.5 }}>
            截图会压缩后发送给配置的视觉模型；服务端不保存图片。建议只截余额区域，避免包含卡号、姓名；识别时优先取"活期/理财/基金/股票"等分类合计，跳过明细。
          </p>
          {import.meta.env.DEV && items.length === 0 && (
            <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: 12, padding: 0, marginTop: 4 }} onClick={useSample}>
              用示例结果预览确认界面
            </button>
          )}
        </>
      ) : (
        <>
          <textarea
            className="input"
            rows={7}
            style={{ marginTop: 12, resize: 'vertical', lineHeight: 1.5 }}
            placeholder={'在相册里长按截图 → 实况文本 → 全选拷贝，粘贴到这里。\n例如：\n活期 8,855.09\n理财 42,365.54'}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
          />
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={usePaste}>
            <ScanLine size={16} /> 提取金额候选
          </button>
        </>
      )}

      {error && (
        <div className="card" style={{ padding: 12, marginTop: 12, borderColor: 'color-mix(in srgb, var(--red) 30%, transparent)' }}>
          <div className="small" style={{ color: 'var(--red)', lineHeight: 1.5 }}>
            {error}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title" style={{ margin: '0 2px 8px' }}>
            识别结果
            <span className="tiny faint">
              {items.filter((item) => item.isTotal).length} 个分类合计 · 共 {totalCount} 条
            </span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="card"
              style={{ padding: 12, marginBottom: 10, opacity: item.include ? 1 : 0.55 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => updateItem(item.id, { include: !item.include })}
                  aria-label={item.include ? '不导入这条' : '导入这条'}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    border: item.include ? 0 : '1.5px solid var(--separator)',
                    background: item.include ? 'var(--accent)' : 'transparent',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                  }}
                >
                  {item.include && <Check size={14} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                    {item.isTotal && (
                      <span className="pill pill-accent" style={{ fontSize: 9, padding: '2px 6px' }}>
                        分类合计
                      </span>
                    )}
                  </div>
                  <div className="tiny faint">
                    {item.source}
                    {item.institution ? ` · ${item.institution}` : ''}
                    {item.section ? ` · ${item.section}` : ''}
                    {` · 置信度 ${Math.round(item.confidence * 100)}%`}
                  </div>
                </div>
                <button
                  className="icon-btn icon-btn-plain"
                  aria-label="删除这条"
                  onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8, marginTop: 10 }}>
                <select
                  className="input"
                  value={item.accountId}
                  onChange={(event) => updateItem(item.id, { accountId: event.target.value })}
                >
                  <option value="">选择账户…</option>
                  {grouped.map((group) => (
                    <optgroup key={group.category.key} label={group.category.label}>
                      {group.list.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  className="input amount-input"
                  inputMode="decimal"
                  value={item.amount}
                  onChange={(event) => updateItem(item.id, { amount: event.target.value })}
                />
              </div>
              {!item.accountId && item.suggestedName && item.suggestedCategory && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn"
                    style={{ minHeight: 34, fontSize: 12, padding: '0 10px' }}
                    onClick={() => createSuggestedAccount(item)}
                  >
                    <Plus size={13} /> 新建账户「{item.suggestedName}」
                  </button>
                </div>
              )}
              {item.suggestedName && item.accountId && (
                <div className="tiny faint" style={{ marginTop: 6 }}>
                  建议账户：{item.suggestedName}
                </div>
              )}
              {item.evidence && (
                <div className="tiny faint" style={{ marginTop: 4, lineHeight: 1.4 }}>
                  “{item.evidence}”
                </div>
              )}
              {!item.accountId && (
                <div className="tiny" style={{ marginTop: 5, color: 'var(--orange)' }}>
                  还没有选择账户，这条不会填入
                </div>
              )}
            </div>
          ))}
          <div className="small muted" style={{ textAlign: 'right' }}>
            合计{' '}
            {formatMoney(
              items
                .filter((item) => item.include && item.accountId)
                .reduce(
                  (sum, item) =>
                    sum + (Number.isFinite(parseAmount(item.amount)) ? parseAmount(item.amount) : 0),
                  0,
                ),
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, marginTop: 14, background: 'var(--fill-2)', boxShadow: 'none', border: '0.5px solid transparent' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={16} className="faint" style={{ flex: 'none', marginTop: 1 }} />
          <div className="tiny faint" style={{ lineHeight: 1.5 }}>
            识别结果必须由你确认后才会填入；截图仅在你点按时上传，不写入服务器。金额请以银行 App 为准。
          </div>
        </div>
      </div>
    </Sheet>
  )
}
