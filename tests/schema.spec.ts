import { describe, expect, it } from 'vitest'
import {
  MAX_NOTES_PER_TRACK,
  MAX_TRACKS,
  clipToBars,
  createDefaultProject,
  projectSchema,
  removeNoteAt,
  sanitizeProject,
  toggleCell,
  upsertNote,
} from '../src/schema.ts'
import { SONG_PRESETS, generateRandomGrooveProject } from '../src/client/presets.ts'

const note = { pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 100 }

describe('project schema', () => {
  it('accepts the default four-track loop and all curated song presets', () => {
    const project = createDefaultProject('sketch')
    expect(projectSchema.parse(project)).toMatchObject({
      bpm: 120,
      bars: 4,
      beatsPerBar: 4,
      loop: true,
      tracks: [
        { instrumentId: 'drums' },
        { instrumentId: 'bass' },
        { instrumentId: 'keys' },
        { instrumentId: 'lead' },
      ],
    })

    for (const preset of SONG_PRESETS) {
      const built = preset.build(`preset-${preset.id}`)
      expect(projectSchema.parse(built).id).toBe(`preset-${preset.id}`)
      expect(built.tracks.some((t) => t.notes.length > 0)).toBe(true)
    }

    const randomProject = generateRandomGrooveProject('rand1')
    expect(projectSchema.parse(randomProject).id).toBe('rand1')
  })

  it('rejects limits, unknown fields, and notes off the sixteenth grid', () => {
    const project = createDefaultProject('limits')
    expect(projectSchema.safeParse({ ...project, extra: true }).success).toBe(false)
    expect(projectSchema.safeParse({ ...project, bpm: 39 }).success).toBe(false)
    expect(projectSchema.safeParse({ ...project, bpm: 241 }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...project,
      tracks: Array.from({ length: MAX_TRACKS + 1 }, (_, index) => ({ ...project.tracks[0], id: `t${index}` })),
    }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...project,
      tracks: [{
        ...project.tracks[0],
        notes: Array.from({ length: MAX_NOTES_PER_TRACK + 1 }, () => note),
      }],
    }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...project,
      tracks: [{ ...project.tracks[0], notes: [{ ...note, startBeat: 0.2 }] }],
    }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...project,
      bars: 1,
      tracks: [{ ...project.tracks[0], notes: [{ ...note, startBeat: 3.75, durationBeats: 0.5 }] }],
    }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...project,
      tracks: [project.tracks[0], { ...project.tracks[0] }],
    }).success).toBe(false)
  })

  it('toggles a sixteenth cell, upserts multi-beat spans, and clips notes outside a shorter loop', () => {
    const added = toggleCell([], 60, 0)
    expect(added).toEqual([note])
    expect(toggleCell(added, 60, 0)).toEqual([])
    expect(toggleCell([{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 80 }], 60, 0.5)).toEqual([])

    const span = upsertNote(added, { pitch: 60, startBeat: 0, durationBeats: 1.5, velocity: 110 }, 16)
    expect(span).toEqual([{ pitch: 60, startBeat: 0, durationBeats: 1.5, velocity: 110 }])
    expect(removeNoteAt(span, 60, 0.75)).toEqual([])

    const project = createDefaultProject('clip')
    project.bars = 1
    project.tracks[0]?.notes.push(
      { pitch: 60, startBeat: 0, durationBeats: 8, velocity: 100 },
      { pitch: 62, startBeat: 6, durationBeats: 0.25, velocity: 100 },
    )
    const clipped = clipToBars(project)
    expect(clipped.tracks[0]?.notes).toEqual([{ pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100 }])
    expect(projectSchema.parse(clipped).bars).toBe(1)

    const dirty = createDefaultProject('dirty')
    dirty.bpm = 300
    dirty.tracks[1]!.synth = {
      waveform: 'sawtooth',
      detune: 99,
      subMix: 2,
      cutoff: 20,
      resonance: 50,
      envMod: -1,
      attack: 0,
      decay: 5,
      sustain: 2,
      release: 9,
      delayMix: 2,
      drive: -1,
    }
    dirty.tracks[1]!.notes.push({ pitch: 60, startBeat: 15.9, durationBeats: 2, velocity: 200 })
    const cleaned = sanitizeProject(dirty)
    expect(projectSchema.safeParse(cleaned).success).toBe(true)
    expect(cleaned.bpm).toBe(240)
  })
})
