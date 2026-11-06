import { formatCompact, formatMoney, formatSignedMoney } from '../domain/money'
import { useLedger } from '../store/LedgerProvider'

interface MoneyProps {
  value: number | null | undefined
  signed?: boolean
  compact?: boolean
  className?: string
  placeholder?: string
}

export function Money({ value, signed = false, compact = false, className = '', placeholder = '—' }: MoneyProps) {
  const ledger = useLedger()
  const hidden = ledger.settings.hideAmounts
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={`money ${className}`}>{placeholder}</span>
  }
  if (hidden) return <span className={`money ${className}`}>••••</span>
  const text = compact ? formatCompact(value) : signed ? formatSignedMoney(value) : formatMoney(value)
  return <span className={`money ${className}`}>{text}</span>
}

export function DeltaText({
  value,
  percent,
  className = '',
}: {
  value: number | null
  percent?: number | null
  className?: string
}) {
  if (value === null) return <span className={`muted small ${className}`}>—</span>
  const up = value >= 0
  return (
    <span className={`${up ? 'up' : 'down'} money small ${className}`} style={{ fontWeight: 650 }}>
      {up ? '↑' : '↓'} {percent !== undefined && percent !== null ? `${Math.abs(percent * 100).toFixed(1)}%` : null}
      {percent === undefined || percent === null ? <Money value={Math.abs(value)} signed /> : null}
    </span>
  )
}
