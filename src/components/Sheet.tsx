import { type ReactNode, useEffect, useRef, useState } from 'react'

let openSheets = 0
let sheetCounter = 0
const sheetStack: number[] = []
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  full?: boolean
  dismissible?: boolean
  headerRight?: ReactNode
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  full = false,
  dismissible = true,
  headerRight,
}: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [active, setActive] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const sheetId = useRef(++sheetCounter)

  useEffect(() => {
    if (open) {
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
      setMounted(true)
      const frame = window.requestAnimationFrame(() => setActive(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setActive(false)
    closeTimer.current = window.setTimeout(() => setMounted(false), 320)
    return () => {
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
    }
  }, [open])

  useEffect(() => {
    if (!mounted) return
    openSheets += 1
    sheetStack.push(sheetId.current)
    document.body.classList.add('sheet-open')
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dismissible) return
      if (sheetStack[sheetStack.length - 1] !== sheetId.current) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      openSheets = Math.max(0, openSheets - 1)
      const index = sheetStack.lastIndexOf(sheetId.current)
      if (index >= 0) sheetStack.splice(index, 1)
      if (openSheets === 0) document.body.classList.remove('sheet-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [mounted, dismissible, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="sheet-layer" data-open={active} role="presentation">
      <div
        className="sheet-backdrop"
        onClick={() => {
          if (dismissible) onClose()
        }}
      />
      <section
        className={`sheet${full ? ' sheet--full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '面板'}
      >
        <div className="sheet-grabber" />
        {(title || headerRight) && (
          <header className="sheet-header">
            <div style={{ minWidth: 0 }}>
              <h2 className="sheet-title">{title}</h2>
              {subtitle && (
                <p className="page-subtitle" style={{ marginTop: 2 }}>
                  {subtitle}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {headerRight}
              {dismissible && (
                <button className="icon-btn icon-btn-plain" onClick={onClose} aria-label="关闭">
                  <X size={19} />
                </button>
              )}
            </div>
          </header>
        )}
        <div className="sheet-body no-scrollbar">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </section>
    </div>,
    document.body,
  )
}
