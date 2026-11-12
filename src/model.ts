/**
 * Project model shared by the Host and the browser: types, limits, and pure
 * helpers. It imports nothing, so the browser bundle does not carry the
 * validator. The Host validates with the zod schema in `schema.ts`.
 */
export const MAX_TRACKS = 8
export const MAX_NOTES_PER_TRACK = 512
export const MAX_BARS = 32
export const BEATS_PER_BAR = 4
export const MAX_LOOP_BEATS = MAX_BARS * BEATS_PER_BAR
export const MAX_PROJECTS = 32
export const MAX_PROJECT_BYTES = 256 * 1024
export const STEP_BEATS = 0.25
export const PITCH_MIN = 36
export const PITCH_MAX = 84

export const DRUM_KICK = 36
export const DRUM_RIM = 37
export const DRUM_SNARE = 38
export const DRUM_CLAP = 39
export const DRUM_HAT = 42
export const DRUM_TOM_LOW = 45
export const DRUM_OPEN_HAT = 46
export const DRUM_CYMBAL = 49

export const DRUM_PITCHES = [
  DRUM_CYMBAL,
  DRUM_OPEN_HAT,
  DRUM_TOM_LOW,
  DRUM_HAT,
  DRUM_CLAP,
  DRUM_SNARE,
  DRUM_RIM,
  DRUM_KICK,
] as const

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** True when a beat position lands on a sixteenth-note boundary. */
export function isQuantized(value: number): boolean {
  if (!Number.isFinite(value)) return false
  const steps = value / STEP_BEATS
  return Math.abs(steps - Math.round(steps)) < 1e-6
}

export const KIT_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export const SYNTH_WAVEFORMS = ['sawtooth', 'square', 'triangle', 'sine'] as const
export type SynthWaveform = (typeof SYNTH_WAVEFORMS)[number]

export interface SynthPatch {
  waveform: SynthWaveform
  detune: number
  subMix: number
  cutoff: number
  resonance: number
  envMod: number
  attack: number
  decay: number
  sustain: number
  release: number
  delayMix: number
  drive: number
}

export interface Note {
  pitch: number
  startBeat: number
  durationBeats: number
  velocity: number
}

export interface Track {
  id: string
  name: string
  instrumentId: string
  mute: boolean
  gain: number
  synth?: SynthPatch | undefined
  /** Drum tracks only: which drum kit plays the track. Absent means the default kit. */
  kit?: string | undefined
  notes: Note[]
}

export interface Project {
  version: 1
  id: string
  name: string
  bpm: number
  beatsPerBar: typeof BEATS_PER_BAR
  bars: number
  loop: boolean
  /** Scale used for grid shading and generated phrases: root pitch class 0..11 and a scale id. */
  scaleRoot?: number | undefined
  scaleId?: string | undefined
  tracks: Track[]
}

const PATCH_NUMBER_KEYS = [
  'detune', 'subMix', 'cutoff', 'resonance', 'envMod', 'attack', 'decay', 'sustain', 'release', 'delayMix', 'drive',
] as const

/** Read an untrusted value (browser storage) as a patch, clamped to range. Null when it is not one. */
export function coerceSynthPatch(value: unknown): SynthPatch | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!SYNTH_WAVEFORMS.includes(record.waveform as SynthWaveform)) return null
  for (const key of PATCH_NUMBER_KEYS) {
    if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) return null
  }
  return sanitizeSynthPatch(record as unknown as SynthPatch)
}

export function createProjectId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Four empty tracks, 120 BPM, four bars, looping. */
export function createDefaultProject(id = createProjectId()): Project {
  return {
    version: 1,
    id,
    name: '未命名',
    bpm: 120,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      { id: 'drums', name: '鼓', instrumentId: 'drums', mute: false, gain: 0.8, notes: [] },
      { id: 'bass', name: '贝斯', instrumentId: 'bass', mute: false, gain: 0.8, notes: [] },
      { id: 'keys', name: '键盘', instrumentId: 'keys', mute: false, gain: 0.7, notes: [] },
      { id: 'lead', name: '主旋律', instrumentId: 'lead', mute: false, gain: 0.7, notes: [] },
    ],
  }
}

/** Drop or shorten notes that no longer fit after the bar count changes. */
export function clipToBars(project: Project): Project {
  const loopBeats = project.bars * project.beatsPerBar
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      notes: track.notes.flatMap((note) => {
        if (note.startBeat >= loopBeats) return []
        const durationBeats = Math.min(note.durationBeats, loopBeats - note.startBeat)
        if (durationBeats <= 0) return []
        return [{ ...note, durationBeats }]
      }),
    })),
  }
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min
  return Math.max(min, Math.min(max, val))
}

