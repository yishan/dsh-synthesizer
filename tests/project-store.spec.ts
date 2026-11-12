import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../src/schema.ts'
import { saveProject } from '../src/client/api.ts'
import { DEFAULT_SYNTH_PATCHES } from '../src/client/instruments.ts'
import { SONG_PRESETS } from '../src/client/presets.ts'
import { ProjectClient } from '../src/client/project-store.ts'

/** In-memory stand-in for the Host routes. `strictV1` rejects `synth` like the first schema did. */
function installHost(options: { strictV1?: boolean } = {}): { saved: Map<string, Project>; posts: Project[] } {
  const saved = new Map<string, Project>()
  const posts: Project[] = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://127.0.0.1')
    if (init?.method === 'POST') {
      const project = JSON.parse(String(init.body)) as Project
      posts.push(project)
      if (options.strictV1 === true && project.tracks.some((track) => track.synth !== undefined)) {
        return Response.json({ ok: false, error: 'invalid_project' }, { status: 400 })
      }
      saved.set(project.id, project)
      return Response.json({ ok: true, project })
    }
    const id = url.searchParams.get('id')
    if (id === null) {
      return Response.json({ ok: true, projects: [...saved.values()].map((p) => ({ id: p.id, name: p.name, updatedAt: '' })) })
    }
    const project = saved.get(id)
    return project === undefined
      ? Response.json({ ok: false, error: 'not_found' }, { status: 404 })
      : Response.json({ ok: true, project })
  })
  return { saved, posts }
}

function noteCounts(project: Project): number[] {
  return project.tracks.map((track) => track.notes.length)
}

describe('project client', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('stores synth patches in the project, and falls back for a Host that rejects them', async () => {
    const patch = { ...DEFAULT_SYNTH_PATCHES.lead!, cutoff: 432 }
    const project: Project = {
      version: 1, id: 'tone', name: 'tone', bpm: 120, beatsPerBar: 4, bars: 1, loop: true,
      tracks: [{ id: 'lead', name: 'lead', instrumentId: 'lead', mute: false, gain: 0.7, synth: patch, notes: [] }],
    }
    const host = installHost()
    await saveProject(project)
    expect(host.saved.get('tone')?.tracks[0]?.synth?.cutoff).toBe(432)

    const old = installHost({ strictV1: true })
    const result = await saveProject(project)
    expect(old.posts).toHaveLength(2)
    expect(old.saved.get('tone')?.tracks[0]?.synth).toBeUndefined()
    expect(result.tracks[0]?.synth?.cutoff).toBe(432)
  })

  it('undoes a bar-count clip and groups rapid edits into one step', async () => {
    installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const before = noteCounts(client.getState().project)
    expect(client.getState().canUndo).toBe(false)

    client.setBars(1)
    expect(noteCounts(client.getState().project)).not.toEqual(before)
    client.undo()
    expect(noteCounts(client.getState().project)).toEqual(before)
    expect(client.getState().project.bars).toBe(4)
    expect(client.getState().canUndo).toBe(false)

    // A slider drag is one step; separate note edits stay separate even when fast.
    const trackId = client.getState().project.tracks[1]?.id ?? ''
    const gain = (): number | undefined => client.getState().project.tracks[1]?.gain
    const startGain = gain()
    client.updateTrack(trackId, { gain: 0.1 })
    client.updateTrack(trackId, { gain: 0.2 })
    client.updateTrack(trackId, { gain: 0.3 })
    client.upsertTrackNote(trackId, { pitch: 50, startBeat: 0, durationBeats: 0.25, velocity: 100 })
    client.upsertTrackNote(trackId, { pitch: 52, startBeat: 0, durationBeats: 0.25, velocity: 100 })
    const withBoth = noteCounts(client.getState().project)[1] ?? 0
    client.undo()
    expect(noteCounts(client.getState().project)[1]).toBe(withBoth - 1)
    client.undo()
    expect(gain()).toBe(0.3)
    client.undo()
    expect(gain()).toBe(startGain)
    expect(client.getState().canUndo).toBe(false)
  })

  it('opens a preset in place when untouched, and as a new project once edited', async () => {
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const firstId = client.getState().project.id
    const [presetA, presetB] = SONG_PRESETS
    if (presetA === undefined || presetB === undefined) throw new Error('presets missing')

    await client.loadSongPreset(presetB.id)
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.getState().project.id).toBe(firstId)
    expect(host.saved.size).toBe(1)

    client.setBpm(77)
    await client.loadSongPreset(presetA.id)
    expect(client.getState().project.id).not.toBe(firstId)
    expect(host.saved.size).toBe(2)
    expect(host.saved.get(firstId)?.bpm).toBe(77)
    expect(client.getState().canUndo).toBe(false)
  })

  it('retries a failed load and never saves the placeholder project', async () => {
    const posts: unknown[] = []
    vi.stubGlobal('fetch', async (_input: string, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push(init.body)
      return new Response('gateway down', { status: 502 })
    })
    const client = new ProjectClient()
    await client.hydrate()
    expect(client.getState().ready).toBe(false)
    expect(client.getState().loadFailed).toBe(true)
    expect(client.getState().error).toBe('HTTP 502')

    client.setBpm(99)
    await vi.advanceTimersByTimeAsync(1000)
    expect(posts).toHaveLength(0)

    const host = installHost()
    await client.hydrate()
    expect(client.getState().ready).toBe(true)
    expect(client.getState().loadFailed).toBe(false)
    expect(client.getState().error).toBeNull()
    expect(host.saved.has('draft')).toBe(false)
    expect(host.saved.size).toBe(1)
  })
})
