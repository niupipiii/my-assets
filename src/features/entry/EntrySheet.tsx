import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, Copy, Plus, RotateCcw, ScanLine } from 'lucide-react'
import { CATEGORIES, categoryOf } from '../../domain/categories'
import {
  accountsOfCategory,
  currentMonthKey,
  effectiveSalary,
  getSnapshot,
  investTotalOf,
  monthLabel,
  monthMetrics,
  prefillSnapshot,
  prevMonthKey,
  totalOf,
} from '../../domain/selectors'
import { formatMoney, formatSignedMoney, parseAmount, round2, roundMoney } from '../../domain/money'
import type { Account, CategoryKey, MonthFlow } from '../../domain/types'
import { useLedger, useLedgerActions } from '../../store/LedgerProvider'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'
import { MonthPicker } from '../../components/MonthPicker'
import { CategoryIcon } from '../../components/CategoryIcon'
import { OcrSheet } from '../ocr/OcrSheet'

function draftOf(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return ''
  return String(value)
}

function buildDraft(ledger: ReturnType<typeof useLedger>, key: string): {
  balances: Record<string, string>
  accounts: Account[]
  source: string | null
} {
  const existing = getSnapshot(ledger, key)
  const prefill = existing ? { snapshot: existing, sourceKey: key } : prefillSnapshot(ledger, key)
  const base = prefill.snapshot
  const accounts = ledger.accounts
    .filter((account) => {
      if (!account.archived) return true
      const value = base?.balances[account.id]
      return typeof value === 'number' && value !== 0
    })
    .sort((a, b) => {
      const orderA = CATEGORIES.findIndex((category) => category.key === a.category)
      const orderB = CATEGORIES.findIndex((category) => category.key === b.category)
      return orderA - orderB || a.order - b.order
    })
  const balances: Record<string, string> = {}
  for (const account of accounts) {
    balances[account.id] = draftOf(base?.balances[account.id])
  }
  return { balances, accounts, source: prefill.sourceKey }
}

