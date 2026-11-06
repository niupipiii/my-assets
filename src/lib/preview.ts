export interface PreviewConfig {
  enabled: boolean
  demo: boolean
  theme: 'light' | 'dark' | null
  device: string | null
  insetTop: number | null
  insetBottom: number | null
}

function numberParam(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function readPreviewConfig(search = window.location.search): PreviewConfig {
  const params = new URLSearchParams(search)
  const enabled = params.get('preview') === '1'
  const demoParam = params.get('demo')
  const demo = demoParam === '1' ? true : demoParam === '0' ? false : enabled
  const themeParam = params.get('theme')
  const theme = themeParam === 'light' || themeParam === 'dark' ? themeParam : null
  return {
    enabled,
    demo,
    theme,
    device: params.get('device'),
    insetTop: numberParam(params.get('insetTop')),
    insetBottom: numberParam(params.get('insetBottom')),
  }
}

export function applyPreviewConfig(config: PreviewConfig): void {
  if (!config.enabled) return
  const root = document.documentElement
  root.dataset.preview = '1'
  if (config.insetTop !== null) root.style.setProperty('--safe-top', `${config.insetTop}px`)
  if (config.insetBottom !== null) root.style.setProperty('--safe-bottom', `${config.insetBottom}px`)
  if (config.theme) root.dataset.previewTheme = config.theme
  if (config.device) root.dataset.previewDevice = config.device
}

interface PreviewMessage {
  type?: string
  insetTop?: number
  insetBottom?: number
  theme?: 'light' | 'dark'
  device?: string
}

export function installPreviewBridge(): () => void {
  const onMessage = (event: MessageEvent<PreviewMessage>) => {
    const data = event.data
    if (!data || typeof data !== 'object' || data.type !== 'asset-preview:config') return
    const root = document.documentElement
    if (typeof data.insetTop === 'number') root.style.setProperty('--safe-top', `${data.insetTop}px`)
    if (typeof data.insetBottom === 'number') {
      root.style.setProperty('--safe-bottom', `${data.insetBottom}px`)
    }
    if (data.theme === 'light' || data.theme === 'dark') root.dataset.previewTheme = data.theme
    if (typeof data.device === 'string') root.dataset.previewDevice = data.device
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

export function notifyParentReady(): void {
  try {
    window.parent?.postMessage({ type: 'asset-preview:ready' }, '*')
  } catch {
    // ignore cross-origin failures
  }
}
