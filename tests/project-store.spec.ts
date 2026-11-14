import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../src/schema.ts'
import { saveProject } from '../src/client/api.ts'
import { DEFAULT_SYNTH_PATCHES } from '../src/client/instruments.ts'
import {
  addDrumFill,
  addEuclideanDrumRhythm,
  buildScaleChord,
  CHORD_PROGRESSIONS,
  generateMelodicPattern,
  humanizeNotes,
  isPitchInScale,
  ROOT_NOTES,
  SCALES,
  snapNotesToScale,
  SONG_PRESETS,
} from '../src/client/presets.ts'
import { ProjectClient } from '../src/client/project-store.ts'

/** Minimal in-memory localStorage. */
function installStorage(): Map<string, string> {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  })
  return data
}

/** In-memory stand-in for the Host routes. `strictV1` rejects `synth` like the first schema did. */
function installHost(options: { strictV1?: boolean } = {}): {
  saved: Map<string, Project>
  posts: Project[]
  sync: { revision: number; lastToolProjectId: string | null; lastToolProjectName: string | null; lastToolAt: number }
} {
  const saved = new Map<string, Project>()
  const posts: Project[] = []
  const sync = { revision: 0, lastToolProjectId: null as string | null, lastToolProjectName: null as string | null, lastToolAt: 0 }
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://127.0.0.1')
    if (init?.method === 'POST' && url.pathname.endsWith('/delete')) {
      saved.delete((JSON.parse(String(init.body)) as { id: string }).id)
      return Response.json({ ok: true })
    }
    if (init?.method === 'POST') {
      const project = JSON.parse(String(init.body)) as Project
      posts.push(project)
      const hasNewFields = project.scaleRoot !== undefined
        || project.swing !== undefined
        || project.tracks.some((track) => track.synth !== undefined || track.kit !== undefined)
      if (options.strictV1 === true && hasNewFields) {
        return Response.json({ ok: false, error: 'invalid_project' }, { status: 400 })
      }
      saved.set(project.id, project)
      return Response.json({ ok: true, project })
    }
    const id = url.searchParams.get('id')
    if (id === null) {
      return Response.json({ ok: true, projects: [...saved.values()].map((p) => ({ id: p.id, name: p.name, updatedAt: '' })), sync })
    }
    const project = saved.get(id)
    return project === undefined
      ? Response.json({ ok: false, error: 'not_found' }, { status: 404 })
      : Response.json({ ok: true, project })
  })
  return { saved, posts, sync }
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

  it('keeps project names distinct across new, preset, duplicate, and import', async () => {
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const first = client.getState().project.name
    await client.newProject(false)
    expect(client.getState().project.name).toBe(`${first} 2`)

    client.setBpm(91)
    const [preset] = SONG_PRESETS
    if (preset === undefined) throw new Error('presets missing')
    await client.loadSongPreset(preset.id)
    const names = (): string[] => [...host.saved.values()].map((project) => project.name)
    expect(new Set(names()).size).toBe(names().length)

    const sourceId = client.getState().project.id
    await client.duplicateProject(sourceId)
    expect(client.getState().project.id).not.toBe(sourceId)
    expect(client.getState().project.name).toMatch(/副本$/)
    expect(host.saved.get(client.getState().project.id)?.tracks.length).toBe(host.saved.get(sourceId)?.tracks.length)

    const exported = await client.exportProject(sourceId)
    await client.importProject(JSON.parse(JSON.stringify(exported)) as unknown)
    expect(client.getState().project.id).not.toBe(sourceId)
    expect(new Set(names()).size).toBe(names().length)
    await expect(client.importProject({ hello: 'world' })).rejects.toThrow('invalid_import')
  })

  it('restores a deleted project, and reopens the one that was open last', async () => {
    installStorage()
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const firstId = client.getState().project.id
    client.setBpm(77)
    await client.newProject(true)
    const secondId = client.getState().project.id

    await client.removeProject(firstId)
    expect(host.saved.has(firstId)).toBe(false)
    expect(client.getState().project.id).toBe(secondId)
    expect(client.getState().lastDeleted?.id).toBe(firstId)
    await client.restoreDeleted()
    expect(host.saved.get(firstId)?.bpm).toBe(77)
    expect(client.getState().project.id).toBe(secondId)
    expect(client.getState().projects.some((item) => item.id === firstId)).toBe(true)
    expect(client.getState().lastDeleted).toBeNull()

    await client.removeProject(secondId)
    expect(client.getState().project.id).toBe(firstId)
    await client.restoreDeleted()
    expect(client.getState().project.id).toBe(secondId)

    await client.selectProject(secondId)
    const reopened = new ProjectClient()
    await reopened.hydrate()
    expect(reopened.getState().project.id).toBe(secondId)
  })

  it('saves the scale with the project and remembers view state per project', async () => {
    installStorage()
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const id = client.getState().project.id
    const lastTrack = client.getState().project.tracks.at(-1)?.id ?? ''
    client.setScale(2, 'dorian')
    client.selectTrack(lastTrack)
    client.setOctaveOffset(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(host.saved.get(id)?.scaleRoot).toBe(2)
    expect(host.saved.get(id)?.scaleId).toBe('dorian')
    client.undo()
    expect(client.getState().scaleId).toBe('minor')
    client.setScale(2, 'dorian')
    await vi.advanceTimersByTimeAsync(1000)

    const reopened = new ProjectClient()
    await reopened.hydrate()
    expect(reopened.getState().scaleRoot).toBe(2)
    expect(reopened.getState().scaleId).toBe('dorian')
    expect(reopened.getState().selectedTrackId).toBe(lastTrack)
    expect(reopened.getState().octaveOffset).toBe(1)

    const old = installHost({ strictV1: true })
    const legacy = new ProjectClient()
    await legacy.hydrate()
    legacy.setScale(4, 'major')
    await vi.advanceTimersByTimeAsync(1000)
    expect(old.saved.get(legacy.getState().project.id)?.scaleRoot).toBeUndefined()
    expect(legacy.getState().scaleRoot).toBe(4)
    expect(legacy.getState().saveFailed).toBe(false)
  })

  it('pushes a pending edit out when the page hides, and reports a failed save', async () => {
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const id = client.getState().project.id
    client.setBpm(66)
    expect(host.saved.get(id)?.bpm).not.toBe(66)
    client.flushPending()
    await vi.advanceTimersByTimeAsync(0)
    expect(host.saved.get(id)?.bpm).toBe(66)

    vi.stubGlobal('fetch', async () => new Response('down', { status: 502 }))
    client.setBpm(67)
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.getState().saveFailed).toBe(true)
    installHost()
    await client.flush()
    expect(client.getState().saveFailed).toBe(false)
  })

  it('saves the drum kit with the track, and keeps it against an older Host', async () => {
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const id = client.getState().project.id
    const drums = client.getState().project.tracks.find((track) => track.instrumentId === 'drums')
    const melodic = client.getState().project.tracks.find((track) => track.instrumentId !== 'drums')
    if (drums === undefined || melodic === undefined) throw new Error('starter tracks missing')

    client.setTrackKit(drums.id, '808')
    client.setTrackKit(melodic.id, '808')
    await vi.advanceTimersByTimeAsync(1000)
    const saved = host.saved.get(id)
    expect(saved?.tracks.find((track) => track.id === drums.id)?.kit).toBe('808')
    expect(saved?.tracks.find((track) => track.id === melodic.id)?.kit).toBeUndefined()

    client.updateTrack(drums.id, { instrumentId: 'lead' })
    expect(client.getState().project.tracks.find((track) => track.id === drums.id)?.kit).toBeUndefined()

    const old = installHost({ strictV1: true })
    const legacy = new ProjectClient()
    await legacy.hydrate()
    const legacyDrums = legacy.getState().project.tracks.find((track) => track.instrumentId === 'drums')
    if (legacyDrums === undefined) throw new Error('starter drums missing')
    legacy.setTrackKit(legacyDrums.id, 'lofi')
    await vi.advanceTimersByTimeAsync(1000)
    expect(old.saved.get(legacy.getState().project.id)?.tracks[0]?.kit).toBeUndefined()
    expect(legacy.getState().project.tracks.find((track) => track.id === legacyDrums.id)?.kit).toBe('lofi')
  })

  it('names tracks by role and lets an automatic name follow the instrument', async () => {
    installHost()
    const client = new ProjectClient()
    await client.newProject(true)
    const names = (): string[] => client.getState().project.tracks.map((track) => track.name)
    expect(names()).toEqual(['鼓', '贝斯', '键盘', '主旋律'])

    client.addTrack()
    const added = client.getState().project.tracks.at(-1)
    if (added === undefined) throw new Error('track not added')
    expect(added.name).toBe('酸液')

    client.updateTrack(added.id, { instrumentId: 'bass' })
    expect(names().at(-1)).toBe('贝斯 2')
    client.updateTrack(added.id, { instrumentId: 'bell' })
    expect(names().at(-1)).toBe('铃音')

    client.updateTrack(added.id, { name: '我的铃' })
    client.updateTrack(added.id, { instrumentId: 'pad' })
    expect(names().at(-1)).toBe('我的铃')
  })

  it('saves swing, and edits the velocity of a whole step as one undo step', async () => {
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()
    const id = client.getState().project.id
    client.setSwing(0.33)
    await vi.advanceTimersByTimeAsync(1000)
    expect(host.saved.get(id)?.swing).toBe(0.33)

    const target = client.getState().project.tracks[1]
    if (target === undefined) throw new Error('starter track missing')
    client.setTrackNotes(target.id, [
      { pitch: 48, startBeat: 0, durationBeats: 1, velocity: 100 },
      { pitch: 55, startBeat: 0, durationBeats: 1, velocity: 90 },
      { pitch: 50, startBeat: 1, durationBeats: 1, velocity: 100 },
    ])
    const velocities = (): number[] => client.getState().project.tracks[1]?.notes.map((note) => note.velocity) ?? []
    client.setStepVelocity(target.id, 0, 70)
    client.setStepVelocity(target.id, 0, 60)
    client.setStepVelocity(target.id, 0, 500)
    expect(velocities()).toEqual([127, 127, 100])
    client.undo()
    expect(velocities()).toEqual([100, 90, 100])

    const old = installHost({ strictV1: true })
    const legacy = new ProjectClient()
    await legacy.hydrate()
    legacy.setSwing(0.2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(old.saved.get(legacy.getState().project.id)?.swing).toBeUndefined()
    expect(legacy.getState().project.swing).toBe(0.2)
  })

  it('doubles bars with duplicateBars, tiles bar 1 with repeatFirstBar, and stamps scale chords', async () => {
    installHost()
    const client = new ProjectClient()
    await client.newProject(true)
    const track = client.getState().project.tracks[1]
    if (track === undefined) throw new Error('track missing')

    // Build a C major triad and seventh chord, and insert as one undo step
    expect(buildScaleChord(60, 0, 'major', 'single')).toEqual([60])
    expect(buildScaleChord(60, 0, 'major', 'triad')).toEqual([60, 64, 67])
    expect(buildScaleChord(60, 0, 'major', 'seventh')).toEqual([60, 64, 67, 71])
    expect(buildScaleChord(57, 9, 'minor', 'triad')).toEqual([57, 60, 64])

    const chord = buildScaleChord(60, 0, 'major', 'triad').map((pitch) => ({
      pitch,
      startBeat: 0,
      durationBeats: 1,
      velocity: 96,
    }))
    client.upsertTrackNotes(track.id, chord)
    expect(client.getState().project.tracks[1]?.notes).toHaveLength(3)

    // Repeat bar 1 across 4 bars
    client.repeatFirstBar(track.id)
    expect(client.getState().project.tracks[1]?.notes.map((n) => n.startBeat)).toEqual([
      0, 0, 0, 4, 4, 4, 8, 8, 8, 12, 12, 12,
    ])

    // Double 4 bars to 8 bars
    client.duplicateBars()
    expect(client.getState().project.bars).toBe(8)
    expect(client.getState().project.tracks[1]?.notes).toHaveLength(24)
    expect(client.getState().project.tracks[1]?.notes.at(-1)?.startBeat).toBe(28)

    // Undo duplicateBars restores 4 bars
    client.undo()
    expect(client.getState().project.bars).toBe(4)
    expect(client.getState().project.tracks[1]?.notes).toHaveLength(12)
  })

  it('persists and resets track pan, humanizes note velocities, and generates end-of-loop drum fills', async () => {
    installHost()
    const client = new ProjectClient()
    await client.newProject(true)
    const track = client.getState().project.tracks[1]
    if (track === undefined) throw new Error('track missing')

    // Track pan clamps / clears at center 0
    client.updateTrack(track.id, { pan: -0.35 })
    expect(client.getState().project.tracks[1]?.pan).toBe(-0.35)
    client.updateTrack(track.id, { pan: 0 })
    expect(client.getState().project.tracks[1]?.pan).toBeUndefined()

    // Humanize keeps pitch/timing and varies velocity within [1, 127]
    const baseNotes = [0, 0.5, 1, 1.5, 2, 2.5].map((startBeat) => ({
      pitch: 60,
      startBeat,
      durationBeats: 0.25,
      velocity: 96,
    }))
    const humanized = humanizeNotes(baseNotes, 12)
    expect(humanized).toHaveLength(baseNotes.length)
    expect(humanized.every((n) => n.velocity >= 82 && n.velocity <= 112 && n.pitch === 60)).toBe(true)

    // Drum fill replaces only the final 2 beats of the last bar and adds snare/tom hits
    const existing = [
      { pitch: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 },
      { pitch: 38, startBeat: 14.5, durationBeats: 0.25, velocity: 100 },
    ]
    const withFill = addDrumFill(existing, 4)
    expect(withFill[0]).toEqual(existing[0])
    const fillHits = withFill.filter((n) => n.startBeat >= 14)
    expect(fillHits.length).toBeGreaterThanOrEqual(4)
    expect(fillHits.every((n) => n.startBeat < 16)).toBe(true)
  })

  it('auto-loads tool-generated projects when idle and surfaces a prompt when local edits are pending', async () => {
    const host = installHost()
    const client = new ProjectClient()
    await client.hydrate()

    // Simulate a tool creating a new song while editor is idle
    const toolProject: Project = {
      ...client.getState().project,
      id: 'tool-song-1',
      name: 'Session Beat 1',
      bpm: 132,
    }
    host.saved.set(toolProject.id, toolProject)
    host.sync.revision = 1
    host.sync.lastToolProjectId = toolProject.id
    host.sync.lastToolProjectName = toolProject.name
    host.sync.lastToolAt = 1000

    await client.checkForExternalUpdates()
    expect(client.getState().project.id).toBe('tool-song-1')
    expect(client.getState().project.bpm).toBe(132)
    expect(client.getState().pendingToolProject).toBeNull()

    // Now make a pending local edit (unflushed debounce timer) and simulate another tool song
    client.setBpm(140)
    const toolProject2: Project = {
      ...toolProject,
      id: 'tool-song-2',
      name: 'Session Beat 2',
      bpm: 96,
    }
    host.saved.set(toolProject2.id, toolProject2)
    host.sync.revision = 2
    host.sync.lastToolProjectId = toolProject2.id
    host.sync.lastToolProjectName = toolProject2.name
    host.sync.lastToolAt = 2000

    await client.checkForExternalUpdates()
    expect(client.getState().project.id).toBe('tool-song-1')
    expect(client.getState().pendingToolProject).toEqual({ id: 'tool-song-2', name: 'Session Beat 2' })

    await client.acceptPendingToolProject()
    expect(client.getState().project.id).toBe('tool-song-2')
    expect(client.getState().pendingToolProject).toBeNull()
  })

  it('exposes 12 chromatic roots, 8 scales, and applies smooth voice leading to chord progressions', () => {
    expect(ROOT_NOTES.map((r) => r.semitone)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(SCALES.map((s) => s.id)).toEqual([
      'minor',
      'major',
      'dorian',
      'mixolydian',
      'phrygian',
      'pentatonic',
      'blues',
      'chromatic',
    ])

    const notes = generateMelodicPattern('chords', 4, 0, 'minor', [0, 5, 3, 4])
    const barUpperMeans: number[] = []
    for (let bar = 0; bar < 4; bar += 1) {
      const chord = notes
        .filter((note) => note.startBeat === bar * 4)
        .map((note) => note.pitch)
        .sort((a, b) => a - b)
      expect(chord.length).toBeGreaterThanOrEqual(3)
      const [bass, ...upper] = chord
      expect(bass).toBeGreaterThanOrEqual(48)
      expect(bass).toBeLessThanOrEqual(59)
      for (const pitch of upper) {
        expect(pitch).toBeGreaterThanOrEqual(56)
        expect(pitch).toBeLessThanOrEqual(76)
      }
      barUpperMeans.push(upper.reduce((sum, p) => sum + p, 0) / upper.length)
    }

    for (let i = 1; i < barUpperMeans.length; i += 1) {
      expect(Math.abs(barUpperMeans[i]! - barUpperMeans[i - 1]!)).toBeLessThan(5)
    }
  })

  it('snaps out-of-scale notes to the active scale and generates progressions across CHORD_PROGRESSIONS', () => {
    // C major: [0, 2, 4, 5, 7, 9, 11]. 61 (C#4) and 66 (F#4) are out of scale.
    // Colliding 60 (C4, dur 0.25) and 61 (C#4 -> 60, dur 1.0) should keep the longer note.
    const snapped = snapNotesToScale([
      { pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 80 },
      { pitch: 61, startBeat: 0, durationBeats: 1, velocity: 100 },
      { pitch: 66, startBeat: 1, durationBeats: 0.5, velocity: 90 },
    ], 0, 'major')

    expect(snapped).toHaveLength(2)
    expect(snapped.every((note) => isPitchInScale(note.pitch, 0, 'major'))).toBe(true)
    expect(snapped[0]).toEqual({ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 })
    expect(snapped[1]?.pitch).toBe(65)

    // Verify all 5 chord progression presets produce harmonic patterns following the progression roots
    expect(CHORD_PROGRESSIONS.map((p) => p.id)).toEqual(['neon', 'pop', 'royal', 'jazz', 'dark'])
    const popProg = CHORD_PROGRESSIONS.find((p) => p.id === 'pop')!
    const jazzProg = CHORD_PROGRESSIONS.find((p) => p.id === 'jazz')!
    const popBass = generateMelodicPattern('octaveBass', 4, 0, 'major', popProg.degrees)
    const jazzBass = generateMelodicPattern('octaveBass', 4, 0, 'major', jazzProg.degrees)
    const bar1RootPop = popBass.find((n) => n.startBeat === 4)?.pitch
    const bar1RootJazz = jazzBass.find((n) => n.startBeat === 4)?.pitch
    // Bar 2 (startBeat 4): Pop I-V-vi-IV has V (G=43), Jazz ii-V-I-vi also has V (43), Bar 1 (startBeat 0) differs: I (36) vs ii (38)
    expect(popBass.find((n) => n.startBeat === 0)?.pitch).toBe(36)
    expect(jazzBass.find((n) => n.startBeat === 0)?.pitch).toBe(38)
    expect(bar1RootPop).toBe(43)
    expect(bar1RootJazz).toBe(43)
  })

  it('overlays E(5,16) Euclidean drum rhythm cleanly without erasing kick/snare hits', () => {
    const existing = [
      { pitch: 36, startBeat: 0, durationBeats: 0.25, velocity: 115 },
      { pitch: 38, startBeat: 1, durationBeats: 0.25, velocity: 110 },
      { pitch: 37, startBeat: 0.5, durationBeats: 0.25, velocity: 90 },
    ]
    const result = addEuclideanDrumRhythm(existing, 2, 5, 16)
    // Existing kick and snare stay intact
    expect(result.filter((n) => n.pitch === 36)).toHaveLength(1)
    expect(result.filter((n) => n.pitch === 38)).toHaveLength(1)
    // E(5, 16) across 2 bars produces 5 * 2 = 10 evenly distributed Rimshot hits, replacing old rimshots
    const rims = result.filter((n) => n.pitch === 37)
    expect(rims).toHaveLength(10)
    expect(rims.slice(0, 5).map((n) => n.startBeat)).toEqual([0, 1, 1.75, 2.5, 3.25])
    // Plus 1 open-hat accent on the 2nd bar's final pulse (7.25)
    expect(result.some((n) => n.pitch === 46 && n.startBeat === 7.25)).toBe(true)
  })
})
