import { type ReactNode, useRef, useState } from 'react'
import {
  ChevronRight,
  Database,
  Download,
  Eye,
  HardDriveDownload,
  Info,
  KeyRound,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserRound,
  Wallet,
} from 'lucide-react'
import { CATEGORIES, DEFAULT_INVESTMENT_CATEGORIES } from '../../domain/categories'
import { formatMoney, parseAmount } from '../../domain/money'
import { latestSnapshot, monthLabel, totalOf } from '../../domain/selectors'
import type { CategoryKey, LedgerV2, LegacyCandidate } from '../../domain/types'
import {
  backupFilename,
  buildCsv,
  downloadText,
  readTextFile,
  serializeLedger,
  shareOrDownload,
} from '../../domain/importExport'
import { useLedger, useLedgerActions } from '../../store/LedgerProvider'
import { parseLedgerJson } from '../../domain/validation'
import { useToast } from '../../components/Toast'
import { Sheet } from '../../components/Sheet'
import { Switch } from '../../components/Switch'
import { Segmented } from '../../components/Segmented'
import {
  backupLedger,
  clearAllAppData,
  deleteBackup,
  getOcrToken,
  listBackups,
  loadBackup,
  readLegacyCopy,
  setOcrToken,
} from '../../store/storage'
import { AccountsScreen } from '../accounts/AccountsScreen'

type SheetKey = 'salary' | 'categories' | 'backups' | 'ocr' | 'install' | 'about' | 'legacy' | 'import' | null

