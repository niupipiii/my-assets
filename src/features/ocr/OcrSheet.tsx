import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, ScanLine, ShieldCheck, Trash2, Wand2 } from 'lucide-react'
import { CATEGORIES } from '../../domain/categories'
import { formatMoney, parseAmount } from '../../domain/money'
import type { Account } from '../../domain/types'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'
import { getOcrToken, setOcrToken } from '../../store/storage'
import {
  compressImage,
  matchAccount,
  parseTextAmounts,
  recognizeImage,
  type OcrResult,
} from '../../lib/ocr'

interface Item {
  id: string
  source: string
  institution: string
  label: string
  amount: string
  confidence: number
  evidence?: string
  accountId: string
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
    resetResults()
    const next: ImageState[] = []
    for (const file of Array.from(files).slice(0, 5 - images.length)) {
      if (!file.type.startsWith('image/')) continue
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
      const matched = matchAccount(balance, result, activeAccounts)
      return {
        id: nextId(),
        source: sourceLabel,
        institution: result.institution,
        label: balance.label || result.institution || '未命名账户',
        amount: String(balance.amount),
        confidence: balance.confidence,
        evidence: balance.evidence,
        accountId: matched ?? '',
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
    try {
      for (let index = 0; index < images.length; index += 1) {
        setProgress(`识别第 ${index + 1}/${images.length} 张…`)
        const image = images[index]
        const result = await recognizeImage(image.dataUrl, token)
        collected.push(...itemsFromResult(result, `图 ${index + 1}`))
      }
      if (collected.length === 0) {
        setError('没有识别到余额。可以换一张更清晰、只包含余额区域的截图，或用"粘贴文字"兜底。')
      } else {
        setItems(collected)
        toast.show(`识别到 ${collected.length} 条余额，请确认账户`)
      }
    } catch (recognizeError) {
      setError(recognizeError instanceof Error ? recognizeError.message : '识别失败')
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
    setItems(
      candidates.map((candidate) => {
        const matched = matchAccount(
          {
            label: candidate.label,
            amount: candidate.amount,
            currency: 'CNY',
            confidence: candidate.confidence,
          },
          { kind: 'other', institution: '' },
          activeAccounts,
        )
        return {
          id: nextId(),
          source: '粘贴',
          institution: '',
          label: candidate.label,
          amount: String(candidate.amount),
          confidence: candidate.confidence,
          accountId: matched ?? '',
          include: true,
        }
      }),
    )
  }

  const updateItem = (id: string, patch: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
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
      const amount = parseAmount(item.amount)
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
      { label: '零钱', amount: '12,345.67', name: '微信零钱', institution: '微信' },
      { label: '一卡通', amount: '88,000.00', name: '招商银行', institution: '招商银行' },
      { label: '余额宝', amount: '20,000.00', name: '余额宝', institution: '支付宝' },
    ]
    const next = samples.map((sample) => {
      const account = activeAccounts.find((item) => item.name === sample.name)
      return {
        id: nextId(),
        source: '示例',
        institution: sample.institution,
        label: sample.label,
        amount: sample.amount,
        confidence: 0.92,
        evidence: `${sample.label} ${sample.amount}`,
        accountId: account?.id ?? '',
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="截图识别余额"
      subtitle="银行 / 微信 / 支付宝截图"
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
            口令与 Vercel 的 OCR_ACCESS_TOKEN 一致，只存在这台设备。它不是模型 API Key。
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
              选择截图（最多 5 张）
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
            <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto' }} className="no-scrollbar">
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
          )}
          <p className="tiny faint" style={{ margin: '10px 2px 0', lineHeight: 1.5 }}>
            截图会压缩后发送给配置的视觉模型；服务端不保存图片。建议只截余额区域，避免包含卡号、姓名。
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
            placeholder={'在相册里长按截图 → 实况文本 → 全选拷贝，粘贴到这里。\n例如：\n零钱  ¥12,345.67\n余额宝  8,000.00'}
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
            <span className="tiny faint">确认账户与金额</span>
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
                  <div style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </div>
                  <div className="tiny faint">
                    {item.source}
                    {item.institution ? ` · ${item.institution}` : ''}
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
              {item.evidence && (
                <div className="tiny faint" style={{ marginTop: 6, lineHeight: 1.4 }}>
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
            合计 {formatMoney(items.filter((item) => item.include && item.accountId).reduce((sum, item) => sum + (Number.isFinite(parseAmount(item.amount)) ? parseAmount(item.amount) : 0), 0))}
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
