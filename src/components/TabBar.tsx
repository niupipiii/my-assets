import { BarChart3, LayoutDashboard, List, Plus, Settings } from 'lucide-react'

export type TabKey = 'overview' | 'reports' | 'history' | 'settings'

const TABS = [
  { key: 'overview' as const, label: '总览', icon: LayoutDashboard },
  { key: 'reports' as const, label: '报表', icon: BarChart3 },
  { key: 'history' as const, label: '明细', icon: List },
  { key: 'settings' as const, label: '设置', icon: Settings },
]

export function TabBar({
  tab,
  onChange,
  onAdd,
}: {
  tab: TabKey
  onChange: (tab: TabKey) => void
  onAdd: () => void
}) {
  return (
    <nav className="tabbar" aria-label="主导航">
      {TABS.slice(0, 2).map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            className="tab-item"
            data-active={tab === item.key}
            onClick={() => onChange(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={tab === item.key ? 2.4 : 2} />
            <span>{item.label}</span>
          </button>
        )
      })}
      <button className="tab-item" onClick={onAdd} aria-label="记一笔">
        <span className="tab-plus">
          <Plus size={25} strokeWidth={2.6} />
        </span>
      </button>
      {TABS.slice(2).map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            className="tab-item"
            data-active={tab === item.key}
            onClick={() => onChange(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={tab === item.key ? 2.4 : 2} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
