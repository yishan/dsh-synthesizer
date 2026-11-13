/**
 * dsh-synthesizer Host half.
 *
 * Stores piano-roll projects under the profile and serves them on the
 * authenticated connection channel. Playback stays in the browser.
 *
 * @module dsh-synthesizer
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerAgentTools, registerPromptSection, registerSlashCommands } from './agent-tools.ts'
import { registerRoutes } from './routes.ts'
import { ProjectStore } from './store.ts'
import { SyncTracker } from './sync.ts'
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
  const tracker = new SyncTracker()
  ctx.inject(['connection'], (connectionCtx) => {
    registerRoutes(connectionCtx, projects, tracker)
  })
  ctx.inject(['tools'], (toolsCtx) => {
    registerAgentTools(toolsCtx, projects, tracker)
  })
  ctx.inject(['systemPrompt'], (promptCtx) => {
    registerPromptSection(promptCtx)
  })
  ctx.inject(['commands'], (commandsCtx) => {
    registerSlashCommands(commandsCtx, projects, tracker)
  })
}
