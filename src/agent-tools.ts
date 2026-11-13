/**
 * Optional dsh-tools and dsh-system-prompt integration for prompt-driven composition.
 *
 * Uses structural interfaces instead of importing host-only packages directly so
 * dsh-synthesizer stays compatible with minimal hosts and browser-only tests.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  BEATS_PER_BAR,
  DRUM_CLAP,
  DRUM_CYMBAL,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_OPEN_HAT,
  DRUM_RIM,
  DRUM_SNARE,
  DRUM_TOM_LOW,
  ID_PATTERN,
  MAX_BARS,
  MAX_NOTES_PER_TRACK,
  MAX_SWING,
  MAX_TRACKS,
  PITCH_MAX,
  PITCH_MIN,
  STEP_BEATS,
  coerceSynthPatch,
  sanitizeProject,
  type Note,
  type Project,
  type SynthPatch,
  type Track,
} from './model.ts'
import { resolveSynthPatch } from './client/instruments.ts'
import { projectSchema } from './schema.ts'
import type { ProjectStore } from './store.ts'
import type { SyncTracker } from './sync.ts'

interface TextBlock {
  type: 'text'
  text: string
}

interface AgentToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (_args: unknown, value: unknown) => TextBlock[]
  }
  isConcurrencySafe?: (args: unknown) => boolean
  execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown>
}

interface ToolsFace {
  register?: (definition: AgentToolDefinition) => () => void
}

interface SystemPromptFace {
  section?: (section: {
    name: string
    order: number
    text: string
    interpolate?: boolean
  }) => () => void
}

interface CommandAgentFace {
  followup?: (message: {
    id: string
    role: 'user'
    content: Array<{ type: 'text'; text: string }>
    source: { kind: 'user' }
  }) => void
}

interface CommandsFace {
  register?: (definition: {
    name: string
    description: string
    input?: { hint: string; attachments?: boolean }
    handler: (invocation: { rawInput: string; agent?: CommandAgentFace }) => Promise<
      | { kind: 'success'; text?: string }
      | { kind: 'error'; text: string }
    >
  }) => () => void
}

const VALID_SCALES = new Set<string>(['major', 'minor', 'dorian', 'mixolydian', 'pentatonic', 'blues'])

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function quantizeStep(beat: number): number {
  return Math.round(beat / STEP_BEATS) * STEP_BEATS
}

function slugId(raw: unknown, fallbackPrefix = 'ai'): string {
  if (typeof raw === 'string' && ID_PATTERN.test(raw.trim())) {
    return raw.trim()
  }
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${fallbackPrefix}-${stamp}-${rand}`
}

function normalizeNotes(rawNotes: unknown, bars: number): Note[] {
  if (!Array.isArray(rawNotes)) return []
  const maxBeat = bars * BEATS_PER_BAR
  const out: Note[] = []
  for (const item of rawNotes) {
    if (out.length >= MAX_NOTES_PER_TRACK) break
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const pitchRaw = Number(rec.pitch)
    const startRaw = Number(rec.startBeat)
    const durRaw = Number(rec.durationBeats ?? STEP_BEATS)
    const velRaw = Number(rec.velocity ?? 100)
    if (!Number.isFinite(pitchRaw) || !Number.isFinite(startRaw) || !Number.isFinite(durRaw)) continue
    const pitch = Math.round(clamp(pitchRaw, PITCH_MIN, PITCH_MAX))
    const startBeat = clamp(quantizeStep(startRaw), 0, maxBeat - STEP_BEATS)
    const durationBeats = clamp(Math.max(STEP_BEATS, quantizeStep(durRaw)), STEP_BEATS, maxBeat - startBeat)
    const velocity = Math.round(clamp(Number.isFinite(velRaw) ? velRaw : 100, 1, 127))
    out.push({ pitch, startBeat, durationBeats, velocity })
  }
  return out
}

function mergeSynthPatch(instrumentId: string, rawSynth: unknown, prevSynth?: SynthPatch): SynthPatch | undefined {
  if (typeof rawSynth !== 'object' || rawSynth === null) return prevSynth
  const base = prevSynth ?? resolveSynthPatch(instrumentId)
  const merged: Record<string, unknown> = { ...base }
  for (const [key, val] of Object.entries(rawSynth as Record<string, unknown>)) {
    if (val !== undefined) merged[key] = val
  }
  return coerceSynthPatch(merged) ?? prevSynth
}

function normalizeTrack(raw: unknown, index: number, bars: number): Track {
  const rec = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const instrumentId = typeof rec.instrumentId === 'string' && /^[a-z0-9-]{1,32}$/.test(rec.instrumentId.trim())
    ? rec.instrumentId.trim()
    : (index === 0 ? 'drums' : 'keys')
  const id = slugId(rec.id, `track-${index + 1}`)
  const name = typeof rec.name === 'string' && rec.name.trim() !== ''
    ? rec.name.trim().slice(0, 40)
    : instrumentId
  const gain = typeof rec.gain === 'number' && Number.isFinite(rec.gain) ? clamp(rec.gain, 0, 1) : 0.78
  const pan = typeof rec.pan === 'number' && Number.isFinite(rec.pan) && Math.abs(rec.pan) >= 0.01
    ? clamp(Math.round(rec.pan * 100) / 100, -1, 1)
    : undefined
  const kit = typeof rec.kit === 'string' && ['classic', '808', 'lofi', 'chip'].includes(rec.kit.trim())
    ? rec.kit.trim()
    : undefined
  const synth = rec.synth !== undefined ? mergeSynthPatch(instrumentId, rec.synth) : undefined
  return {
    id,
    name,
    instrumentId,
    mute: rec.mute === true,
    ...(rec.solo === true ? { solo: true } : {}),
    gain,
    ...(pan !== undefined ? { pan } : {}),
    ...(kit !== undefined ? { kit } : {}),
    ...(synth !== undefined ? { synth } : {}),
    notes: normalizeNotes(rec.notes, bars),
  }
}

function buildValidatedProject(raw: Record<string, unknown>): Project {
  const bars = typeof raw.bars === 'number' && Number.isFinite(raw.bars)
    ? Math.round(clamp(raw.bars, 1, MAX_BARS))
    : 4
  const bpm = typeof raw.bpm === 'number' && Number.isFinite(raw.bpm)
    ? Math.round(clamp(raw.bpm, 40, 240))
    : 120
  const swing = typeof raw.swing === 'number' && Number.isFinite(raw.swing) && raw.swing > 0
    ? clamp(Math.round(raw.swing * 100) / 100, 0, MAX_SWING)
    : undefined
  const scaleRoot = typeof raw.scaleRoot === 'number' && Number.isFinite(raw.scaleRoot)
    ? ((Math.round(raw.scaleRoot) % 12) + 12) % 12
    : 0
  const scaleId = typeof raw.scaleId === 'string' && VALID_SCALES.has(raw.scaleId)
    ? raw.scaleId
    : 'minor'
  const rawTracks = Array.isArray(raw.tracks) ? raw.tracks.slice(0, MAX_TRACKS) : []
  if (rawTracks.length === 0) {
    throw new Error('tracks must contain at least 1 track')
  }
  const seenIds = new Set<string>()
  const tracks: Track[] = rawTracks.map((item, idx) => {
    const track = normalizeTrack(item, idx, bars)
    if (seenIds.has(track.id)) {
      track.id = `${track.id}-${idx + 1}`.slice(0, 64)
    }
    seenIds.add(track.id)
    return track
  })

  const candidate: Project = sanitizeProject({
    version: 1,
    id: slugId(raw.id, 'ai'),
    name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim().slice(0, 80) : 'AI Sketch',
    bpm,
    beatsPerBar: BEATS_PER_BAR,
    bars,
    loop: raw.loop !== false,
    ...(swing !== undefined ? { swing } : {}),
    scaleRoot,
    scaleId,
    tracks,
  })

  const parsed = projectSchema.safeParse(candidate)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(`invalid_project: ${issue?.path.join('.') || 'root'} ${issue?.message ?? 'validation failed'}`)
  }
  return parsed.data
}

function jsonText(value: unknown): TextBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/**
 * Register synthesizer composition tools on `@deepseek-ai/dsh-tools`.
 * @returns number of registered tools.
 */
