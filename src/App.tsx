import { useEffect, useMemo, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { currentMonthKey, latestSnapshot, latestSnapshotKey, snapshotKey, totalOf } from './domain/selectors'
import { formatMoney } from './domain/money'
import type { LedgerV2 } from './domain/types'
import type { BootState } from './store/boot'
import { useLedger, useLedgerActions } from './store/LedgerProvider'
import { useToast } from './components/Toast'
import { TabBar, type TabKey } from './components/TabBar'
import { MonthPicker } from './components/MonthPicker'
import { Sheet } from './components/Sheet'
import { Overview } from './features/overview/Overview'
import { ReportsScreen } from './features/reports/ReportsScreen'
import { HistoryScreen } from './features/history/HistoryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { EntrySheet } from './features/entry/EntrySheet'
import { MonthFlowSheet } from './features/entry/MonthFlowSheet'
import { MigrateSheet } from './features/migrate/MigrateSheet'
import { readPreviewConfig } from './lib/preview'

const TAB_KEYS: TabKey[] = ['overview', 'reports', 'history', 'settings']

export function App({ boot }: { boot: BootState }) {
  const ledger = useLedger()
  const actions = useLedgerActions()
  const toast = useToast()
  const preview = readPreviewConfig()

  const initialMonth = latestSnapshotKey(ledger) ?? currentMonthKey()
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = ledger.settings.lastTab
    return (TAB_KEYS as string[]).includes(saved) ? (saved as TabKey) : 'overview'
  })
  const [month, setMonth] = useState(initialMonth)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryMonth, setEntryMonth] = useState(initialMonth)
  const [flowOpen, setFlowOpen] = useState(false)
  const [migrateOpen, setMigrateOpen] = useState(boot.shouldOfferMigration)
  const [migrationResult, setMigrationResult] = useState<{
    months: number
    accounts: number
    total: number
  } | null>(null)

  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark' | null>(preview.theme)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  const { needRefresh, updateServiceWorker } = useRegisterSW()
  const [refreshVisible, setRefreshVisible] = useState(false)

  useEffect(() => {
    setRefreshVisible(needRefresh[0])
  }, [needRefresh])

  useEffect(() => {
    if (boot.corruptError) toast.show(boot.corruptError)
    else if (boot.restoredBackupKey) toast.show('已从最近备份恢复')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ type?: string; theme?: string }>) => {
      const data = event.data
      if (!data || typeof data !== 'object' || data.type !== 'asset-preview:config') return
      if (data.theme === 'light' || data.theme === 'dark') setPreviewTheme(data.theme)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const effectiveTheme = useMemo(() => {
    if (previewTheme) return previewTheme
    if (ledger.settings.theme === 'system') return systemDark ? 'dark' : 'light'
    return ledger.settings.theme
  }, [previewTheme, ledger.settings.theme, systemDark])

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) themeColor.setAttribute('content', effectiveTheme === 'dark' ? '#000000' : '#F2F2F7')
  }, [effectiveTheme])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [tab, month])

  const changeTab = (next: TabKey) => {
    setTab(next)
    actions.updateSettings({ lastTab: next })
  }

  const openEntry = (key?: string) => {
    setEntryMonth(key && /^\d{4}-\d{2}$/.test(key) ? key : month)
    setEntryOpen(true)
  }

  const onMigrated = (migrated: LedgerV2) => {
    const latest = latestSnapshot(migrated)
    const key = latest ? snapshotKey(latest) : currentMonthKey()
    setMonth(key)
    setTab('overview')
    setMigrateOpen(false)
    const total = latest ? totalOf(latest, migrated) : 0
    setMigrationResult({ months: migrated.snapshots.length, accounts: migrated.accounts.length, total })
  }

  const content =
    tab === 'overview' ? (
      <Overview
        month={month}
        onMonthChange={setMonth}
        onPickMonth={() => setPickerOpen(true)}
        onOpenEntry={openEntry}
        onOpenFlow={() => setFlowOpen(true)}
      />
    ) : tab === 'reports' ? (
      <ReportsScreen month={month} onPickMonth={() => setPickerOpen(true)} />
    ) : tab === 'history' ? (
      <HistoryScreen onOpenEntry={openEntry} />
    ) : (
      <SettingsScreen
        legacyCandidate={boot.legacyCandidate}
        legacyRaw={boot.legacyRaw}
        onMigrate={() => setMigrateOpen(true)}
      />
    )

  return (
    <div className="app-shell">
      <main className="app-main">{content}</main>
      <TabBar tab={tab} onChange={changeTab} onAdd={() => openEntry(currentMonthKey())} />

      <EntrySheet
        open={entryOpen}
        month={entryMonth}
        onClose={() => setEntryOpen(false)}
        onSaved={(savedMonth) => {
          setMonth(savedMonth)
          changeTab('overview')
        }}
      />

      <MonthFlowSheet open={flowOpen} month={month} onClose={() => setFlowOpen(false)} />

      <MonthPicker
        open={pickerOpen}
        value={month}
        onClose={() => setPickerOpen(false)}
        onSelect={setMonth}
        markedKeys={ledger.snapshots.map((snapshot) => snapshotKey(snapshot))}
      />

      <MigrateSheet
        open={migrateOpen}
        raw={boot.legacyRaw}
        onClose={() => setMigrateOpen(false)}
        onMigrated={onMigrated}
      />

      <Sheet
        open={migrationResult !== null}
        onClose={() => setMigrationResult(null)}
        title="迁移完成"
        subtitle="旧数据已保留，可随时导出"
        footer={
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setMigrationResult(null)}>
            去总览
          </button>
        }
      >
        {migrationResult && (
          <div className="card" style={{ padding: 16 }}>
            <div className="tiny faint">最新总资产</div>
            <div className="money" style={{ fontSize: 30, fontWeight: 800, marginTop: 2 }}>
              {formatMoney(migrationResult.total)}
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {migrationResult.months} 个月 · {migrationResult.accounts} 个账户
            </div>
            <div className="tiny faint" style={{ marginTop: 12, lineHeight: 1.6 }}>
              原始数据仍在旧键里。你可以到「设置 → 旧版数据」导出 JSON 作为双保险。
            </div>
          </div>
        )}
      </Sheet>

      {refreshVisible && (
        <div className="update-banner">
          <span style={{ flex: 1 }}>新版本可用</span>
          <button
            onClick={() => {
              setRefreshVisible(false)
              needRefresh[1](false)
            }}
          >
            稍后
          </button>
          <button
            className="primary"
            onClick={() => {
              void updateServiceWorker(true)
            }}
          >
            立即刷新
          </button>
        </div>
      )}
    </div>
  )
}
