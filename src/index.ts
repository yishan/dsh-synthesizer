/**
 * dsh-synthesizer Host half.
 *
 * Stores piano-roll projects under the profile and serves them on the
 * authenticated connection channel. Playback stays in the browser.
 *
 * @module dsh-synthesizer
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerRoutes } from './routes.ts'
import { ProjectStore } from './store.ts'
import { VERSION } from './version.ts'

/** Plugin name used by the bundle patch and the client bundle. */
export const name = 'dsh-synthesizer'

export { VERSION }

/**
 * Mount the Host half.
 * @param ctx - Cordis context of the plugin fiber.
 */
export function apply(ctx: Context): void {
  const projects = new ProjectStore(typeof ctx.baseUrl === 'string' ? ctx.baseUrl : undefined)
  ctx.inject(['connection'], (connectionCtx) => {
    registerRoutes(connectionCtx, projects)
  })
}
