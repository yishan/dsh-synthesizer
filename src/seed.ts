/**
 * Deterministic seed utilities for `/synth` so different seeds produce distinct
 * song structures, harmonic progressions, rhythmic grooves, and melodic contours.
 */
import { randomBytes } from 'node:crypto'
import {
  BEATS_PER_BAR,
  DRUM_CLAP,
  DRUM_CYMBAL,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_OPEN_HAT,
  DRUM_RIM,
  DRUM_SNARE,
  PITCH_MAX,
  PITCH_MIN,
  type Note,
} from './model.ts'

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

const SCALE_INTERVALS: Record<string, readonly number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
}

const ARRANGEMENTS = [
  { id: 'immediate-hook', bars: 8, desc: 'Immediate Hook: main lead enters on bar 1 right away; bars 5-8 shift harmony/register for contrast.' },
  { id: 'two-bar-pickup', bars: 8, desc: '2-Bar Pickup: compact 2-bar rhythm intro, main lead enters at bar 3, turnaround fill in bar 8.' },
  { id: 'call-response', bars: 8, desc: 'Call & Response: bars 1-4 alternate short lead calls with bass/chord fills; bars 5-8 open into a fuller phrase.' },
  { id: 'mid-drop-5', bars: 8, desc: 'Mid-Loop Lift: bars 1-4 build groove & harmony, main lead enters at bar 5 (do not wait until bar 8).' },
  { id: 'aba-breakdown', bars: 8, desc: 'ABA Breakdown: full ensemble bars 1-4, drums drop out in bars 5-6 for chords/bell, full return bars 7-8.' },
  { id: 'verse-chorus-16', bars: 16, desc: '16-Bar Verse-Chorus: mid-register verse melody from bar 1 (bars 1-8), lifted octave chorus in bars 9-16.' },
  { id: 'poly-stagger', bars: 8, desc: 'Polyphonic Stagger: bass + keys start bar 1, drums enter bar 2, lead enters bar 3, counter-arp enters bar 5.' },
] as const

const RHYTHM_FEELS = [
  'Four-on-the-floor punch (kick on every beat, crisp offbeat hats)',
  'Syncopated breakbeat (ghost snares, displaced kicks on +2.5/+3.75)',
  'Half-time bounce (heavy snare on beat 3, rolling 16th hi-hats)',
  'Driving 16th electro (tight 16th-note pulse, syncopated claps)',
  'Swung shuffle groove (swing 0.24-0.34, laid-back rim/hat pocket)',
  'Minimal polyrhythmic pocket (Euclidean percussion accents + sparse kick)',
] as const

const PROGRESSIONS = [
  { label: 'i–VI–III–VII', degrees: [0, 5, 2, 6], minorBias: true },
  { label: 'i–iv–v–i', degrees: [0, 3, 4, 0], minorBias: true },
  { label: 'i–VII–VI–V', degrees: [0, 6, 5, 4], minorBias: true },
  { label: 'i–III–VII–iv', degrees: [0, 2, 6, 3], minorBias: true },
  { label: 'I–V–vi–IV', degrees: [0, 4, 5, 3], minorBias: false },
  { label: 'ii–V–I–vi', degrees: [1, 4, 0, 5], minorBias: false },
  { label: 'IV–V–iii–vi', degrees: [3, 4, 2, 5], minorBias: false },
  { label: 'i–bII–i–VII', degrees: [0, 1, 0, 6], minorBias: true },
] as const

const HARMONIC_RHYTHMS = [
  '1 chord per bar',
  '2 chords per bar (faster harmonic motion)',
  '2 bars per chord (wide, hypnotic phrasing)',
] as const

const BASS_STYLES = [
  'Driving octave 8th-note pulse',
  'Syncopated funk slap-bass with rests',
  'Root-5th walking bassline',
  'Deep sustained sub-bass with pickup slides',
  '16th-note resonant acid/arp sequence',
] as const

const MELODY_CONTOURS = [
  'Ascending leap followed by stepwise descent',
  'Syncopated offbeat motif with breathing space',
  'Lyrical long-tone phrasing over moving chords',
  'Pendulum arpeggio weaving chord tones',
  'Staccato call-and-response rhythmic hook',
] as const

export interface ParsedSeedOption {
  cleanInput: string
  seed: string
  explicit: boolean
}

