/**
 * Whether the host sidebar is expanded. The only signal a plugin gets is the
 * `wide` prop on its own sidebar slot, so the sidebar transport reports it here
 * and the editor reads it to keep clear of the window controls.
 */
import { useSyncExternalStore } from 'react'

let wide = true
const listeners = new Set<() => void>()

export function setSidebarWide(next: boolean): void {
  if (next === wide) return
  wide = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useSidebarWide(): boolean {
  return useSyncExternalStore(subscribe, () => wide, () => wide)
}