function sanitizeSynthPatch(patch: SynthPatch): SynthPatch {
  return {
    waveform: patch.waveform,
    detune: clamp(patch.detune, 0, 50),
    subMix: clamp(patch.subMix, 0, 1),
    cutoff: clamp(patch.cutoff, 60, 16000),
    resonance: clamp(patch.resonance, 0.5, 20),
    envMod: clamp(patch.envMod, 0, 1),
    attack: clamp(patch.attack, 0.002, 2),
    decay: clamp(patch.decay, 0.01, 2),
    sustain: clamp(patch.sustain, 0, 1),
    release: clamp(patch.release, 0.01, 3),
    delayMix: clamp(patch.delayMix, 0, 0.8),
    drive: clamp(patch.drive, 0, 1),
  }
}

/** Ensure all notes and parameters in a project strictly satisfy schema constraints. */
export function sanitizeProject(project: Project): Project {
  const bars = Math.round(clamp(project.bars, 1, MAX_BARS))
  const bpm = Math.round(clamp(project.bpm, 40, 240))
  const loopBeats = bars * BEATS_PER_BAR
  const seenIds = new Set<string>()

  const tracks: Track[] = project.tracks.slice(0, MAX_TRACKS).map((track, idx) => {
    let id = ID_PATTERN.test(track.id) ? track.id : `track_${idx + 1}`
    while (seenIds.has(id)) id = `${id}_${idx + 1}`
    seenIds.add(id)

    const sanitizedNotes: Note[] = []
    for (const rawNote of track.notes) {
      const startBeat = Math.round(clamp(rawNote.startBeat, 0, loopBeats) / STEP_BEATS) * STEP_BEATS
      if (startBeat >= loopBeats - 1e-6) continue
      const maxDur = loopBeats - startBeat
      const durationBeats = Math.min(
        maxDur,
        Math.max(STEP_BEATS, Math.round(clamp(rawNote.durationBeats, STEP_BEATS, maxDur) / STEP_BEATS) * STEP_BEATS),
      )
      if (durationBeats <= 0 || startBeat + durationBeats > loopBeats + 1e-6) continue
      sanitizedNotes.push({
        pitch: Math.round(clamp(rawNote.pitch, 0, 127)),
        startBeat,
        durationBeats,
        velocity: Math.round(clamp(rawNote.velocity, 1, 127)),
      })
      if (sanitizedNotes.length >= MAX_NOTES_PER_TRACK) break
    }

    const baseTrack: Track = {
      id,
      name: (track.name.trim() || `音轨 ${idx + 1}`).slice(0, 64),
      instrumentId: (track.instrumentId.trim() || 'lead').slice(0, 64),
      mute: Boolean(track.mute),
      gain: Number(clamp(track.gain, 0, 1).toFixed(3)),
      notes: sanitizedNotes,
    }
    if (track.synth !== undefined && baseTrack.instrumentId !== 'drums') {
      baseTrack.synth = sanitizeSynthPatch(track.synth)
    }
    if (baseTrack.instrumentId === 'drums' && typeof track.kit === 'string' && KIT_PATTERN.test(track.kit)) {
      baseTrack.kit = track.kit
    }
    return baseTrack
  })

  const scaleRoot = typeof project.scaleRoot === 'number' && Number.isFinite(project.scaleRoot)
    ? ((Math.round(project.scaleRoot) % 12) + 12) % 12
    : undefined
  const scaleId = typeof project.scaleId === 'string' && project.scaleId.trim() !== ''
    ? project.scaleId.trim().slice(0, 32)
    : undefined

  return {
    version: 1,
    id: ID_PATTERN.test(project.id) ? project.id : createProjectId(),
    name: (project.name.trim() || '未命名').slice(0, 80),
    bpm,
    beatsPerBar: BEATS_PER_BAR,
    bars,
    loop: Boolean(project.loop),
    ...(scaleRoot !== undefined ? { scaleRoot } : {}),
    ...(scaleId !== undefined ? { scaleId } : {}),
    tracks: tracks.length > 0 ? tracks : createDefaultProject().tracks,
  }
}

/**
 * Toggle a sixteenth-note cell. An overlapping note of the same pitch is removed;
 * otherwise a new sixteenth is added until the per-track cap.
 */
/**
 * Read an untrusted document (an imported file) as a project. Fields of the
 * wrong type fall back to defaults and everything is clamped into range.
 * Null when the value is not recognisably a project.
 */