export interface CompositionBlueprint {
  seed: string
  arrangement: (typeof ARRANGEMENTS)[number]
  rhythmFeel: string
  scaleRoot: number
  scaleRootName: string
  scaleId: string
  progression: (typeof PROGRESSIONS)[number]
  harmonicRhythm: string
  bassStyle: string
  melodyContour: string
}

/** Generate a short random hex seed. */
export function randomSeed(): string {
  return randomBytes(3).toString('hex')
}

/**
 * Parse optional `--seed <value>`, `--seed=<value>`, or `seed:<value>` from `/synth` input.
 * Falls back to a fresh random seed when omitted.
 */
export function parseSeedOption(rawInput: string): ParsedSeedOption {
  const match = /(?:^|\s)(?:--seed(?:=|\s+)|seed:)([A-Za-z0-9_-]{1,32})(?=\s|$)/i.exec(rawInput)
  if (match === null || match[1] === undefined) {
    return { cleanInput: rawInput.trim(), seed: randomSeed(), explicit: false }
  }
  const seed = match[1]
  const cleanInput = rawInput
    .replace(match[0], ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { cleanInput, seed, explicit: true }
}

/** Create a deterministic PRNG (`[0, 1)`) from an arbitrary string seed. */
export function createSeededRng(seed: string): () => number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  let state = (hash >>> 0) || 0x9e3779b9
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]!
}

/** Derive a varied musical blueprint from a seed. */
export function buildCompositionBlueprint(seed: string): CompositionBlueprint {
  const rng = createSeededRng(seed)
  const arrangement = pick(rng, ARRANGEMENTS)
  const rhythmFeel = pick(rng, RHYTHM_FEELS)
  const scaleRoot = Math.floor(rng() * 12)
  const progression = pick(rng, PROGRESSIONS)
  const scalePool = progression.minorBias
    ? ['minor', 'dorian', 'phrygian', 'pentatonic', 'blues']
    : ['major', 'mixolydian', 'dorian', 'pentatonic']
  const scaleId = pick(rng, scalePool)
  const harmonicRhythm = pick(rng, HARMONIC_RHYTHMS)
  const bassStyle = pick(rng, BASS_STYLES)
  const melodyContour = pick(rng, MELODY_CONTOURS)
  return {
    seed,
    arrangement,
    rhythmFeel,
    scaleRoot,
    scaleRootName: NOTE_NAMES[scaleRoot] ?? 'C',
    scaleId,
    progression,
    harmonicRhythm,
    bassStyle,
    melodyContour,
  }
}

/** Format a compact seed directive appended to `/synth <prompt>` followups. */
export function formatBlueprintPrompt(bp: CompositionBlueprint): string {
  return [
    `[Seed Blueprint | seed=${bp.seed}]`,
    `To avoid repetitive structure/progressions across runs, follow this seed variation (unless the user prompt explicitly specifies a different key, bar count, BPM, or structure):`,
    `- Form (${bp.arrangement.bars} bars): ${bp.arrangement.desc}`,
    `- Rhythm Feel: ${bp.rhythmFeel}`,
    `- Key & Scale: ${bp.scaleRootName} ${bp.scaleId} (scaleRoot=${bp.scaleRoot}, scaleId="${bp.scaleId}")`,
    `- Harmony: ${bp.progression.label} (${bp.harmonicRhythm})`,
    `- Bass & Melody: ${bp.bassStyle}; ${bp.melodyContour}`,
  ].join('\n')
}

function degreePitch(octaveBase: number, scaleRoot: number, intervals: readonly number[], degree: number): number {
  const len = intervals.length
  const oct = Math.floor(degree / len)
  const idx = ((degree % len) + len) % len
  const pitch = octaveBase + scaleRoot + oct * 12 + (intervals[idx] ?? 0)
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch))
}

export interface SeededGrooveSpec {
  seed: string
  bars: number
  scaleRoot: number
  scaleId: string
  swing?: number
  tracks: Array<{
    id: string
    name: string
    instrumentId: string
    gain: number
    pan?: number
    kit?: string
    notes: Note[]
  }>
}