export function registerAgentTools(toolsCtx: Context, projects: ProjectStore, tracker: SyncTracker): number {
  const tools = toolsCtx.get('tools') as ToolsFace | undefined
  const register = tools?.register
  if (tools === undefined || typeof register !== 'function') return 0

  const add = (definition: AgentToolDefinition): void => {
    toolsCtx.effect(() => register.call(tools, definition))
  }

  add({
    name: 'synthesizer_list_projects',
    description: 'List saved dsh-synthesizer projects with id, name, bpm, bars, track count, and note count.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => jsonText(value),
    },
    isConcurrencySafe: () => true,
    execute: async () => ({
      projects: projects.list(),
      sync: tracker.snapshot(),
    }),
  })

  add({
    name: 'synthesizer_get_project',
    description: 'Read a complete dsh-synthesizer project by id, including all tracks and MIDI notes.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Project id to read.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => jsonText(value),
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const rec = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
      if (typeof rec.id !== 'string' || rec.id.trim() === '') {
        throw new Error('id must be a non-empty string')
      }
      return { project: projects.read(rec.id.trim()) }
    },
  })

  add({
    name: 'synthesizer_save_project',
    description: 'Create or overwrite a dsh-synthesizer multi-track music project so the browser synthesizer plays it immediately.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional alphanumeric/dash project id. Omit to auto-generate a new project.' },
        name: { type: 'string', description: 'Human-readable song title (1-80 chars).' },
        bpm: { type: 'integer', description: 'Tempo in beats per minute (40-240).' },
        bars: { type: 'integer', description: 'Loop length in bars (1-32, 4 beats per bar).' },
        swing: { type: 'number', description: 'Optional 16th-note swing (0 to 0.6).' },
        scaleRoot: { type: 'integer', description: 'Scale root pitch class 0..11 (0=C, 2=D, 5=F, 7=G, 9=A).' },
        scaleId: {
          type: 'string',
          enum: ['major', 'minor', 'dorian', 'mixolydian', 'pentatonic', 'blues'],
          description: 'Musical scale id.',
        },
        tracks: {
          type: 'array',
          description: '1 to 8 tracks. Each track has id, name, instrumentId, gain (0..1), optional pan (-1..1), and notes.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              instrumentId: {
                type: 'string',
                description: 'e.g. drums, bass, keys, lead, pad, pluck, bell, arp',
              },
              gain: { type: 'number' },
              pan: { type: 'number', description: 'Stereo pan from -1 (left) to 1 (right).' },
              kit: { type: 'string', enum: ['classic', '808', 'lofi', 'chip'], description: 'Drum kit sound (for drums tracks).' },
              synth: {
                type: 'object',
                description: 'Optional subtractive synth patch (waveform, detune 0..50, subMix 0..1, cutoff 80..12000, resonance 0.1..20, envMod 0..1, attack/decay/sustain/release, delayMix 0..1, reverbMix 0..1, drive 0..1, lfoTarget pitch|filter|amp, lfoRate, lfoDepth).',
                additionalProperties: true,
              },
              mute: { type: 'boolean' },
              solo: { type: 'boolean' },
              notes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    pitch: { type: 'integer', description: 'MIDI pitch 36..84 (drums: 36=kick, 38=snare, 39=clap, 42=hat, 46=open-hat, 45=tom, 49=crash).' },
                    startBeat: { type: 'number', description: 'Beat offset in 0.25-beat (16th-note) steps, 0 .. bars*4 - 0.25.' },
                    durationBeats: { type: 'number', description: 'Duration in 0.25-beat steps (>= 0.25).' },
                    velocity: { type: 'integer', description: 'Note velocity 1..127.' },
                  },
                  required: ['pitch', 'startBeat', 'durationBeats'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'instrumentId', 'notes'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'tracks'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => jsonText(value),
    },
    execute: async (args) => {
      const rec = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
      const validated = buildValidatedProject(rec)
      const saved = projects.save(validated)
      const revision = tracker.markToolSave(saved.id, saved.name)
      return {
        ok: true,
        projectId: saved.id,
        name: saved.name,
        bpm: saved.bpm,
        bars: saved.bars,
        tracks: saved.tracks.length,
        notes: saved.tracks.reduce((sum, t) => sum + t.notes.length, 0),
        revision,
      }
    },
  })

  add({
    name: 'synthesizer_update_track',
    description: 'Update an existing track or append a new track in a saved dsh-synthesizer project without rewriting the whole project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Target project id.' },
        trackId: { type: 'string', description: 'Track id to update or add.' },
        name: { type: 'string', description: 'Track display name.' },
        instrumentId: { type: 'string', description: 'Instrument id (drums, bass, keys, lead, pad, pluck, bell, arp).' },
        gain: { type: 'number', description: 'Track volume 0..1.' },
        pan: { type: 'number', description: 'Stereo pan -1..1.' },
        kit: { type: 'string', enum: ['classic', '808', 'lofi', 'chip'], description: 'Optional drum kit (for drums track).' },
        synth: {
          type: 'object',
          description: 'Optional subtractive synth patch overrides (waveform, detune, subMix, cutoff, resonance, envMod, ADSR, delayMix, reverbMix, drive, lfoTarget/Rate/Depth).',
          additionalProperties: true,
        },
        mute: { type: 'boolean' },
        solo: { type: 'boolean' },
        notes: {
          type: 'array',
          description: 'Replacement notes for this track (quantized to 0.25-beat steps).',
          items: {
            type: 'object',
            properties: {
              pitch: { type: 'integer' },
              startBeat: { type: 'number' },
              durationBeats: { type: 'number' },
              velocity: { type: 'integer' },
            },
            required: ['pitch', 'startBeat', 'durationBeats'],
            additionalProperties: false,
          },
        },
      },
      required: ['projectId', 'trackId'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => jsonText(value),
    },
    execute: async (args) => {
      const rec = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
      if (typeof rec.projectId !== 'string' || rec.projectId.trim() === '') {
        throw new Error('projectId is required')
      }
      if (typeof rec.trackId !== 'string' || rec.trackId.trim() === '') {
        throw new Error('trackId is required')
      }
      const current = projects.read(rec.projectId.trim())
      const trackId = rec.trackId.trim()
      const idx = current.tracks.findIndex((t) => t.id === trackId)
      let nextTracks: Track[]
      if (idx >= 0) {
        const prev = current.tracks[idx]!
        const nextInstrumentId = typeof rec.instrumentId === 'string' && rec.instrumentId.trim() !== ''
          ? rec.instrumentId.trim()
          : prev.instrumentId
        const nextSynth = rec.synth !== undefined
          ? mergeSynthPatch(nextInstrumentId, rec.synth, prev.synth)
          : prev.synth
        const merged = normalizeTrack({
          ...prev,
          ...(rec.name !== undefined ? { name: rec.name } : {}),
          ...(rec.instrumentId !== undefined ? { instrumentId: rec.instrumentId } : {}),
          ...(rec.gain !== undefined ? { gain: rec.gain } : {}),
          ...(rec.pan !== undefined ? { pan: rec.pan } : {}),
          ...(rec.kit !== undefined ? { kit: rec.kit } : {}),
          ...(nextSynth !== undefined ? { synth: nextSynth } : {}),
          ...(rec.mute !== undefined ? { mute: rec.mute } : {}),
          ...(rec.solo !== undefined ? { solo: rec.solo } : {}),
          ...(rec.notes !== undefined ? { notes: rec.notes } : {}),
          id: trackId,
        }, idx, current.bars)
        nextTracks = current.tracks.map((t, i) => (i === idx ? merged : t))
      } else {
        if (current.tracks.length >= MAX_TRACKS) {
          throw new Error(`project already has maximum ${MAX_TRACKS} tracks`)
        }
        const created = normalizeTrack({
          id: trackId,
          name: rec.name ?? trackId,
          instrumentId: rec.instrumentId ?? 'keys',
          gain: rec.gain ?? 0.78,
          pan: rec.pan,
          kit: rec.kit,
          synth: rec.synth,
          mute: rec.mute,
          solo: rec.solo,
          notes: rec.notes ?? [],
        }, current.tracks.length, current.bars)
        nextTracks = [...current.tracks, created]
      }

      const validated = buildValidatedProject({ ...current, tracks: nextTracks })
      const saved = projects.save(validated)
      const revision = tracker.markToolSave(saved.id, saved.name)
      return {
        ok: true,
        projectId: saved.id,
        trackId,
        notes: saved.tracks.find((t) => t.id === trackId)?.notes.length ?? 0,
        revision,
      }
    },
  })

  return 4
}

