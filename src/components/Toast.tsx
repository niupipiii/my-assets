import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ToastItem {
  id: number
  message: string
}

interface ToastApi {
  show: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const show = useCallback((message: string) => {
    idRef.current += 1
    const id = idRef.current
    setItems((current) => [...current.slice(-2), { id, message }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {createPortal(
        <div className="toast-host" aria-live="polite">
          {items.map((item) => (
            <div className="toast" key={item.id}>
              {item.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('ToastProvider is missing')
  return ctx
}
