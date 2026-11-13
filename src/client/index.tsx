/**
 * dsh-synthesizer browser half.
 *
 * The audio engine is created here, not inside the editor page, so a loop
 * keeps playing after the user returns to the conversation.
 *
 * @module dsh-synthesizer/client
 */
import { createElement } from 'react'
import { VERSION } from '../version.ts'
import { Editor } from './Editor.tsx'
import { getEngine } from './engine.ts'
import { getProjectStore } from './project-store.ts'
import { SidebarIcon } from './SidebarIcon.tsx'
import { Transport } from './Transport.tsx'

const PANEL_ID = 'dsh-synthesizer'

interface SlotsService {
  inject: (name: string, callback: () => unknown) => unknown
  register: (
    entry: {
      name: string
      id?: string
      key?: string
      order?: number
      label?: () => string
    },
    component: (props: Record<string, unknown>) => unknown,
  ) => unknown
}

interface ClientContext {
  get: (name: string) => unknown
  on?: (name: string, callback: () => void) => unknown
}

/** Cordis client fiber dependency: the slot registry. */
export const inject = ['slots']

/**
 * Mount the browser half.
 * @param ctx - Cordis client context.
 */
export function apply(ctx: ClientContext): void {
  const slots = ctx.get('slots') as SlotsService | undefined
  const prev = (globalThis as { __dshSynthesizer?: { version: string; mountedAt: number; dispose?: () => void } }).__dshSynthesizer
  prev?.dispose?.()
  const store = getProjectStore()
  const engine = getEngine()
  const disposeAll = (): void => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onPageHide)
    store.stopSyncPolling()
    store.flushPending()
    engine.dispose()
  }
  ;(globalThis as { __dshSynthesizer?: { version: string; mountedAt: number; dispose?: () => void } }).__dshSynthesizer = {
    version: VERSION,
    mountedAt: Date.now(),
    dispose: disposeAll,
  }
  void store.hydrate()
  // The save is debounced; do not let a hidden or closing page take the last edit with it.
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') store.flushPending()
  }
  const onPageHide = (): void => { store.flushPending() }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onPageHide)
  if (typeof ctx.on === 'function') {
    ctx.on('dispose', disposeAll)
  }
  if (slots === undefined) {
    console.error('[dsh-synthesizer] client mounted without the slots service')
    return
  }

  const mount = (label: string, callback: () => unknown): void => {
    try {
      callback()
    } catch (error) {
      console.error(`[dsh-synthesizer] failed to mount ${label}`, error)
    }
  }

  mount('main', () =>
    slots.inject('main', () =>
      slots.register({ name: 'main', key: PANEL_ID }, () => createElement(Editor)),
    ),
  )
  mount('sidebar.panellist', () =>
    slots.inject('sidebar.panellist', () =>
      slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => '合成器' },
        (props) => createElement(SidebarIcon, { size: typeof props.size === 'number' ? props.size : undefined }),
      ),
    ),
  )
  mount('sidebar.footer.action', () =>
    slots.inject('sidebar.footer.action', () =>
      slots.register(
        { name: 'sidebar.footer.action', id: 'dsh-synthesizer-transport', order: 20 },
        (props) => createElement(Transport, { variant: 'sidebar', wide: props.wide !== false }),
      ),
    ),
  )
}
