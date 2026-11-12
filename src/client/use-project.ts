import { useSyncExternalStore } from 'react'
import { getProjectStore, type SessionState } from './project-store.ts'

/** Subscribe to the module-level project shared with the sidebar transport. */
export function useProject(): SessionState {
  const store = getProjectStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