/**
 * Register a concise composition guide section on `@deepseek-ai/dsh-system-prompt`.
 */
export function registerPromptSection(promptCtx: Context): boolean {
  const systemPrompt = promptCtx.get('systemPrompt') as SystemPromptFace | undefined
  const section = systemPrompt?.section
  if (systemPrompt === undefined || typeof section !== 'function') return false

  promptCtx.effect(() => section.call(systemPrompt, {
    name: 'dsh-synthesizer:composition',
    order: 2550,
    interpolate: false,
    text: [
      '## dsh-synthesizer Music Composition & Sound Design',
      'When the user asks to create, compose, remix, or edit music/beats in dsh-synthesizer, use `synthesizer_save_project` (or `synthesizer_list_projects` / `synthesizer_get_project` / `synthesizer_update_track`).',
      '- Instruments: `drums` (`kit`: `classic` | `808` | `lofi` | `chip`), `bass`, `keys`, `lead`, `pad`, `pluck`, `bell`, `arp`.',
      `- Drum MIDI pitches: ${DRUM_KICK}=Kick, ${DRUM_RIM}=Rim, ${DRUM_SNARE}=Snare, ${DRUM_CLAP}=Clap, ${DRUM_HAT}=ClosedHat, ${DRUM_TOM_LOW}=LowTom, ${DRUM_OPEN_HAT}=OpenHat, ${DRUM_CYMBAL}=Crash.`,
      `- Grid & range: 4 beats/bar, \`startBeat\` and \`durationBeats\` in 0.25-beat (16th-note) steps, \`pitch\` ${PITCH_MIN}..${PITCH_MAX}, \`velocity\` 1..127, \`pan\` -1..1.`,
      '- Subtractive Synth Patch (`track.synth`): `waveform` (`sawtooth`/`square`/`triangle`/`sine`), `detune` (0..50 cents unison spread), `subMix` (0..1 octave-below sub osc), `cutoff` (80..12000 Hz lowpass) + `resonance` (Q 0.1..20) + `envMod` (0..1 filter envelope sweep), ADSR (`attack`/`decay`/`sustain`/`release`), `drive` (0..1 saturation), `delayMix` / `reverbMix` (0..1), and `lfoTarget` (`pitch`/`filter`/`amp`) + `lfoRate` + `lfoDepth`.',
      '- Genre conventions: Synthwave (105-122 BPM, driving 8th octave sawtooth bass, lush detuned pads, `classic` kit); Acid 303 (125-135 BPM, four-on-the-floor `808` drums, high-resonance `acid` bass with filter LFO/velocity accents); Lo-Fi (75-92 BPM, `swing` 0.25-0.38, `lofi` kit, warm triangle bass, Rhodes chords with slow subtle pitch LFO wow/flutter); Chiptune (130-150 BPM, `chip` kit, square/triangle waves + rapid 16th triad arps); Ambient (65-85 BPM, sparse/soft percussion, long attack/release reverb pads with slow filter LFO); Trap/Future Bass (130-145 BPM half-time snare on beat 2, `808` kit, fast hat rolls, sub bass + supersaw LFO-pumped chords).',
      '- Musicality: give drums/bass/chords/melody distinct rhythmic roles, vary note velocities for groove, spread melodic layers in stereo `pan`, and keep notes inside the chosen `scaleRoot` + `scaleId`.',
    ].join('\n'),
  }))
  return true
}