export function coerceProject(value: unknown): Project | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) return null
  const text = (input: unknown, fallback: string): string => typeof input === 'string' ? input : fallback
  const num = (input: unknown, fallback: number): number =>
    typeof input === 'number' && Number.isFinite(input) ? input : fallback

  const tracks: Track[] = []
  for (const item of raw.tracks) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const notes: Note[] = []
    for (const candidate of Array.isArray(entry.notes) ? entry.notes : []) {
      if (typeof candidate !== 'object' || candidate === null) continue
      const note = candidate as Record<string, unknown>
      if (typeof note.pitch !== 'number' || typeof note.startBeat !== 'number') continue
      notes.push({
        pitch: num(note.pitch, 60),
        startBeat: num(note.startBeat, 0),
        durationBeats: num(note.durationBeats, STEP_BEATS),
        velocity: num(note.velocity, 100),
      })
    }
    const synth = coerceSynthPatch(entry.synth)
    tracks.push({
      id: text(entry.id, ''),
      name: text(entry.name, ''),
      instrumentId: text(entry.instrumentId, 'lead'),
      mute: entry.mute === true,
      gain: num(entry.gain, 0.8),
      ...(synth !== null ? { synth } : {}),
      ...(typeof entry.kit === 'string' ? { kit: entry.kit } : {}),
      notes,
    })
  }
  if (tracks.length === 0) return null

  return sanitizeProject({
    version: 1,
    id: createProjectId(),
    name: text(raw.name, ''),
    bpm: num(raw.bpm, 120),
    beatsPerBar: BEATS_PER_BAR,
    bars: num(raw.bars, 4),
    loop: raw.loop !== false,
    ...(typeof raw.scaleRoot === 'number' ? { scaleRoot: raw.scaleRoot } : {}),
    ...(typeof raw.scaleId === 'string' ? { scaleId: raw.scaleId } : {}),
    tracks,
  })
}

/** `base`, or `base 2`, `base 3`… so that no two projects in the list share a name. */
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken)
  const root = base.trim() || '未命名'
  if (!used.has(root)) return root
  // A trailing number is our own counter only if the name without it is taken too
  // ("夜曲 2" next to "夜曲"), not when it is part of the title ("Synthwave 84").
  const bare = root.replace(/ \d+$/, '')
  const stem = bare !== root && used.has(bare) ? bare : root
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem} ${index}`.slice(0, 80)
    if (!used.has(candidate)) return candidate
  }
  return root
}

export function toggleCell(notes: readonly Note[], pitch: number, startBeat: number): Note[] {
  const end = startBeat + STEP_BEATS
  const hit = (note: Note): boolean => note.pitch === pitch
    && note.startBeat < end
    && note.startBeat + note.durationBeats > startBeat + 1e-9
  if (notes.some(hit)) return notes.filter((note) => !hit(note))
  if (notes.length >= MAX_NOTES_PER_TRACK) return [...notes]
  return [...notes, { pitch, startBeat, durationBeats: STEP_BEATS, velocity: 100 }]
    .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch)
}

/**
 * Insert or replace a note span `[startBeat, startBeat + durationBeats)` on a given pitch.
 * Any existing notes on the same pitch that overlap the span are replaced.
 */
export function upsertNote(notes: readonly Note[], nextNote: Note, maxBeats = MAX_LOOP_BEATS): Note[] {
  const startBeat = Math.max(0, Math.round(nextNote.startBeat / STEP_BEATS) * STEP_BEATS)
  if (startBeat >= maxBeats - 1e-6) return [...notes]
  const maxDuration = Math.max(STEP_BEATS, maxBeats - startBeat)
  const durationBeats = Math.min(
    maxDuration,
    Math.max(STEP_BEATS, Math.round(nextNote.durationBeats / STEP_BEATS) * STEP_BEATS),
  )
  const endBeat = startBeat + durationBeats
  const filtered = notes.filter((note) => {
    if (note.pitch !== nextNote.pitch) return true
    const noteEnd = note.startBeat + note.durationBeats
    return noteEnd <= startBeat + 1e-9 || note.startBeat >= endBeat - 1e-9
  })
  if (filtered.length >= MAX_NOTES_PER_TRACK) return filtered
  const clampedVelocity = Math.max(1, Math.min(127, Math.round(nextNote.velocity)))
  return [...filtered, { pitch: nextNote.pitch, startBeat, durationBeats, velocity: clampedVelocity }]
    .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch)
}

/** Remove any note at `pitch` covering `beat`. */
export function removeNoteAt(notes: readonly Note[], pitch: number, beat: number): Note[] {
  return notes.filter((note) => !(
    note.pitch === pitch
    && note.startBeat <= beat + 1e-9
    && note.startBeat + note.durationBeats > beat + 1e-9
  ))
}
