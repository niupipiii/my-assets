import { useEffect, useMemo, useState } from 'react'
import { parseLegacy } from '../../domain/migration'
import { monthLabel } from '../../domain/selectors'
import { formatMoney } from '../../domain/money'
import type { LedgerV2, LegacyCandidate } from '../../domain/types'
import { useLedger, useLedgerActions } from '../../store/LedgerProvider'
import { backupLedger, saveLegacyCopy } from '../../store/storage'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'

export function MigrateSheet({
  open,
  raw,
  onClose,
  onMigrated,
}: {
  open: boolean
  raw: { recordsRaw: string; configRaw: string | null } | null
  onClose: () => void
  onMigrated: (ledger: LedgerV2) => void
}) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => {
    if (!raw) return null
    try {
      return { ok: true as const, value: parseLegacy(raw.recordsRaw, raw.configRaw) }
    } catch (parseError) {
      return {
        ok: false as const,
        message: parseError instanceof Error ? parseError.message : '旧版数据解析失败',
      }
    }
  }, [raw])

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const candidate: LegacyCandidate | null = parsed?.ok ? parsed.value.candidate : null

  const confirm = () => {
    if (!raw || !parsed?.ok) return
    if (
      ledger.snapshots.length > 0 &&
      !window.confirm('当前已有数据。迁移会用旧版数据覆盖当前余额记录，确定继续吗？（会先自动备份）')
    ) {
      return
    }
    setBusy(true)
    try {
      if (!saveLegacyCopy(raw)) {
        toast.show('原始数据备份写入失败，已停止迁移')
        setBusy(false)
        return
      }
      backupLedger(ledger, 'before-migration')
      actions.replaceLedger(parsed.value.ledger, { backup: false })
      onMigrated(parsed.value.ledger)
    } catch (migrationError) {
      setError(migrationError instanceof Error ? migrationError.message : '迁移失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="发现旧版数据"
      subtitle="同域名下的历史上传，可以直接升级"
      footer={
        parsed?.ok ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
              稍后
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={confirm} disabled={busy}>
              {busy ? '迁移中…' : '开始迁移'}
            </button>
          </div>
        ) : (
          <button className="btn" style={{ width: '100%' }} onClick={onClose}>
            关闭
          </button>
        )
      }
    >
      {!raw && <div className="small muted">没有找到旧版数据。</div>}
      {raw && !parsed?.ok && (
        <div className="card" style={{ padding: 14 }}>
          <div className="small" style={{ color: 'var(--red)', fontWeight: 600 }}>
            {parsed?.message ?? '无法解析旧版数据'}
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
            原始数据没有被改动。可以到「设置 → 旧版数据」导出原始 JSON，再导入修复。
          </p>
        </div>
      )}
      {candidate && (
        <>
          <div className="card" style={{ padding: 16 }}>
            <div className="tiny faint">旧版记录</div>
            <div className="money" style={{ fontSize: 30, fontWeight: 800, marginTop: 2, letterSpacing: '-0.8px' }}>
              {formatMoney(candidate.latestTotal)}
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {candidate.months} 个月 · {candidate.accounts} 个账户
              {candidate.latestKey ? ` · 最新 ${monthLabel(candidate.latestKey)}` : ''}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 14,
                paddingTop: 12,
                borderTop: '0.5px solid var(--separator)',
              }}
            >
              <MiniStat label="月份" value={String(candidate.months)} />
              <MiniStat label="账户" value={String(candidate.accounts)} />
              <MiniStat label="旧版键" value="保留" />
            </div>
          </div>

          <div className="card" style={{ padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>迁移会做什么</div>
            <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
              <li>把旧版的「分类 → 子账户」转成正式账户，保留每个月余额。</li>
              <li>先保存旧版原始 JSON，再写一份迁移前备份。</li>
              <li>旧键 <code>asset-records</code> / <code>asset-config</code> 不删除，可随时导出。</li>
              <li>旧数据没有工资，净开销会在你设置月薪后开始计算。</li>
              <li>旧版金额有小数时会四舍五入到整数；原始 JSON 仍保留小数。</li>
            </ul>
          </div>

          {candidate.warnings.length > 0 && (
            <div className="card" style={{ padding: 14, marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>需要留意</div>
              <ul className="tiny faint" style={{ margin: '6px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
                {candidate.warnings.slice(0, 5).map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div className="small" style={{ color: 'var(--red)' }}>
            {error}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tiny faint">{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}