export function SettingsScreen({
  legacyCandidate,
  legacyRaw,
  onMigrate,
}: {
  legacyCandidate: LegacyCandidate | null
  legacyRaw: { recordsRaw: string; configRaw: string | null } | null
  onMigrate: () => void
}) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const [sheet, setSheet] = useState<SheetKey>(null)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [salaryDraft, setSalaryDraft] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<CategoryKey[]>(ledger.settings.investmentCategories)
  const [backupVersion, setBackupVersion] = useState(0)
  const [ocrToken, setOcrTokenDraft] = useState(getOcrToken())
  const [ocrStatus, setOcrStatus] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<{ ledger: LedgerV2; warnings: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const latest = latestSnapshot(ledger)
  const backups = listBackups()
  const legacyCopy = readLegacyCopy()

  const openSalary = () => {
    setSalaryDraft(ledger.settings.defaultSalary !== null ? String(ledger.settings.defaultSalary) : '')
    setSheet('salary')
  }

  const saveSalary = () => {
    const value = salaryDraft.trim() === '' ? null : parseAmount(salaryDraft)
    if (value !== null && !Number.isFinite(value)) {
      toast.show('金额格式不正确')
      return
    }
    actions.updateSettings({ defaultSalary: value === null ? null : value })
    setSheet(null)
    toast.show(value === null ? '已清除默认月薪' : '默认月薪已更新')
  }

  const saveCategories = () => {
    actions.updateSettings({
      investmentCategories:
        selectedCategories.length > 0 ? selectedCategories : [...DEFAULT_INVESTMENT_CATEGORIES],
    })
    setSheet(null)
    toast.show('投资收益类别已更新')
  }

  const exportJson = async () => {
    const text = serializeLedger(ledger)
    const result = await shareOrDownload(backupFilename(), text, 'application/json', '资产全景备份')
    toast.show(result === 'shared' ? '已打开分享' : '备份文件已下载')
  }

  const exportCsv = () => {
    downloadText(`资产全景-明细-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(ledger), 'text/csv;charset=utf-8')
    toast.show('CSV 已下载')
  }

  const exportLegacy = async () => {
    if (!legacyRaw) {
      toast.show('没有检测到旧版数据')
      return
    }
    const text = JSON.stringify(
      {
        app: 'asset-panorama-legacy',
        exportedAt: new Date().toISOString(),
        records: safeParse(legacyRaw.recordsRaw),
        config: legacyRaw.configRaw ? safeParse(legacyRaw.configRaw) : null,
      },
      null,
      2,
    )
    const result = await shareOrDownload('资产全景-旧版原始数据.json', text, 'application/json', '旧版原始数据')
    toast.show(result === 'shared' ? '已打开分享' : '旧版数据已下载')
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await readTextFile(file)
      const parsed = parseLedgerJson(text)
      setPendingImport(parsed)
      setSheet('import')
    } catch (error) {
      toast.show(error instanceof Error ? error.message : '导入失败')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const applyImport = (mode: 'replace' | 'merge') => {
    if (!pendingImport) return
    if (mode === 'replace' && !window.confirm('替换会清空当前数据，确定继续吗？')) return
    backupLedger(ledger, 'before-import')
    actions.importLedger(pendingImport.ledger, mode)
    setPendingImport(null)
    setSheet(null)
    toast.show(`已导入${pendingImport.warnings.length > 0 ? `（${pendingImport.warnings.length} 条提示）` : ''}`)
  }

  const restoreBackup = (key: string) => {
    const loaded = loadBackup(key)
    if (!loaded) {
      toast.show('备份无法读取')
      return
    }
    if (!window.confirm(`恢复到 ${new Date(loaded.at).toLocaleString('zh-CN')} 的备份？当前数据会先自动备份。`)) return
    backupLedger(ledger, 'before-restore')
    actions.replaceLedger(loaded.ledger, { backup: false })
    setSheet(null)
    toast.show('已恢复备份')
  }

  const removeBackup = (key: string) => {
    if (!window.confirm('删除这份备份？')) return
    deleteBackup(key)
    setBackupVersion((value) => value + 1)
  }

  const saveOcr = () => {
    setOcrToken(ocrToken)
    toast.show('识别口令已保存')
  }

  const testOcr = async () => {
    setOcrStatus('检查中…')
    try {
      const response = await fetch('/api/ocr?ping=1', {
        headers: { 'x-ocr-token': ocrToken },
        cache: 'no-store',
      })
      if (response.status === 404) {
        setOcrStatus('接口未部署（本地开发需用 vercel dev，或先部署到 Vercel）')
        return
      }
      const data = (await response.json()) as { ok?: boolean; configured?: boolean; error?: { message?: string } }
      if (data.ok && data.configured) setOcrStatus('服务正常，已配置视觉模型')
      else if (data.ok && !data.configured) setOcrStatus('接口正常，但 Vercel 环境变量还没配置')
      else setOcrStatus(data.error?.message ?? '接口返回异常')
    } catch {
      setOcrStatus('无法连接接口，请检查部署')
    }
  }

  const checkUpdate = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      await registration?.update()
      toast.show('已检查更新，刷新页面生效')
    } catch {
      toast.show('当前浏览器不支持检查更新')
    }
  }

  const clearCaches = async () => {
    if (!window.confirm('清除离线缓存并重新加载？本地记账数据不会丢失。')) return
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations()
      await Promise.all((registrations ?? []).map((item) => item.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } finally {
      window.location.reload()
    }
  }

  const clearData = () => {
    if (!window.confirm('清除本应用的全部本地数据？旧版原始数据会保留，但新数据不可恢复。')) return
    clearAllAppData()
    window.location.reload()
  }

  return (
    <div className="screen">
      <header style={{ marginBottom: 8 }}>
        <h1 className="large-title">设置</h1>
        <p className="page-subtitle">
          {ledger.snapshots.length} 个月 · {ledger.accounts.length} 个账户
          {latest ? ` · 最新 ${monthLabel(`${latest.year}-${String(latest.month).padStart(2, '0')}`)} ${formatMoney(totalOf(latest, ledger))}` : ''}
        </p>
      </header>

      <Section title="外观与提醒">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>主题</div>
              <div className="tiny faint">跟随系统或固定深浅色</div>
            </div>
            <div style={{ width: 170 }}>
              <Segmented
                value={ledger.settings.theme}
                onChange={(value) => actions.updateSettings({ theme: value })}
                options={[
                  { value: 'system', label: '系统' },
                  { value: 'light', label: '浅' },
                  { value: 'dark', label: '深' },
                ]}
              />
            </div>
          </div>
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>隐藏金额</div>
              <div className="tiny faint">打开后所有金额显示为圆点</div>
            </div>
            <Switch
              checked={ledger.settings.hideAmounts}
              onChange={(value) => actions.updateSettings({ hideAmounts: value })}
              label="隐藏金额"
            />
          </div>
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>月底记录提醒</div>
              <div className="tiny faint">25 日后本月还没记录时在总览提示</div>
            </div>
            <Switch
              checked={ledger.settings.remindEntry}
              onChange={(value) => actions.updateSettings({ remindEntry: value })}
              label="月底记录提醒"
            />
          </div>
        </div>
      </Section>

      <Section title="工资与收益">
        <div className="list">
          <Row
            icon={<Wallet size={18} />}
            label="默认月薪"
            value={ledger.settings.defaultSalary !== null ? formatMoney(ledger.settings.defaultSalary) : '未设置'}
            onClick={openSalary}
          />
          <Row
            icon={<Eye size={18} />}
            label="投资收益类别"
            value={ledger.settings.investmentCategories.map((key) => CATEGORIES.find((c) => c.key === key)?.short).join('、')}
            onClick={() => {
              setSelectedCategories(ledger.settings.investmentCategories)
              setSheet('categories')
            }}
          />
        </div>
        <p className="tiny faint" style={{ margin: '8px 4px 0', lineHeight: 1.5 }}>
          默认月薪会带入所有未单独设置的月份；已有月份可在总览的"本月工资与调整"里单独改。
        </p>
      </Section>

      <Section title="账户">
        <div className="list">
          <Row
            icon={<UserRound size={18} />}
            label="账户管理"
            value={`${ledger.accounts.filter((account) => !account.archived).length} 个`}
            onClick={() => setAccountsOpen(true)}
          />
        </div>
      </Section>

      <Section title="数据">
        <div className="list">
          <Row icon={<Download size={18} />} label="导出备份（JSON）" onClick={exportJson} />
          <Row icon={<Database size={18} />} label="导出明细（CSV）" onClick={exportCsv} />
          <Row icon={<Upload size={18} />} label="导入 JSON" onClick={() => fileRef.current?.click()} />
          <Row
            icon={<HardDriveDownload size={18} />}
            label="备份与恢复"
            value={backups.length > 0 ? `${backups.length} 份` : '暂无'}
            onClick={() => setSheet('backups')}
          />
          <Row
            icon={<ShieldCheck size={18} />}
            label="旧版数据"
            value={legacyCandidate ? `${legacyCandidate.months} 个月` : legacyRaw ? '已备份' : '未检测到'}
            onClick={() => setSheet('legacy')}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(event) => importFile(event.target.files?.[0])}
        />
      </Section>

      <Section title="截图识别">
        <div className="list">
          <Row
            icon={<ScanLine size={18} />}
            label="智能识别设置"
            value={ocrToken ? '已设置口令' : '未配置'}
            onClick={() => setSheet('ocr')}
          />
        </div>
      </Section>

      <Section title="应用">
        <div className="list">
          <Row icon={<Smartphone size={18} />} label="安装到主屏幕" onClick={() => setSheet('install')} />
          <Row icon={<RefreshCw size={18} />} label="检查更新" onClick={checkUpdate} />
          <Row icon={<Info size={18} />} label="关于与版本" onClick={() => setSheet('about')} />
        </div>
      </Section>

      <Section title="危险操作">
        <div className="list">
          <Row icon={<Trash2 size={18} />} label="清除本应用数据" danger onClick={clearData} />
        </div>
        <p className="tiny faint" style={{ margin: '8px 4px 0', lineHeight: 1.5 }}>
          旧版 `asset-records` / `asset-config` 不会被删除；清空后仍可从"旧版数据"重新迁移。
        </p>
      </Section>

      <p className="tiny faint" style={{ textAlign: 'center', margin: '22px 0 6px' }}>
        资产全景 · 数据只存在这台设备
      </p>

      <AccountsScreen open={accountsOpen} onClose={() => setAccountsOpen(false)} />

      <Sheet
        open={sheet === 'salary'}
        onClose={() => setSheet(null)}
        title="默认月薪"
        subtitle="税后到手金额，会带入未单独设置的月份"
        footer={
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={saveSalary}>
            保存
          </button>
        }
      >
        <div className="card" style={{ padding: 14 }}>
          <label>
            <span className="field-label">金额（元）</span>
            <input
              className="input amount-input"
              style={{ fontSize: 22, fontWeight: 750 }}
              inputMode="decimal"
              placeholder="例如 25000"
              value={salaryDraft}
              onChange={(event) => setSalaryDraft(event.target.value)}
            />
          </label>
          <p className="tiny faint" style={{ margin: '8px 2px 0', lineHeight: 1.5 }}>
            留空表示不设置。修改默认值会影响所有没有单独设置工资的月份；已单独设置的月份不受影响。
          </p>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'categories'}
        onClose={() => setSheet(null)}
        title="投资收益类别"
        subtitle="这些类别的月度变化会计入投资收益估算"
        footer={
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={saveCategories}>
            保存
          </button>
        }
      >
        <div className="list">
          {CATEGORIES.map((category) => {
            const checked = selectedCategories.includes(category.key)
            return (
              <button
                key={category.key}
                className="list-row"
                onClick={() =>
                  setSelectedCategories((current) =>
                    checked ? current.filter((key) => key !== category.key) : [...current, category.key],
                  )
                }
              >
                <span className="dot" style={{ width: 10, height: 10, background: category.color }} />
                <span style={{ flex: 1, fontSize: 14 }}>{category.label}</span>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    border: checked ? 0 : '1.5px solid var(--separator)',
                    background: checked ? 'var(--accent)' : 'transparent',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                  }}
                >
                  {checked ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>
        <p className="tiny faint" style={{ margin: '12px 4px 0', lineHeight: 1.5 }}>
          房产、保险默认不计入，因为通常不做月度市值重估。现金利息会直接体现为净开销减少。
        </p>
      </Sheet>

      <Sheet
        open={sheet === 'backups'}
        onClose={() => setSheet(null)}
        title="备份与恢复"
        subtitle={`最多保留 8 份，自动快照每天一份`}
      >
        {backups.length === 0 && <div className="small faint">还没有备份。每次保存数据会自动生成。</div>}
        {backups.length > 0 && (
          <div className="list">
            {backups.map((backup) => (
              <div key={backup.key} className="list-row" style={{ background: 'var(--card)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {new Date(backup.at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="tiny faint">
                    {backup.months} 个月 · {backup.accounts} 账户 · {formatMoney(backup.total)} · {reasonLabel(backup.reason)}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ minHeight: 32, fontSize: 13 }} onClick={() => restoreBackup(backup.key)}>
                  恢复
                </button>
                <button className="icon-btn icon-btn-plain" aria-label="删除备份" onClick={() => removeBackup(backup.key)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => {
              const key = backupLedger(ledger, 'manual')
              setBackupVersion((value) => value + 1)
              toast.show(key ? '已创建手动备份' : '备份失败')
            }}
          >
            立即备份
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={exportJson}>
            导出到文件
          </button>
        </div>
        <span style={{ display: 'none' }}>{backupVersion}</span>
      </Sheet>

      <Sheet
        open={sheet === 'ocr'}
        onClose={() => setSheet(null)}
        title="截图智能识别"
        subtitle="云端视觉模型 · 截图会上传"
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={testOcr}>
              测试连接
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveOcr}>
              保存口令
            </button>
          </div>
        }
      >
        <div className="card" style={{ padding: 14 }}>
          <label>
            <span className="field-label">识别口令（与 Vercel 的 OCR_ACCESS_TOKEN 一致）</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={17} className="faint" />
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder="粘贴一串足够长的随机字符串"
                value={ocrToken}
                onChange={(event) => setOcrTokenDraft(event.target.value)}
              />
            </div>
          </label>
          <p className="tiny faint" style={{ margin: '8px 2px 0', lineHeight: 1.5 }}>
            口令只存在这台设备，用来防止公开网站上的接口被人盗刷模型额度。它不是模型 API Key。
          </p>
          {ocrStatus && (
            <div className="small" style={{ marginTop: 10, color: 'var(--text-2)' }}>
              {ocrStatus}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>在 Vercel 配置</div>
          <div className="tiny" style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
            <div>OCR_VISION_BASE_URL</div>
            <div>OCR_VISION_API_KEY</div>
            <div>OCR_VISION_MODEL</div>
            <div>OCR_ACCESS_TOKEN</div>
          </div>
          <p className="tiny faint" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
            推荐 Gemini 2.5 Flash（Google 的 OpenAI 兼容端点）或 GPT-4o-mini。只在点按识别时上传压缩后的截图，服务端不保存图片。
          </p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'install'} onClose={() => setSheet(null)} title="安装到主屏幕" subtitle="像 App 一样全屏打开">
        <div className="card" style={{ padding: 16 }}>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14 }}>
            <li>用 iPhone 的 Safari 打开本站（不要用微信内置浏览器）。</li>
            <li>点底部分享按钮，选择「添加到主屏幕」。</li>
            <li>从主屏幕打开，即可全屏运行并离线使用。</li>
            <li>更新后在设置里「检查更新」，或重新打开应用。</li>
          </ol>
          <p className="tiny faint" style={{ margin: '12px 0 0', lineHeight: 1.5 }}>
            如果之前用旧版添加过图标，可能需要删除旧图标再重新添加，才能拿到新的图标和全屏行为。
          </p>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'legacy'}
        onClose={() => setSheet(null)}
        title="旧版数据"
        subtitle="原始 localStorage 数据"
      >
        <div className="card" style={{ padding: 14 }}>
          {legacyRaw ? (
            <>
              <div className="small" style={{ lineHeight: 1.7 }}>
                检测到旧版 <b>asset-records</b>
                {legacyCandidate ? (
                  <>
                    ：{legacyCandidate.months} 个月、{legacyCandidate.accounts} 个账户、最新总额{' '}
                    {formatMoney(legacyCandidate.latestTotal)}
                  </>
                ) : (
                  '，但解析失败'
                )}
              </div>
              {legacyCandidate && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 12 }}
                  onClick={() => {
                    setSheet(null)
                    onMigrate()
                  }}
                >
                  打开迁移核对
                </button>
              )}
            </>
          ) : (
            <div className="small muted" style={{ lineHeight: 1.7 }}>
              没有检测到旧版数据。如果你之前是从别的网址记账（例如 Vercel 预览域名），请确认现在用的域名与当时一致；不同 origin 的数据不互通。
            </div>
          )}
          {legacyCopy && (
            <div className="tiny faint" style={{ marginTop: 10 }}>
              迁移时已保存一份原始副本：{new Date(legacyCopy.savedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={exportLegacy} disabled={!legacyRaw}>
            <Download size={16} /> 导出原始数据
          </button>
        </div>
        <p className="tiny faint" style={{ margin: '12px 4px 0', lineHeight: 1.5 }}>
          新应用从不删除旧键；即使迁移失败，也可以用上面的导出把原始 JSON 保存到「文件」App。
        </p>
      </Sheet>

      <Sheet
        open={sheet === 'import' && pendingImport !== null}
        onClose={() => {
          setPendingImport(null)
          setSheet(null)
        }}
        title="导入数据"
        subtitle={
          pendingImport
            ? `${pendingImport.ledger.snapshots.length} 个月 · ${pendingImport.ledger.accounts.length} 个账户`
            : undefined
        }
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => applyImport('merge')}>
              合并
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => applyImport('replace')}>
              替换
            </button>
          </div>
        }
      >
        <div className="card" style={{ padding: 14 }}>
          <div className="small" style={{ lineHeight: 1.7 }}>
            合并：按月份和账户 id 合并，新文件优先；替换：清空当前数据后导入。
            两种方式都会先自动备份当前数据。
          </div>
          {pendingImport && pendingImport.warnings.length > 0 && (
            <div className="tiny faint" style={{ marginTop: 10, lineHeight: 1.5 }}>
              {pendingImport.warnings.slice(0, 4).join('；')}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === 'about'} onClose={() => setSheet(null)} title="关于" subtitle="资产全景 2.0">
        <div className="list">
          <div className="list-row">
            <span style={{ flex: 1 }}>版本</span>
            <span className="tiny faint">2.0.0</span>
          </div>
          <div className="list-row">
            <span style={{ flex: 1 }}>构建</span>
            <span className="tiny faint mono">{__BUILD_ID__}</span>
          </div>
          <div className="list-row">
            <span style={{ flex: 1 }}>存储</span>
            <span className="tiny faint">本机 localStorage</span>
          </div>
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={clearCaches}>
          清除离线缓存并刷新
        </button>
        <p className="tiny faint" style={{ margin: '12px 4px 0', lineHeight: 1.5 }}>
          数据不会上传到服务器；只有使用截图识别时，压缩后的截图会发送给配置的视觉模型供应商。
        </p>
      </Sheet>
    </div>
  )
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'auto':
      return '自动'
    case 'manual':
      return '手动'
    case 'before-import':
      return '导入前'
    case 'before-restore':
      return '恢复前'
    case 'before-migration':
      return '迁移前'
    default:
      return reason
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <div className="section-title" style={{ margin: '0 2px 7px' }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function Row({
  icon,
  label,
  value,
  onClick,
  danger,
}: {
  icon: ReactNode
  label: string
  value?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button className="list-row" onClick={onClick} style={{ color: danger ? 'var(--red)' : 'var(--text)' }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          display: 'grid',
          placeItems: 'center',
          background: danger ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'var(--fill-2)',
          color: danger ? 'var(--red)' : 'var(--text-2)',
          flex: 'none',
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 14, textAlign: 'left' }}>{label}</span>
      {value && (
        <span className="tiny faint" style={{ maxWidth: 150, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </span>
      )}
      <ChevronRight size={15} className="faint" />
    </button>
  )
}

function Divider() {
  return <div style={{ height: '0.5px', background: 'var(--separator)', margin: '12px 0' }} />
}
