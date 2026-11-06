import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react'
import type { LedgerActions, LedgerStore } from './ledgerStore'

const LedgerContext = createContext<LedgerStore | null>(null)

export function LedgerProvider({ store, children }: { store: LedgerStore; children: ReactNode }) {
  return <LedgerContext.Provider value={store}>{children}</LedgerContext.Provider>
}

function useStore(): LedgerStore {
  const store = useContext(LedgerContext)
  if (!store) throw new Error('LedgerProvider is missing')
  return store
}

export function useLedger() {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}

export function useLedgerActions(): LedgerActions {
  return useStore().actions
}
