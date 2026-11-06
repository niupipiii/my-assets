import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { bootState } from './store/boot'
import { createLedgerStore } from './store/ledgerStore'
import { LedgerProvider } from './store/LedgerProvider'
import { ToastProvider } from './components/Toast'
import {
  applyPreviewConfig,
  installPreviewBridge,
  notifyParentReady,
  readPreviewConfig,
} from './lib/preview'

const preview = readPreviewConfig()
applyPreviewConfig(preview)
installPreviewBridge()
notifyParentReady()

const boot = bootState()

const initialTheme =
  preview.theme ??
  (boot.ledger.settings.theme === 'system'
    ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : boot.ledger.settings.theme)
document.documentElement.dataset.theme = initialTheme

const store = createLedgerStore(boot.ledger, {
  persist: !boot.demo,
  onPersistError: (message) => {
    console.error(message)
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('root element missing')

createRoot(container).render(
  <ToastProvider>
    <LedgerProvider store={store}>
      <App boot={boot} />
    </LedgerProvider>
  </ToastProvider>,
)
