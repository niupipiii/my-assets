import { useEffect, useMemo, useState } from 'react'
import { formatMoney, formatSignedMoney, parseAmount, roundMoney } from '../../domain/money'
import { monthLabel, monthMetrics } from '../../domain/selectors'
import type { MonthFlow } from '../../domain/types'
import { useLedger, useLedgerActions } from '../../store/LedgerProvider'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'

function toInput(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return ''
  return String(value)
}

export function MonthFlowSheet({
  open,
  month,
  onClose,
}: {
  open: boolean
  month: string
  onClose: () => void
}) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const flow: MonthFlow = ledger.flows[month] ?? {}
  const metrics = monthMetrics(ledger, month)
  const [salary, setSalary] = useState('')
  const [otherIncome, setOtherIncome] = useState('')
  const [otherOutflow, setOtherOutflow] = useState('')
  const [investTransfer, setInvestTransfer] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    const current = ledger.flows[month] ?? {}
    setSalary(toInput(current.salary))
    setOtherIncome(toInput(current.otherIncome))
    setOtherOutflow(toInput(current.otherOutflow))
    setInvestTransfer(toInput(current.investTransfer))
    setNote(current.note ?? '')
  }, [open, month, ledger.flows])

  const defaultSalary = ledger.settings.defaultSalary
  const salaryValue = salary.trim() === '' ? defaultSalary : parseAmount(salary)
  const otherIncomeValue = otherIncome.trim() === '' ? 0 : parseAmount(otherIncome)
  const otherOutflowValue = otherOutflow.trim() === '' ? 0 : parseAmount(otherOutflow)
  const transferValue = investTransfer.trim() === '' ? 0 : parseAmount(investTransfer)

  const preview = useMemo(() => {
    if (metrics.delta === null || metrics.investReturn === null) return null
    if (salaryValue === null || !Number.isFinite(salaryValue)) return null
    if (!Number.isFinite(otherIncomeValue) || !Number.isFinite(otherOutflowValue) || !Number.isFinite(transferValue)) {
      return null
    }
    const investReturn = metrics.investReturn + metrics.transfer - transferValue
    const netSpend =
      salaryValue + otherIncomeValue + investReturn - metrics.delta - otherOutflowValue
    return { salary: salaryValue, investReturn, netSpend }
  }, [
    metrics.delta,
    metrics.investReturn,
    metrics.transfer,
    salaryValue,
    otherIncomeValue,
    otherOutflowValue,
    transferValue,
  ])

  const save = () => {
    const next: MonthFlow = {}
    if (salary.trim() !== '') {
      const value = parseAmount(salary)
      if (!Number.isFinite(value)) {
        toast.show('工资金额格式不正确')
        return
      }
      next.salary = roundMoney(value)
    }
    const optionalFields: Array<[keyof MonthFlow, string]> = [
      ['otherIncome', otherIncome],
      ['otherOutflow', otherOutflow],
      ['investTransfer', investTransfer],
    ]
    for (const [field, raw] of optionalFields) {
      if (raw.trim() === '') continue
      const value = parseAmount(raw)
      if (!Number.isFinite(value)) {
        toast.show('有金额格式不正确')
        return
      }
      if (value !== 0) (next as Record<string, number>)[field] = roundMoney(value)
    }
    if (note.trim() !== '') next.note = note.trim()
    actions.saveFlow(month, next)
    toast.show('已保存本月工资与调整')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="本月工资与调整"
      subtitle={`${monthLabel(month)} · 净开销推导`}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>
            保存
          </button>
        </div>
      }
    >
      <div className="card" style={{ padding: 14 }}>
        <label className="field-label">本月工资（税后）</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            className="input amount-input"
            style={{ flex: 1, fontSize: 22, fontWeight: 750, minHeight: 52 }}
            inputMode="decimal"
            placeholder={defaultSalary !== null ? String(defaultSalary) : '未设置默认月薪'}
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
          />
          {salary !== '' && (
            <button
              className="btn btn-ghost"
              style={{ minHeight: 40, padding: '0 10px', fontSize: 13 }}
              onClick={() => setSalary('')}
            >
              用默认
            </button>
          )}
        </div>
        <p className="tiny faint" style={{ margin: '6px 2px 0' }}>
          {defaultSalary === null
            ? '还没有默认月薪，请先在这里填一个值；下个月会自动带入。'
            : `默认月薪 ${formatMoney(defaultSalary)}；留空即使用默认值。`}
        </p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="section-title" style={{ margin: '0 2px 10px' }}>
          调整项 <span className="tiny faint">非必填</span>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <span className="field-label">其他收入（奖金、报销等）</span>
            <input
              className="input amount-input"
              inputMode="decimal"
              placeholder="0"
              value={otherIncome}
              onChange={(event) => setOtherIncome(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">其他流出（借款、转出等，不算消费）</span>
            <input
              className="input amount-input"
              inputMode="decimal"
              placeholder="0"
              value={otherOutflow}
              onChange={(event) => setOtherOutflow(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">本月净转入投资（买入 − 卖出）</span>
            <input
              className="input amount-input"
              inputMode="decimal"
              placeholder="0"
              value={investTransfer}
              onChange={(event) => setInvestTransfer(event.target.value)}
            />
          </label>
        </div>
        <p className="tiny faint" style={{ margin: '8px 2px 0', lineHeight: 1.5 }}>
          把现金转入股票/基金时填写这里，否则这笔钱会被算成"净开销"。从投资里取回现金则填负数。
        </p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <label>
          <span className="field-label">备注</span>
          <input
            className="input"
            placeholder="可选，例如：发了年终奖"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>

      <div
        className="card"
        style={{
          padding: 14,
          background: 'var(--accent-soft)',
          border: '0.5px solid transparent',
          boxShadow: 'none',
        }}
      >
        <div className="tiny" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          保存后预计
        </div>
        {preview ? (
          <>
            <div className="money" style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
              {preview.netSpend < 0 ? '净结余 ' : '净开销 '}
              {formatMoney(Math.abs(preview.netSpend))}
            </div>
            <div className="small" style={{ marginTop: 4, color: 'var(--text-2)' }}>
              工资 + 其他收入 {formatMoney(preview.salary + otherIncomeValue)} · 投资收益{' '}
              {formatSignedMoney(preview.investReturn)} · 资产变化 {formatSignedMoney(metrics.delta ?? 0)}
            </div>
          </>
        ) : (
          <div className="small" style={{ marginTop: 4, color: 'var(--text-2)' }}>
            补齐上月快照并设置工资后，这里会自动算出净开销。
          </div>
        )}
      </div>
    </Sheet>
  )
}