/** Generate a seeded, varied multi-track groove for `/synth groove [bpm] [--seed <seed>]`. */
export function generateSeededGroove(bpm: number, seed: string): SeededGrooveSpec {
  const rng = createSeededRng(`groove:${seed}`)
  const bars = rng() < 0.4 ? 8 : 4
  const scaleRoot = Math.floor(rng() * 12)
  const scaleId = pick(rng, ['minor', 'dorian', 'pentatonic', 'major', 'mixolydian'] as const)
  const intervals = SCALE_INTERVALS[scaleId] ?? SCALE_INTERVALS.minor!
  const prog = pick(rng, PROGRESSIONS).degrees
  const kit = pick(rng, ['classic', '808', 'lofi', 'chip'] as const)
  const drumStyle = pick(rng, ['fourOnFloor', 'breakbeat', 'halftime', 'syncopated'] as const)
  const bassStyle = pick(rng, ['octave', 'syncopated', 'walking'] as const)
  const leadStyle = pick(rng, ['immediate', 'pickup2', 'callResponse', 'arp'] as const)
  const swing = drumStyle === 'syncopated' || drumStyle === 'breakbeat'
    ? Number((0.18 + rng() * 0.14).toFixed(2))
    : undefined

  const drums: Note[] = []
  const bass: Note[] = []
  const chords: Note[] = []
  const lead: Note[] = []

  const motifOffsets = [0, 1, 2, 4, 5].map(() => Math.floor(rng() * 6))
  const motifRhythm = leadStyle === 'arp'
    ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
    : leadStyle === 'callResponse'
      ? [0, 0.75, 1.5, 2.25]
      : [0, 0.75, 1.5, 2.5, 3.25]

  for (let bar = 0; bar < bars; bar += 1) {
    const b = bar * BEATS_PER_BAR
    const deg = prog[bar % prog.length] ?? 0

    // Drums
    if (bar === 0 || (bars === 8 && bar === 4)) {
      drums.push({ pitch: DRUM_CYMBAL, startBeat: b, durationBeats: 0.25, velocity: 92 })
    }
    if (drumStyle === 'fourOnFloor') {
      for (let beat = 0; beat < 4; beat += 1) {
        drums.push({ pitch: DRUM_KICK, startBeat: b + beat, durationBeats: 0.25, velocity: 114 })
        drums.push({ pitch: DRUM_HAT, startBeat: b + beat + 0.5, durationBeats: 0.25, velocity: 82 })
        if (beat === 1 || beat === 3) {
          drums.push({ pitch: DRUM_SNARE, startBeat: b + beat, durationBeats: 0.25, velocity: 108 })
        }
      }
      if (bar % 2 === 1) {
        drums.push({ pitch: DRUM_OPEN_HAT, startBeat: b + 3.5, durationBeats: 0.25, velocity: 86 })
      }
    } else if (drumStyle === 'breakbeat') {
      for (const beat of [0, 0.75, 2.5]) {
        drums.push({ pitch: DRUM_KICK, startBeat: b + beat, durationBeats: 0.25, velocity: 112 })
      }
      for (const beat of [1, 2.25, 3]) {
        drums.push({ pitch: DRUM_SNARE, startBeat: b + beat, durationBeats: 0.25, velocity: beat === 2.25 ? 78 : 110 })
      }
      for (let i = 0; i < 8; i += 1) {
        drums.push({ pitch: i === 7 && bar % 2 === 1 ? DRUM_OPEN_HAT : DRUM_HAT, startBeat: b + i * 0.5, durationBeats: 0.25, velocity: i % 2 === 0 ? 84 : 62 })
      }
    } else if (drumStyle === 'halftime') {
      for (const beat of [0, 1.5, 2.75]) {
        drums.push({ pitch: DRUM_KICK, startBeat: b + beat, durationBeats: 0.25, velocity: 116 })
      }
      drums.push({ pitch: DRUM_SNARE, startBeat: b + 2, durationBeats: 0.25, velocity: 114 })
      drums.push({ pitch: DRUM_CLAP, startBeat: b + 2, durationBeats: 0.25, velocity: 96 })
      for (let i = 0; i < 8; i += 1) {
        drums.push({ pitch: DRUM_HAT, startBeat: b + i * 0.5, durationBeats: 0.25, velocity: i % 2 === 0 ? 80 : 60 })
      }
      if (bar % 2 === 1) {
        drums.push({ pitch: DRUM_HAT, startBeat: b + 3.25, durationBeats: 0.25, velocity: 72 })
        drums.push({ pitch: DRUM_HAT, startBeat: b + 3.75, durationBeats: 0.25, velocity: 86 })
      }
    } else {
      for (const beat of [0, 1.75, 2.5]) {
        drums.push({ pitch: DRUM_KICK, startBeat: b + beat, durationBeats: 0.25, velocity: 110 })
      }
      drums.push({ pitch: DRUM_SNARE, startBeat: b + 1, durationBeats: 0.25, velocity: 100 })
      drums.push({ pitch: DRUM_RIM, startBeat: b + 3, durationBeats: 0.25, velocity: 94 })
      for (let i = 0; i < 8; i += 1) {
        drums.push({ pitch: i === 5 ? DRUM_OPEN_HAT : DRUM_HAT, startBeat: b + i * 0.5, durationBeats: 0.25, velocity: i % 2 === 0 ? 78 : 56 })
      }
    }

    // Bass
    const root = degreePitch(36, scaleRoot, intervals, deg)
    const fifth = degreePitch(36, scaleRoot, intervals, deg + 4)
    if (bassStyle === 'octave') {
      for (let step = 0; step < 8; step += 1) {
        const pitch = step % 2 === 1 ? Math.min(PITCH_MAX, root + 12) : root
        bass.push({ pitch, startBeat: b + step * 0.5, durationBeats: 0.25, velocity: step % 2 === 0 ? 110 : 86 })
      }
    } else if (bassStyle === 'syncopated') {
      bass.push(
        { pitch: root, startBeat: b, durationBeats: 0.75, velocity: 112 },
        { pitch: root, startBeat: b + 1.5, durationBeats: 0.5, velocity: 96 },
        { pitch: Math.min(PITCH_MAX, root + 12), startBeat: b + 2.5, durationBeats: 0.5, velocity: 104 },
        { pitch: fifth, startBeat: b + 3.5, durationBeats: 0.5, velocity: 94 },
      )
    } else {
      bass.push(
        { pitch: root, startBeat: b, durationBeats: 1, velocity: 110 },
        { pitch: fifth, startBeat: b + 1, durationBeats: 1, velocity: 96 },
        { pitch: degreePitch(36, scaleRoot, intervals, deg + 2), startBeat: b + 2, durationBeats: 1, velocity: 100 },
        { pitch: fifth, startBeat: b + 3, durationBeats: 0.75, velocity: 92 },
      )
    }

    // Chords
    for (const offset of [0, 2, 4]) {
      const chordPitch = degreePitch(48, scaleRoot, intervals, deg + offset)
      chords.push({ pitch: chordPitch, startBeat: b, durationBeats: 3.5, velocity: 78 })
    }

    // Lead (varied entrance/contour instead of one fixed pattern)
    const skipForPickup = leadStyle === 'pickup2' && bar < 2
    if (!skipForPickup) {
      const octaveBoost = bars === 8 && bar >= 4 ? 12 : 0
      motifRhythm.forEach((stepBeat, idx) => {
        const degOffset = motifOffsets[(idx + bar) % motifOffsets.length] ?? 0
        const pitch = Math.min(PITCH_MAX, degreePitch(60, scaleRoot, intervals, deg + degOffset) + octaveBoost)
        const dur = leadStyle === 'arp' ? 0.25 : idx === motifRhythm.length - 1 ? 0.75 : 0.5
        lead.push({
          pitch,
          startBeat: b + stepBeat,
          durationBeats: dur,
          velocity: 92 + Math.floor(rng() * 20),
        })
      })
    }
  }

  return {
    seed,
    bars,
    scaleRoot,
    scaleId,
    ...(swing !== undefined ? { swing } : {}),
    tracks: [
      { id: 'drums', name: '鼓组', instrumentId: 'drums', gain: 0.85, kit, notes: drums },
      { id: 'bass', name: '贝斯', instrumentId: 'bass', gain: 0.82, pan: -0.1, notes: bass },
      { id: 'keys', name: '和弦', instrumentId: 'keys', gain: 0.64, pan: -0.22, notes: chords },
      { id: 'lead', name: '主音', instrumentId: 'lead', gain: 0.72, pan: 0.2, notes: lead },
    ],
  }
}
