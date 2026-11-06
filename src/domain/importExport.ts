import { categoryOf } from './categories'
import { accountById, monthMetrics, snapshotKey, sortedSnapshots } from './selectors'
import { parseLedgerJson } from './validation'
import type { LedgerV2 } from './types'

export function serializeLedger(ledger: LedgerV2): string {
  return JSON.stringify(
    {
      app: 'asset-panorama',
      exportedAt: new Date().toISOString(),
      ledger,
    },
    null,
    2,
  )
}

export function deserializeLedger(text: string): ReturnType<typeof parseLedgerJson> {
  return parseLedgerJson(text)
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildCsv(ledger: LedgerV2): string {
  const header = [
    '年份',
    '月份',
    '分类',
    '账户',
    '余额',
    '本月工资',
    '本月净开销',
    '机构',
    '标签',
  ]
  const rows: string[] = [header.join(',')]
  for (const snapshot of sortedSnapshots(ledger)) {
    const key = snapshotKey(snapshot)
    const metrics = monthMetrics(ledger, key)
    for (const [accountId, value] of Object.entries(snapshot.balances)) {
      const account = accountById(ledger, accountId)
      if (!account) continue
      rows.push(
        [
          snapshot.year,
          snapshot.month,
          categoryOf(account.category).label,
          account.name,
          value,
          metrics.salary ?? '',
          metrics.netSpend ?? '',
          account.institution ?? '',
          account.tags.join('|'),
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return rows.join('\n')
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function shareOrDownload(
  filename: string,
  content: string,
  mime: string,
  title: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([content], filename, { type: mime })
  const nav = navigator as Navigator & {
    canShare?: (data?: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
  }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'shared'
      }
    }
  }
  downloadText(filename, content, mime)
  return 'downloaded'
}

export async function readTextFile(file: File): Promise<string> {
  return file.text()
}

export function backupFilename(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `资产全景-备份-${stamp}.json`
}
