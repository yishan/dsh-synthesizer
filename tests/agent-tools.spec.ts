import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { registerAgentTools, registerPromptSection, registerSlashCommands } from '../src/agent-tools.ts'
import { ProjectStore } from '../src/store.ts'
import { SyncTracker } from '../src/sync.ts'

interface RegisteredTool {
  name: string
  execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown>
}

describe('agent tools & prompt integration', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeStore(): { store: ProjectStore; tracker: SyncTracker } {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-synth-tools-'))
    dirs.push(dir)
    return {
      store: new ProjectStore(pathToFileURL(join(dir, '/')).href),
      tracker: new SyncTracker(),
    }
  }

  it('registers all 4 tools and prompt section and executes save/update/list/get', async () => {
    const { store, tracker } = makeStore()
    const tools = new Map<string, RegisteredTool>()
    const sections: Array<{ name: string; order: number; text: string; interpolate?: boolean }> = []

    const fakeCtx = {
      get(key: string) {
        if (key === 'tools') {
          return {
            register(def: RegisteredTool) {
              tools.set(def.name, def)
              return () => { tools.delete(def.name) }
            },
          }
        }
        if (key === 'systemPrompt') {
          return {
            section(sec: { name: string; order: number; text: string; interpolate?: boolean }) {
              sections.push(sec)
              return () => {}
            },
          }
        }
        return undefined
      },
      effect(fn: () => () => void) { fn() },
    } as unknown as Context

    expect(registerAgentTools(fakeCtx, store, tracker)).toBe(4)
    expect(registerPromptSection(fakeCtx)).toBe(true)
    expect(sections[0]?.name).toBe('dsh-synthesizer:composition')
    expect(sections[0]?.interpolate).toBe(false)

    const signal = new AbortController().signal
    const saveTool = tools.get('synthesizer_save_project')!
    const savedRes = await saveTool.execute({
      id: 'ai-synthwave',
      name: 'AI Night Drive',
      bpm: 124,
      bars: 4,
      scaleRoot: 5,
      scaleId: 'minor',
      tracks: [
        {
          id: 'drums',
          name: '鼓组',
          instrumentId: 'drums',
          kit: '808',
          notes: [
            { pitch: 36, startBeat: 0, durationBeats: 0.25, velocity: 118 },
            { pitch: 38, startBeat: 1, durationBeats: 0.25, velocity: 110 },
          ],
        },
        {
          id: 'bass',
          name: '贝斯',
          instrumentId: 'bass',
          pan: -0.25,
          synth: {
            waveform: 'sawtooth',
            cutoff: 920,
            lfoTarget: 'filter',
            lfoRate: 0.3,
            lfoDepth: 0.4,
          },
          notes: [
            { pitch: 41, startBeat: 0, durationBeats: 0.5, velocity: 105 },
          ],
        },
      ],
    }, { signal }) as { ok: boolean; projectId: string; revision: number }

    expect(savedRes.ok).toBe(true)
    expect(savedRes.projectId).toBe('ai-synthwave')
    expect(savedRes.revision).toBe(1)
    expect(tracker.snapshot().lastToolProjectId).toBe('ai-synthwave')

    // Update single track via synthesizer_update_track
    const updateTool = tools.get('synthesizer_update_track')!
    const updatedRes = await updateTool.execute({
      projectId: 'ai-synthwave',
      trackId: 'lead',
      name: '主音',
      instrumentId: 'lead',
      pan: 0.3,
      notes: [
        { pitch: 72, startBeat: 0, durationBeats: 1, velocity: 100 },
      ],
    }, { signal }) as { ok: boolean; trackId: string; notes: number; revision: number }

    expect(updatedRes.ok).toBe(true)
    expect(updatedRes.trackId).toBe('lead')
    expect(updatedRes.notes).toBe(1)
    expect(updatedRes.revision).toBe(2)

    // List & Get
    const listRes = await tools.get('synthesizer_list_projects')!.execute({}, { signal }) as {
      projects: Array<{ id: string; tracks: number }>
      sync: { revision: number }
    }
    expect(listRes.projects).toHaveLength(1)
    expect(listRes.projects[0]?.tracks).toBe(3)
    expect(listRes.sync.revision).toBe(2)

    const getRes = await tools.get('synthesizer_get_project')!.execute({ id: 'ai-synthwave' }, { signal }) as {
      project: {
        tracks: Array<{
          id: string
          pan?: number
          kit?: string
          synth?: { waveform?: string; cutoff?: number; lfoTarget?: string }
        }>
      }
    }
    expect(getRes.project.tracks.find((t) => t.id === 'lead')?.pan).toBe(0.3)
    expect(getRes.project.tracks.find((t) => t.id === 'drums')?.kit).toBe('808')
    expect(getRes.project.tracks.find((t) => t.id === 'bass')?.synth).toMatchObject({
      waveform: 'sawtooth',
      cutoff: 920,
      lfoTarget: 'filter',
    })

    // Rejects empty tracks
    await expect(saveTool.execute({ name: 'Empty', tracks: [] }, { signal })).rejects.toThrow(/tracks/)
  })

  it('registers /synth slash command and supports prompt followup, list, groove, and help', async () => {
    const { store, tracker } = makeStore()
    const followups: Array<{ role: string; content: Array<{ type: string; text: string }> }> = []
    let registeredHandler: ((invocation: {
      rawInput: string
      agent?: { followup?: (msg: { role: string; content: Array<{ type: string; text: string }> }) => void }
    }) => Promise<{ kind: string; text?: string }>) | undefined

    const fakeCtx = {
      get(key: string) {
        if (key === 'commands') {
          return {
            register(def: { name: string; handler: typeof registeredHandler }) {
              if (def.name === 'synth') registeredHandler = def.handler
              return () => {}
            },
          }
        }
        return undefined
      },
      effect(fn: () => () => void) { fn() },
    } as unknown as Context

    expect(registerSlashCommands(fakeCtx, store, tracker)).toBe(true)
    expect(registeredHandler).toBeDefined()

    const grooveRes = await registeredHandler!({ rawInput: 'groove 128' })
    expect(grooveRes.kind).toBe('success')
    expect(grooveRes.text).toContain('128 BPM')
    expect(tracker.snapshot().revision).toBe(1)

    const listRes = await registeredHandler!({ rawInput: 'list' })
    expect(listRes.kind).toBe('success')
    expect(listRes.text).toContain('Quick Groove 128 BPM')

    const helpRes = await registeredHandler!({ rawInput: 'help' })
    expect(helpRes.kind).toBe('success')

    const promptRes = await registeredHandler!({
      rawInput: '写一首 124 BPM 的 Synthwave 伴奏',
      agent: { followup: (msg) => { followups.push(msg) } },
    })
    expect(promptRes.kind).toBe('success')
    expect(followups).toHaveLength(1)
    expect(followups[0]?.content[0]?.text).toContain('synthesizer_save_project')
    expect(followups[0]?.content[0]?.text).toContain('124 BPM')

    // Natural language starting with "groove" still routes to model instead of instant groove
    const grooveTextRes = await registeredHandler!({
      rawInput: 'groove style lo-fi beat',
      agent: { followup: (msg) => { followups.push(msg) } },
    })
    expect(grooveTextRes.kind).toBe('success')
    expect(followups).toHaveLength(2)

    const noAgentRes = await registeredHandler!({ rawInput: '写一首 124 BPM 的 Synthwave 伴奏' })
    expect(noAgentRes.kind).toBe('error')
  })
})
