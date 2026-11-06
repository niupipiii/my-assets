import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTH_NAMES } from '../domain/categories'
import { monthKey, monthLabel, splitMonthKey } from '../domain/selectors'
import { Sheet } from './Sheet'

export function MonthPicker({
  open,
  value,
  onClose,
  onSelect,
  markedKeys = [],
}: {
  open: boolean
  value: string
  onClose: () => void
  onSelect: (key: string) => void
  markedKeys?: string[]
}) {
  const initial = splitMonthKey(value)
  const [year, setYear] = useState(initial.year)

  useEffect(() => {
    if (open) setYear(splitMonthKey(value).year)
  }, [open, value])

  const marked = new Set(markedKeys)
  const now = new Date()
  const currentKey = monthKey(now.getFullYear(), now.getMonth() + 1)

  return (
    <Sheet open={open} onClose={onClose} title="选择月份" subtitle="每月记录一次余额快照">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 4px 14px',
        }}
      >
        <button className="icon-btn" onClick={() => setYear((y) => y - 1)} aria-label="上一年">
          <ChevronLeft size={19} />
        </button>
        <div className="mono" style={{ fontSize: 20, fontWeight: 750 }}>
          {year} 年
        </div>
        <button className="icon-btn" onClick={() => setYear((y) => y + 1)} aria-label="下一年">
          <ChevronRight size={19} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {MONTH_NAMES.map((label, index) => {
          const key = monthKey(year, index + 1)
          const active = key === value
          const isCurrent = key === currentKey
          return (
            <button
              key={key}
              onClick={() => {
                onSelect(key)
                onClose()
              }}
              style={{
                position: 'relative',
                minHeight: 54,
                borderRadius: 13,
                fontSize: 15,
                fontWeight: active ? 750 : 550,
                background: active ? 'var(--accent)' : 'var(--fill-2)',
                color: active ? '#fff' : isCurrent ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {label}
              {marked.has(key) && (
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 7,
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    borderRadius: 99,
                    background: active ? 'rgba(255,255,255,.8)' : 'var(--accent)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => {
            onSelect(currentKey)
            onClose()
          }}
        >
          回到本月 · {monthLabel(currentKey)}
        </button>
      </div>
      <p className="tiny faint" style={{ textAlign: 'center', marginTop: 12 }}>
        圆点表示这个月已经记录过
      </p>
    </Sheet>
  )
}