/**
 * Register the `/synth` slash command on `@deepseek-ai/dsh-commands`.
 */
export function registerSlashCommands(commandsCtx: Context, projects: ProjectStore, tracker: SyncTracker): boolean {
  const commands = commandsCtx.get('commands') as CommandsFace | undefined
  const register = commands?.register
  if (commands === undefined || typeof register !== 'function') return false

  commandsCtx.effect(() => register.call(commands, {
    name: 'synth',
    description: '用自然语言让模型创作 dsh-synthesizer 乐曲并同步到工程，或使用 list / groove / help',
    input: { hint: '<曲风/速度/乐器描述> | list | groove [bpm] | help' },
    handler: async ({ rawInput, agent }) => {
      const trimmed = rawInput.trim()
      if (trimmed === 'list') {
        const list = projects.list()
        if (list.length === 0) {
          return { kind: 'success', text: 'dsh-synthesizer 暂无已保存工程。可直接输入 `/synth 写一段 120 BPM 的 Synthwave 伴奏` 让模型创作，或运行 `/synth groove 120`。' }
        }
        const lines = list.slice(0, 10).map((item, idx) =>
          `${idx + 1}. ${item.name} (${item.id}) — ${item.bpm} BPM, ${item.bars} 小节, ${item.tracks} 轨, ${item.notes} 音符`,
        )
        return { kind: 'success', text: `当前工程（共 ${list.length} 个）：\n${lines.join('\n')}` }
      }
      const grooveMatch = /^groove(?:\s+(\d{2,3}))?$/i.exec(trimmed)
      if (grooveMatch !== null) {
        const parsedBpm = grooveMatch[1] !== undefined ? Number(grooveMatch[1]) : 118
        const bpm = Number.isFinite(parsedBpm) ? Math.round(clamp(parsedBpm, 40, 240)) : 118
        const drums: Note[] = []
        const bass: Note[] = []
        const lead: Note[] = []
        const bassRoots = [45, 41, 48, 43]
        const leadMotif = [69, 72, 76, 74]
        for (let bar = 0; bar < 4; bar += 1) {
          const b = bar * 4
          for (let beat = 0; beat < 4; beat += 1) {
            drums.push({ pitch: DRUM_KICK, startBeat: b + beat, durationBeats: 0.25, velocity: 112 })
            drums.push({ pitch: DRUM_HAT, startBeat: b + beat + 0.5, durationBeats: 0.25, velocity: 78 })
            if (beat === 1 || beat === 3) {
              drums.push({ pitch: DRUM_SNARE, startBeat: b + beat, durationBeats: 0.25, velocity: 106 })
            }
          }
          const root = bassRoots[bar]!
          bass.push(
            { pitch: root, startBeat: b, durationBeats: 0.75, velocity: 108 },
            { pitch: root, startBeat: b + 1.5, durationBeats: 0.5, velocity: 96 },
            { pitch: root + 12, startBeat: b + 2.5, durationBeats: 0.5, velocity: 102 },
          )
          const top = leadMotif[bar]!
          lead.push(
            { pitch: top, startBeat: b, durationBeats: 1, velocity: 102 },
            { pitch: top + 2, startBeat: b + 1.5, durationBeats: 0.5, velocity: 94 },
            { pitch: top, startBeat: b + 2.5, durationBeats: 1, velocity: 98 },
          )
        }
        const project = buildValidatedProject({
          name: `Quick Groove ${bpm} BPM`,
          bpm,
          bars: 4,
          scaleRoot: 9,
          scaleId: 'minor',
          tracks: [
            { id: 'drums', name: '鼓组', instrumentId: 'drums', gain: 0.85, notes: drums },
            { id: 'bass', name: '贝斯', instrumentId: 'bass', gain: 0.82, pan: -0.1, notes: bass },
            { id: 'lead', name: '主音', instrumentId: 'lead', gain: 0.72, pan: 0.2, notes: lead },
          ],
        })
        const saved = projects.save(project)
        tracker.markToolSave(saved.id, saved.name)
        return {
          kind: 'success',
          text: `已生成并同步到合成器：${saved.name} (${saved.bpm} BPM, ${saved.bars} 小节, ${saved.tracks.length} 轨)`,
        }
      }
      if (trimmed === '' || trimmed.toLowerCase() === 'help') {
        return {
          kind: 'success',
          text: [
            '`/synth <曲风/速度/乐器描述>` — 调用模型按描述创作多轨乐曲并直接写入合成器工程',
            '`/synth list` — 查看当前已保存的工程列表',
            '`/synth groove [bpm]` — 快速生成一段 4 小节三轨律动并同步到合成器',
          ].join('\n'),
        }
      }
      if (typeof agent?.followup !== 'function') {
        return { kind: 'error', text: '当前会话不支持唤醒模型，请直接在对话中描述曲风需求，或使用 `/synth groove 120`。' }
      }
      agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{
          type: 'text',
          text: [
            '请直接根据以下描述调用 `synthesizer_save_project` 工具创作并保存一首完整的 `dsh-synthesizer` 多轨乐曲（无需反问确认；若是修改已有曲目可先调用 `synthesizer_list_projects` / `synthesizer_get_project`）：',
            '- 至少包含鼓组（drums）、贝斯（bass）、和弦/铺底（keys/pad）和主音（lead/pluck/arp）等饱满织体，合理设置 BPM、调式、立体声声像（pan）与力度起伏；',
            '- 保存后前端合成器会自动同步加载。',
            '',
            `创作需求：${trimmed}`,
          ].join('\n'),
        }],
        source: { kind: 'user' },
      })
      return {
        kind: 'success',
        text: `已交给模型创作「${trimmed}」，生成后将自动进入合成器工程。`,
      }
    },
  }))
  return true
}
