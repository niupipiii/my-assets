import { categoryOf } from '../domain/categories'
import { formatMoney, formatPercent, formatSignedMoney } from '../domain/money'
import { allocationOf, monthLabel, monthMetrics, totalOf, getSnapshot, snapshotKey } from '../domain/selectors'
import type { LedgerV2 } from '../domain/types'

interface ShareData {
  ledger: LedgerV2
  month: string
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

export async function buildMonthReportImage({ ledger, month }: ShareData): Promise<Blob | null> {
  const metrics = monthMetrics(ledger, month)
  const snapshot = getSnapshot(ledger, month)
  if (!snapshot) return null
  const allocation = allocationOf(ledger, month).slice(0, 5)
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const background = ctx.createLinearGradient(0, 0, 1080, 1350)
  background.addColorStop(0, '#4f4dd0')
  background.addColorStop(0.55, '#6f63ee')
  background.addColorStop(1, '#a08cf7')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, 1080, 1350)

  ctx.fillStyle = 'rgba(255,255,255,.12)'
  ctx.beginPath()
  ctx.arc(980, 120, 260, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(120, 1240, 220, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,.82)'
  ctx.font = '600 34px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText('资产全景 · 月报', 84, 122)

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 64px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText(monthLabel(month), 84, 214)

  ctx.fillStyle = 'rgba(255,255,255,.72)'
  ctx.font = '500 32px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText('总资产', 84, 330)

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 92px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText(formatMoney(totalOf(snapshot, ledger)), 80, 432)

  if (metrics.delta !== null) {
    const percent = metrics.prevTotal ? metrics.delta / metrics.prevTotal : null
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.font = '600 36px "PingFang SC", -apple-system, sans-serif'
    ctx.fillText(
      `${metrics.delta >= 0 ? '↑' : '↓'} ${formatSignedMoney(metrics.delta)}${percent !== null ? ` · ${formatPercent(percent)}` : ''} 较上月`,
      84,
      494,
    )
  }

  const cardY = 570
  ctx.fillStyle = 'rgba(255,255,255,.14)'
  roundRect(ctx, 64, cardY, 952, 300, 36)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,.65)'
  ctx.font = '500 28px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText('本月净开销', 108, cardY + 62)
  ctx.fillText('工资', 108, cardY + 186)
  ctx.fillText('投资收益（估算）', 108, cardY + 246)

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 64px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText(
    metrics.netSpend !== null ? formatMoney(metrics.netSpend) : '待补充',
    108,
    cardY + 136,
  )
  ctx.font = '700 34px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText(
    metrics.salary !== null ? formatMoney(metrics.salary) : '待补充',
    620,
    cardY + 192,
  )
  ctx.fillText(
    metrics.investReturn !== null ? formatMoney(metrics.investReturn) : '—',
    620,
    cardY + 252,
  )

  ctx.fillStyle = 'rgba(255,255,255,.62)'
  ctx.font = '600 28px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText('资产配置', 84, 960)

  let y = 1018
  for (const slice of allocation) {
    ctx.fillStyle = slice.color
    ctx.beginPath()
    ctx.arc(100, y - 10, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 30px "PingFang SC", -apple-system, sans-serif'
    ctx.fillText(categoryOf(slice.category).short, 132, y)
    ctx.fillStyle = 'rgba(255,255,255,.78)'
    ctx.font = '600 30px "PingFang SC", -apple-system, sans-serif'
    ctx.fillText(`${(slice.share * 100).toFixed(1)}%`, 900, y)
    y += 54
  }

  ctx.fillStyle = 'rgba(255,255,255,.5)'
  ctx.font = '500 24px "PingFang SC", -apple-system, sans-serif'
  ctx.fillText(`生成于 ${new Date().toLocaleDateString('zh-CN')} · 数据只存在本机`, 84, 1288)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95)
  })
}

export async function shareMonthReport(ledger: LedgerV2, month: string): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await buildMonthReportImage({ ledger, month })
  if (!blob) return 'failed'
  const file = new File([blob], `资产全景-${month}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (data?: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string }) => Promise<void>
  }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${monthLabel(month)}资产月报` })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}

export function reportTitle(ledger: LedgerV2, month: string): string {
  const snapshot = getSnapshot(ledger, month)
  return snapshot ? `${monthLabel(month)} · ${formatMoney(totalOf(snapshot, ledger))}` : monthLabel(month)
}

export function reportKey(month: string): string {
  return snapshotKey({ year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) })
}
