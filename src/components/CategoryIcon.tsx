import {
  Bitcoin,
  Home,
  Landmark,
  Package,
  PieChart,
  PiggyBank,
  Shield,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { CategoryKey } from '../domain/types'
import { categoryOf } from '../domain/categories'

const ICONS = {
  wallet: Wallet,
  'trending-up': TrendingUp,
  'pie-chart': PieChart,
  'piggy-bank': PiggyBank,
  landmark: Landmark,
  home: Home,
  shield: Shield,
  bitcoin: Bitcoin,
  package: Package,
} as const

export function CategoryIcon({
  category,
  size = 34,
  plain = false,
}: {
  category: CategoryKey
  size?: number
  plain?: boolean
}) {
  const def = categoryOf(category)
  const Icon = ICONS[def.icon as keyof typeof ICONS] ?? Package
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        background: plain ? 'transparent' : `${def.color}1f`,
        color: plain ? def.color : def.color,
      }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={2.1} />
    </span>
  )
}