export function EntrySheet({
  open,
  month,
  onClose,
  onSaved,
}: {
  open: boolean
  month: string
  onClose: () => void
  onSaved: (month: string) => void
}) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const [draftMonth, setDraftMonth] = useState(month)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [flowOpen, setFlowOpen] = useState(false)
  const [ocrOpen, setOcrOpen] = useState(false)
  const [salary, setSalary] = useState('')
  const [otherIncome, setOtherIncome] = useState('')
  const [otherOutflow, setOtherOutflow] = useState('')
  const [investTransfer, setInvestTransfer] = useState('')
  const [expanded, setExpanded] = useState<Set<CategoryKey>>(new Set(CATEGORIES.map((c) => c.key)))
  const [addingCategory, setAddingCategory] = useState<CategoryKey | null>(null)
  const [newName, setNewName] = useState('')
  const baseline = useRef('')

  const applyMonthState = (key: string) => {
    const built = buildDraft(ledger, key)
    const flow = ledger.flows[key] ?? {}
    setDraftMonth(key)
    setDraft(built.balances)
    setNote(getSnapshot(ledger, key)?.note ?? '')
    setSalary(flow.salary !== undefined ? String(flow.salary) : '')
    setOtherIncome(flow.otherIncome !== undefined ? String(flow.otherIncome) : '')
    setOtherOutflow(flow.otherOutflow !== undefined ? String(flow.otherOutflow) : '')
    setInvestTransfer(flow.investTransfer !== undefined ? String(flow.investTransfer) : '')
    baseline.current = JSON.stringify({
      balances: built.balances,
      note: getSnapshot(ledger, key)?.note ?? '',
      flow,
    })
  }

  useEffect(() => {
    if (!open) return
    applyMonthState(month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month])

  const base = getSnapshot(ledger, draftMonth)
  const prefill = base ? { snapshot: base, sourceKey: draftMonth } : prefillSnapshot(ledger, draftMonth)
  const entryAccounts = ledger.accounts
    .filter((account) => {
      if (!account.archived) return true
      const value = prefill.snapshot?.balances[account.id]
      return typeof value === 'number' && value !== 0
    })
    .sort((a, b) => {
      const orderA = CATEGORIES.findIndex((category) => category.key === a.category)
      const orderB = CATEGORIES.findIndex((category) => category.key === b.category)
      return orderA - orderB || a.order - b.order
    })

  const categoriesForEntry = CATEGORIES.filter(
    (category) =>
      category.primary || entryAccounts.some((account) => account.category === category.key),
  )

  const parsed = useMemo(() => {
    const balances: Record<string, number> = {}
    const invalid: string[] = []
    for (const account of entryAccounts) {
      const raw = draft[account.id] ?? ''
      if (raw.trim() === '') {
        balances[account.id] = 0
        continue
      }
      const value = parseAmount(raw)
      if (!Number.isFinite(value)) {
        invalid.push(account.name)
        balances[account.id] = 0
      } else {
        balances[account.id] = round2(value)
      }
    }
    return { balances, invalid }
  }, [draft, entryAccounts])

  const draftTotal = Object.values(parsed.balances).reduce((sum, value) => sum + value, 0)
  const prevSnapshot = getSnapshot(ledger, prevMonthKey(draftMonth))
  const prevTotal = prevSnapshot ? totalOf(prevSnapshot, ledger) : null
  const draftDelta = prevTotal === null ? null : round2(draftTotal - prevTotal)

  const effectiveSalaryValue =
    salary.trim() === '' ? ledger.settings.defaultSalary : parseAmount(salary)
  const transferValue = investTransfer.trim() === '' ? 0 : parseAmount(investTransfer)
  const investSet = new Set(ledger.settings.investmentCategories)
  const draftInvestTotal = entryAccounts
    .filter((account) => investSet.has(account.category))
    .reduce((sum, account) => sum + (parsed.balances[account.id] ?? 0), 0)
  const prevInvestTotal = prevSnapshot ? investTotalOf(prevSnapshot, ledger) : null
  const draftInvestReturn =
    prevInvestTotal === null || !Number.isFinite(transferValue)
      ? null
      : round2(draftInvestTotal - prevInvestTotal - transferValue)
  const previewNet =
    draftDelta !== null &&
    effectiveSalaryValue !== null &&
    Number.isFinite(effectiveSalaryValue) &&
    draftInvestReturn !== null
      ? round2(
          effectiveSalaryValue +
            (otherIncome.trim() === '' ? 0 : parseAmount(otherIncome) || 0) +
            draftInvestReturn -
            draftDelta -
            (otherOutflow.trim() === '' ? 0 : parseAmount(otherOutflow) || 0),
        )
      : null

  const isDirty = useMemo(() => {
    return (
      baseline.current !==
      JSON.stringify({
        balances: draft,
        note,
        flow: {
          ...(salary.trim() !== '' && Number.isFinite(parseAmount(salary)) ? { salary: parseAmount(salary) } : {}),
          ...(otherIncome.trim() !== '' ? { otherIncome: parseAmount(otherIncome) } : {}),
          ...(otherOutflow.trim() !== '' ? { otherOutflow: parseAmount(otherOutflow) } : {}),
          ...(investTransfer.trim() !== '' ? { investTransfer: parseAmount(investTransfer) } : {}),
        },
      })
    )
  }, [draft, note, salary, otherIncome, otherOutflow, investTransfer])

  const requestMonthChange = (key: string) => {
    if (isDirty && !window.confirm('切换月份会放弃未保存的修改，继续吗？')) return
    applyMonthState(key)
  }

  const toggleCategory = (key: CategoryKey) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const copyPrevious = () => {
    const previous = prefill.snapshot
    if (!previous) {
      toast.show('没有可复制的上月余额')
      return
    }
    const next: Record<string, string> = {}
    for (const account of entryAccounts) {
      next[account.id] = draftOf(previous.balances[account.id])
    }
    setDraft(next)
    toast.show(`已复制 ${monthLabel(prefill.sourceKey ?? '')} 的余额`)
  }

  const clearAll = () => {
    const next: Record<string, string> = {}
    for (const account of entryAccounts) next[account.id] = ''
    setDraft(next)
    setNote('')
  }

  const addAccount = (category: CategoryKey) => {
    const name = newName.trim()
    if (!name) return
    const id = actions.addAccount({ name, category })
    if (!id) {
      toast.show('同一分类下已有同名账户')
      return
    }
    setDraft((current) => ({ ...current, [id]: '' }))
    setNewName('')
    setAddingCategory(null)
    toast.show(`已添加 ${name}`)
  }

  const save = () => {
    if (parsed.invalid.length > 0) {
      toast.show(`金额格式不正确：${parsed.invalid.slice(0, 2).join('、')}`)
      return
    }
    const hasValue = Object.values(parsed.balances).some((value) => value !== 0)
    if (!hasValue && note.trim() === '') {
      toast.show('请至少填写一个账户余额')
      return
    }
    actions.saveSnapshot({
      year: Number(draftMonth.slice(0, 4)),
      month: Number(draftMonth.slice(5, 7)),
      balances: parsed.balances,
      note: note.trim() || undefined,
    })
    const flow: MonthFlow = {}
    if (salary.trim() !== '') {
      const value = parseAmount(salary)
      if (Number.isFinite(value)) flow.salary = value
    }
    if (otherIncome.trim() !== '') {
      const value = parseAmount(otherIncome)
      if (Number.isFinite(value) && value !== 0) flow.otherIncome = value
    }
    if (otherOutflow.trim() !== '') {
      const value = parseAmount(otherOutflow)
      if (Number.isFinite(value) && value !== 0) flow.otherOutflow = value
    }
    if (investTransfer.trim() !== '') {
      const value = parseAmount(investTransfer)
      if (Number.isFinite(value) && value !== 0) flow.investTransfer = value
    }
    actions.saveFlow(draftMonth, flow)
    toast.show(`已保存 ${monthLabel(draftMonth)}`)
    onSaved(draftMonth)
    onClose()
  }

  const cancel = () => {
    if (isDirty && !window.confirm('还有未保存的修改，确定关闭吗？')) return
    onClose()
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={cancel}
        full
        title={base ? '编辑余额' : '记录余额'}
        subtitle={monthLabel(draftMonth)}
        headerRight={
          <>
            <button className="icon-btn" onClick={copyPrevious} aria-label="复制上月">
              <Copy size={17} />
            </button>
            <button className="icon-btn" onClick={clearAll} aria-label="清空">
              <RotateCcw size={17} />
            </button>
            <button className="icon-btn" onClick={() => setPickerOpen(true)} aria-label="选择月份">
              <CalendarDays size={17} />
            </button>
          </>
        }
        footer={
          <div>
            {previewNet !== null && (
              <div
                className="small"
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
              >
                <span className="muted">保存后预计净开销</span>
                <span
                  className="money"
                  style={{ fontWeight: 700, color: previewNet < 0 ? 'var(--green)' : 'var(--text)' }}
                >
                  {previewNet < 0 ? '净结余 ' : ''}
                  {formatMoney(Math.abs(previewNet))}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tiny faint">总计</div>
                <div className="money" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.6px' }}>
                  {ledger.settings.hideAmounts ? '••••' : formatMoney(draftTotal)}
                </div>
                <div className="tiny money" style={{ color: (draftDelta ?? 0) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 650 }}>
                  {draftDelta === null
                    ? '无上月对照'
                    : `${draftDelta >= 0 ? '↑' : '↓'} ${ledger.settings.hideAmounts ? '••••' : formatSignedMoney(Math.abs(draftDelta))} 较 ${monthLabel(prevMonthKey(draftMonth))}`}
                </div>
              </div>
              <button className="btn btn-primary" style={{ minWidth: 132 }} onClick={save}>
                保存
              </button>
            </div>
          </div>
        }
      >
        <div className="card" style={{ padding: 14 }}>
          <button
            onClick={() => setFlowOpen((value) => !value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>本月工资与调整</div>
              <div className="money" style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {effectiveSalaryValue !== null && Number.isFinite(effectiveSalaryValue)
                  ? formatMoney(effectiveSalaryValue)
                  : '未设置工资'}
                <span className="tiny faint" style={{ marginLeft: 6, fontWeight: 500 }}>
                  {salary.trim() === '' ? '默认' : '本月单独'}
                </span>
              </div>
            </div>
            <ChevronDown
              size={18}
              className="faint"
              style={{ transform: flowOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
            />
          </button>
          {flowOpen && (
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <label>
                <span className="field-label">本月工资（留空用默认）</span>
                <input
                  className="input amount-input"
                  inputMode="decimal"
                  placeholder={
                    ledger.settings.defaultSalary !== null
                      ? `默认 ${ledger.settings.defaultSalary}`
                      : '未设置默认月薪'
                  }
                  value={salary}
                  onChange={(event) => setSalary(event.target.value)}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>
                  <span className="field-label">其他收入</span>
                  <input
                    className="input amount-input"
                    inputMode="decimal"
                    placeholder="0"
                    value={otherIncome}
                    onChange={(event) => setOtherIncome(event.target.value)}
                  />
                </label>
                <label>
                  <span className="field-label">其他流出</span>
                  <input
                    className="input amount-input"
                    inputMode="decimal"
                    placeholder="0"
                    value={otherOutflow}
                    onChange={(event) => setOtherOutflow(event.target.value)}
                  />
                </label>
              </div>
              <label>
                <span className="field-label">净转入投资（买入 − 卖出）</span>
                <input
                  className="input amount-input"
                  inputMode="decimal"
                  placeholder="0"
                  value={investTransfer}
                  onChange={(event) => setInvestTransfer(event.target.value)}
                />
              </label>
              <p className="tiny faint" style={{ margin: 0 }}>
                转入股票/基金要填这里，否则会算成净开销；从投资取回现金填负数。
              </p>
              <label>
                <span className="field-label">本月备注</span>
                <input
                  className="input"
                  placeholder="可选"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <button
          className="card"
          onClick={() => setOcrOpen(true)}
          style={{
            width: '100%',
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              flex: 'none',
            }}
          >
            <ScanLine size={18} />
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>从截图导入余额</span>
            <span className="tiny faint">银行 / 微信 / 支付宝，识别后确认</span>
          </span>
          <ChevronRight size={16} className="faint" />
        </button>

        {!base && prefill.sourceKey && (
          <div className="tiny faint" style={{ margin: '10px 4px 0' }}>
            已带入 {monthLabel(prefill.sourceKey)} 的余额，按实际情况修改即可。
          </div>
        )}
        {entryAccounts.length === 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="small muted" style={{ lineHeight: 1.6 }}>
              还没有账户。先在下面按分类添加一个，例如"招商银行"或"余额宝"。
            </div>
          </div>
        )}

        {categoriesForEntry.map((category) => {
          const accounts = entryAccounts.filter((account) => account.category === category.key)
          if (accounts.length === 0 && addingCategory !== category.key) {
            return (
              <div key={category.key} style={{ marginTop: 12 }}>
                <button
                  className="btn"
                  style={{ width: '100%', minHeight: 42, fontSize: 14, color: 'var(--text-2)' }}
                  onClick={() => {
                    setAddingCategory(category.key)
                    setNewName('')
                    setExpanded((current) => new Set(current).add(category.key))
                  }}
                >
                  <Plus size={15} /> 添加{category.short}账户
                </button>
              </div>
            )
          }
          const total = accounts.reduce((sum, account) => sum + (parsed.balances[account.id] ?? 0), 0)
          const isExpanded = expanded.has(category.key)
          return (
            <div key={category.key} className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => toggleCategory(category.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '12px 14px',
                  textAlign: 'left',
                  background: isExpanded ? `${category.color}0d` : 'transparent',
                }}
              >
                <CategoryIcon category={category.key} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{category.label}</div>
                  <div className="tiny faint">{accounts.length} 个账户</div>
                </div>
                <div className="money" style={{ fontSize: 14, fontWeight: 700, color: category.color }}>
                  {ledger.settings.hideAmounts ? '••••' : formatMoney(total)}
                </div>
                <ChevronDown
                  size={16}
                  className="faint"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                />
              </button>
              {isExpanded && (
                <div style={{ padding: '0 14px 12px' }}>
                  {accounts.map((account) => (
                    <div key={account.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {account.name}
                          {account.archived && (
                            <span className="tiny faint" style={{ marginLeft: 6 }}>
                              已归档
                            </span>
                          )}
                        </div>
                        {account.tags.length > 0 && (
                          <div className="tiny faint" style={{ marginTop: 1 }}>
                            {account.tags.join(' · ')}
                          </div>
                        )}
                      </div>
                      <input
                        className="input amount-input"
                        style={{ width: 138, minHeight: 40, padding: '8px 10px' }}
                        inputMode="decimal"
                        placeholder="0"
                        value={draft[account.id] ?? ''}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, [account.id]: event.target.value }))
                        }
                        onBlur={(event) => {
                          const raw = event.target.value
                          if (raw.trim() === '') return
                          const parsedValue = parseAmount(raw)
                          if (!Number.isFinite(parsedValue)) return
                          const rounded = String(roundMoney(parsedValue))
                          if (rounded !== raw) {
                            setDraft((current) => ({ ...current, [account.id]: rounded }))
                          }
                        }}
                      />
                    </div>
                  ))}
                  {addingCategory === category.key ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        className="input"
                        autoFocus
                        placeholder="账户名称，例如：招商银行"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') addAccount(category.key)
                        }}
                      />
                      <button
                        className="btn btn-primary"
                        style={{ minHeight: 40, padding: '0 12px' }}
                        onClick={() => addAccount(category.key)}
                      >
                        添加
                      </button>
                      <button
                        className="btn"
                        style={{ minHeight: 40, padding: '0 10px' }}
                        onClick={() => setAddingCategory(null)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      style={{ minHeight: 34, fontSize: 13, padding: '0 2px', marginTop: 4 }}
                      onClick={() => {
                        setAddingCategory(category.key)
                        setNewName('')
                      }}
                    >
                      <Plus size={14} /> 添加账户
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <p className="tiny faint" style={{ margin: '16px 4px 0', lineHeight: 1.5 }}>
          只需要记录余额，不用记流水。投资类资产的变化会自动用于估算收益。
        </p>
      </Sheet>

      <OcrSheet
        open={ocrOpen}
        accounts={entryAccounts}
        onClose={() => setOcrOpen(false)}
        onApply={(balances) => {
          const entries = Object.entries(balances)
          setDraft((current) => {
            const next = { ...current }
            for (const [accountId, amount] of entries) {
              if (entryAccounts.some((account) => account.id === accountId)) {
                next[accountId] = String(amount)
              }
            }
            return next
          })
          setOcrOpen(false)
          toast.show(`已填入 ${entries.length} 个账户，请确认后保存`)
        }}
      />

      <MonthPicker
        open={pickerOpen}
        value={draftMonth}
        onClose={() => setPickerOpen(false)}
        onSelect={requestMonthChange}
        markedKeys={ledger.snapshots.map((snapshot) => `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`)}
      />
    </>
  )
}
