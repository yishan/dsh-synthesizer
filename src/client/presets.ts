/**
 * 3-Tier Preset & Onboarding Library:
 * - Tier 1: Full Multi-Track Song / Vibe Templates + Procedural Groove Jam Generator
 * - Tier 2: Curated Synth Patch Presets (Waveform, Filter, EnvMod, ADSR, Unison, Sub, Drive, Delay)
 * - Tier 3: Per-Track Drum Beat & Melodic Riff Generators + Musical Scale Helpers
 */
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
  MAX_NOTES_PER_TRACK,
  PITCH_MAX,
  PITCH_MIN,
  STEP_BEATS,
  createProjectId,
  type Note,
  type Project,
  type SynthPatch,
} from '../model.ts'
import { DEFAULT_SYNTH_PATCHES } from './instruments.ts'

export interface SynthPresetItem {
  id: string
  instrumentId: string
  label: string
  badge?: string
  description: string
  color?: string
  patch: SynthPatch
}

/** Shorthand for one patch. Order: waveform, detune, sub, cutoff, Q, envMod, A, D, S, R, delay, drive. */
function patch(
  waveform: SynthPatch['waveform'],
  detune: number,
  subMix: number,
  cutoff: number,
  resonance: number,
  envMod: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  delayMix: number,
  drive: number,
): SynthPatch {
  return { waveform, detune, subMix, cutoff, resonance, envMod, attack, decay, sustain, release, delayMix, drive }
}

/**
 * Further sounds per instrument. The first preset of each instrument (below)
 * is its default patch; these are alternatives within the same instrument.
 */
const EXTRA_SYNTH_PRESETS: readonly SynthPresetItem[] = [
  // Lead
  { id: 'lead-square', instrumentId: 'lead', label: '方波主音', description: '中空的方波，轻微失谐，适合旋律线',
    patch: patch('square', 6, 0.1, 3200, 2, 0.3, 0.005, 0.15, 0.7, 0.15, 0.25, 0.1) },
  { id: 'lead-sine', instrumentId: 'lead', label: '柔和正弦', description: '圆润干净的正弦，带一点回声',
    patch: patch('sine', 0, 0, 6000, 0.7, 0, 0.02, 0.2, 0.8, 0.3, 0.3, 0) },
  { id: 'lead-bright', instrumentId: 'lead', label: '锐利锯齿', description: '明亮、带过载的单锯齿，穿透力强',
    patch: patch('sawtooth', 3, 0, 9000, 3, 0.5, 0.002, 0.1, 0.6, 0.1, 0.15, 0.35) },
  // Bass
  { id: 'bass-sub', instrumentId: 'bass', label: 'Sub 低频', description: '几乎只有基音的正弦低频',
    patch: patch('sine', 0, 0.5, 400, 0.7, 0.1, 0.005, 0.2, 0.9, 0.12, 0, 0.15) },
  { id: 'bass-reese', instrumentId: 'bass', label: 'Reese', description: '两路大失谐锯齿互相拍频的厚贝斯',
    patch: patch('sawtooth', 22, 0.3, 700, 1.5, 0.15, 0.01, 0.3, 0.85, 0.2, 0, 0.3) },
  { id: 'bass-pluck', instrumentId: 'bass', label: '弹拨贝斯', description: '起音有滤波包络的短促贝斯，适合 Disco 和 Funk',
    patch: patch('sawtooth', 0, 0.25, 500, 3, 0.7, 0.002, 0.16, 0.2, 0.1, 0, 0.2) },
  // Pad
  { id: 'pad-strings', instrumentId: 'pad', label: '弦乐', description: '慢起音的失谐锯齿合奏',
    patch: patch('sawtooth', 14, 0, 3800, 0.8, 0.1, 0.35, 0.5, 0.85, 0.9, 0.2, 0) },
  { id: 'pad-dark', instrumentId: 'pad', label: '暗色铺底', description: '低沉、缓慢的三角波铺底',
    patch: patch('triangle', 10, 0.4, 900, 1, 0.2, 0.6, 0.8, 0.8, 1.4, 0.3, 0) },
  { id: 'pad-glass', instrumentId: 'pad', label: '玻璃铺底', description: '带共鸣的方波，尾音长而通透',
    patch: patch('square', 8, 0, 5200, 2.5, 0.3, 0.25, 0.6, 0.6, 1.2, 0.45, 0) },
  // Keys
  { id: 'keys-organ', instrumentId: 'keys', label: '风琴', description: '持续不衰减的正弦加低八度',
    patch: patch('sine', 4, 0.6, 5000, 0.7, 0, 0.005, 0.05, 1, 0.08, 0.1, 0.2) },
  { id: 'keys-clav', instrumentId: 'keys', label: 'Clav', description: '短促有咬字的方波键盘',
    patch: patch('square', 0, 0, 2600, 4, 0.6, 0.002, 0.12, 0.25, 0.08, 0, 0.25) },
  { id: 'keys-warm', instrumentId: 'keys', label: '温暖电钢', description: '三角波电钢，衰减慢，略带回声',
    patch: patch('triangle', 5, 0.2, 1800, 1, 0.35, 0.004, 0.5, 0.3, 0.4, 0.2, 0) },
  // Acid
  { id: 'acid-squelch', instrumentId: 'acid', label: '尖叫 303', description: '极高共鸣、强包络扫频',
    patch: patch('sawtooth', 0, 0, 300, 16, 0.95, 0.002, 0.14, 0.15, 0.08, 0.2, 0.5) },
  { id: 'acid-square', instrumentId: 'acid', label: '方波 303', description: '方波版酸液线，更空、更木质',
    patch: patch('square', 0, 0, 500, 11, 0.75, 0.002, 0.2, 0.2, 0.1, 0.1, 0.3) },
  // Pluck
  { id: 'pluck-muted', instrumentId: 'pluck', label: '闷音拨弦', description: '很短的闷音，适合切分节奏',
    patch: patch('sawtooth', 0, 0, 900, 2, 0.6, 0.002, 0.09, 0, 0.08, 0.2, 0) },
  { id: 'pluck-harp', instrumentId: 'pluck', label: '竖琴', description: '三角波长衰减拨弦',
    patch: patch('triangle', 3, 0, 4200, 1, 0.3, 0.003, 0.5, 0, 0.6, 0.35, 0) },
  // Chip
  { id: 'chip-triangle', instrumentId: 'chip', label: '三角波', description: '红白机的三角波声道，常用作贝斯',
    patch: patch('triangle', 0, 0, 12000, 0.7, 0, 0.002, 0.05, 1, 0.03, 0, 0) },
  { id: 'chip-pulse', instrumentId: 'chip', label: '失谐脉冲', description: '两路失谐方波，带回声的 8-bit 主音',
    patch: patch('square', 9, 0, 9000, 0.7, 0, 0.002, 0.08, 0.5, 0.06, 0.25, 0) },
  // Bell
  { id: 'bell-box', instrumentId: 'bell', label: '音乐盒', description: '纯正弦短音，像八音盒',
    patch: patch('sine', 0, 0, 8000, 1, 0.2, 0.002, 0.6, 0, 0.8, 0.3, 0) },
  { id: 'bell-glass', instrumentId: 'bell', label: '玻璃铃', description: '大失谐三角波，金属感长尾',
    patch: patch('triangle', 18, 0, 7000, 5, 0.4, 0.002, 0.9, 0, 1.2, 0.5, 0) },
]

/** The patch of a preset by id. */
function presetPatch(id: string): SynthPatch {
  const found = EXTRA_SYNTH_PRESETS.find((item) => item.id === id)
  if (found === undefined) throw new Error(`unknown preset ${id}`)
  return { ...found.patch }
}

/** Presets offered for one instrument, default first. */
export function presetsFor(instrumentId: string): readonly SynthPresetItem[] {
  return SYNTH_PATCH_PRESETS.filter((item) => item.instrumentId === instrumentId)
}

const PATCH_KEYS = [
  'detune', 'subMix', 'cutoff', 'resonance', 'envMod', 'attack', 'decay', 'sustain', 'release', 'delayMix', 'drive',
] as const

/** True when a track's patch is exactly this preset, i.e. it has not been tweaked since. */
export function isPreset(current: SynthPatch, preset: SynthPresetItem): boolean {
  if (current.waveform !== preset.patch.waveform) return false
  return PATCH_KEYS.every((key) => Math.abs(current[key] - preset.patch[key]) < 1e-6)
}

export const SYNTH_PATCH_PRESETS: readonly SynthPresetItem[] = [
  {
    id: 'lead',
    instrumentId: 'lead',
    label: '超级锯齿 Lead',
    badge: 'SUPERSAW',
    description: '宽广双振荡器锯齿波 + 低八度垫底 + 立体声回声',
    color: '#3b82f6',
    patch: DEFAULT_SYNTH_PATCHES.lead!,
  },
  {
    id: 'acid',
    instrumentId: 'acid',
    label: '303 酸液贝斯',
    badge: 'TB-303',
    description: '高共鸣峰 Q + 强包络扫频 + 失真过载，经典 Acid 咆哮',
    color: '#eab308',
    patch: DEFAULT_SYNTH_PATCHES.acid!,
  },
  {
    id: 'bass',
    instrumentId: 'bass',
    label: '复古方波 Bass',
    badge: 'ANALOG',
    description: '饱满方波 + 厚重低八度 Sub，扎实驱动低频',
    color: '#10b981',
    patch: DEFAULT_SYNTH_PATCHES.bass!,
  },
  {
    id: 'pad',
    instrumentId: 'pad',
    label: 'Juno 暖铺底',
    badge: 'WARM PAD',
    description: '慢起音失谐波 + 柔和低通滤波，适合长音和弦铺底',
    color: '#8b5cf6',
    patch: DEFAULT_SYNTH_PATCHES.pad!,
  },
  {
    id: 'pluck',
    instrumentId: 'pluck',
    label: '水晶拨弦 Pluck',
    badge: 'PLUCK',
    description: '瞬态滤波包络 + 清脆短促衰减 + 空间延迟尾音',
    color: '#06b6d4',
    patch: DEFAULT_SYNTH_PATCHES.pluck!,
  },
  {
    id: 'keys',
    instrumentId: 'keys',
    label: '复古电钢 Keys',
    badge: 'RHODES',
    description: '温润三角波 + 细腻泛音衰减，适合 Lo-Fi 爵士和弦',
    color: '#f97316',
    patch: DEFAULT_SYNTH_PATCHES.keys!,
  },
  {
    id: 'chip',
    instrumentId: 'chip',
    label: '红白机 8-Bit',
    badge: 'CHIPTUNE',
    description: '零失谐纯粹方波 + 极速包络，经典游戏机音色',
    color: '#ec4899',
    patch: DEFAULT_SYNTH_PATCHES.chip!,
  },
  {
    id: 'bell',
    instrumentId: 'bell',
    label: '星际铃音 Bell',
    badge: 'FM BELL',
    description: '宽失谐正弦金属泛音 + 漫长星空回声',
    color: '#14b8a6',
    patch: DEFAULT_SYNTH_PATCHES.bell!,
  },
  ...EXTRA_SYNTH_PRESETS,
]

export interface ScaleDefinition {
  id: string
  name: string
  intervals: readonly number[]
}

export const SCALES: readonly ScaleDefinition[] = [
  { id: 'minor', name: '自然小调 Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'major', name: '自然大调 Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'pentatonic', name: '小调五声 Penta', intervals: [0, 3, 5, 7, 10] },
  { id: 'dorian', name: '多利亚 Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'chromatic', name: '半音阶 All', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
]

export const ROOT_NOTES = [
  { semitone: 0, name: 'C' },
  { semitone: 2, name: 'D' },
  { semitone: 3, name: 'Eb' },
  { semitone: 4, name: 'E' },
  { semitone: 5, name: 'F' },
  { semitone: 7, name: 'G' },
  { semitone: 9, name: 'A' },
  { semitone: 10, name: 'Bb' },
] as const

export function isPitchInScale(pitch: number, rootSemitone: number, scaleId: string): boolean {
  const scale = SCALES.find((item) => item.id === scaleId)
  if (scale === undefined || scale.id === 'chromatic') return true
  const rel = ((pitch - rootSemitone) % 12 + 12) % 12
  return scale.intervals.includes(rel)
}

function n(pitch: number, startBeat: number, durationBeats = STEP_BEATS, velocity = 100): Note {
  return { pitch, startBeat, durationBeats, velocity }
}

function sortNotes(notes: Note[]): Note[] {
  return notes
    .slice(0, MAX_NOTES_PER_TRACK)
    .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch)
}

export type DrumPatternId = 'synthwave' | 'fourOnFloor' | 'lofi' | 'breakbeat' | 'disco'

export const DRUM_PATTERN_LIST: ReadonlyArray<{ id: DrumPatternId; label: string }> = [
  { id: 'synthwave', label: '霓虹复古拍' },
  { id: 'fourOnFloor', label: 'Techno 四四拍' },
  { id: 'lofi', label: 'Lo-Fi 律动' },
  { id: 'breakbeat', label: 'Amen 碎拍' },
  { id: 'disco', label: '放克迪斯科' },
]

export function generateDrumPattern(patternId: DrumPatternId, bars = 4): Note[] {
  const notes: Note[] = []
  for (let bar = 0; bar < bars; bar += 1) {
    const b = bar * 4
    if (patternId === 'synthwave') {
      if (bar === 0) notes.push(n(DRUM_CYMBAL, b, 0.25, 95))
      for (const beat of [0, 1.5, 2, 3.25]) notes.push(n(DRUM_KICK, b + beat, 0.25, 115))
      for (const beat of [1, 3]) {
        notes.push(n(DRUM_SNARE, b + beat, 0.25, 112))
        notes.push(n(DRUM_CLAP, b + beat, 0.25, 92))
      }
      for (let step = 0; step < 16; step += 1) {
        const beat = step * 0.25
        if (step === 6 || step === 14) {
          notes.push(n(DRUM_OPEN_HAT, b + beat, 0.25, 88))
        } else {
          notes.push(n(DRUM_HAT, b + beat, 0.25, step % 2 === 0 ? 86 : 62))
        }
      }
      if (bar % 2 === 1) {
        notes.push(n(DRUM_TOM_LOW, b + 3.5, 0.25, 100), n(DRUM_TOM_LOW, b + 3.75, 0.25, 110))
      }
    } else if (patternId === 'fourOnFloor') {
      if (bar % 4 === 0) notes.push(n(DRUM_CYMBAL, b, 0.25, 90))
      for (let beat = 0; beat < 4; beat += 1) {
        notes.push(n(DRUM_KICK, b + beat, 0.25, 120))
        notes.push(n(DRUM_OPEN_HAT, b + beat + 0.5, 0.25, 95))
        notes.push(n(DRUM_HAT, b + beat + 0.25, 0.25, 68))
        notes.push(n(DRUM_HAT, b + beat + 0.75, 0.25, 76))
      }
      notes.push(n(DRUM_CLAP, b + 1, 0.25, 108), n(DRUM_CLAP, b + 3, 0.25, 112))
      notes.push(n(DRUM_RIM, b + 1.75, 0.25, 80), n(DRUM_TOM_LOW, b + 3.5, 0.25, 92))
    } else if (patternId === 'lofi') {
      notes.push(n(DRUM_KICK, b + 0, 0.25, 110), n(DRUM_KICK, b + 1.75, 0.25, 88), n(DRUM_KICK, b + 2.5, 0.25, 102))
      notes.push(n(DRUM_SNARE, b + 1, 0.25, 98), n(DRUM_RIM, b + 1, 0.25, 84))
      notes.push(n(DRUM_SNARE, b + 3, 0.25, 104), n(DRUM_RIM, b + 2.25, 0.25, 68))
      for (let eigth = 0; eigth < 8; eigth += 1) {
        const beat = eigth * 0.5
        if (eigth === 5) notes.push(n(DRUM_OPEN_HAT, b + beat, 0.25, 74))
        else notes.push(n(DRUM_HAT, b + beat, 0.25, eigth % 2 === 0 ? 78 : 54))
      }
      if (bar % 2 === 1) notes.push(n(DRUM_HAT, b + 3.75, 0.25, 64))
    } else if (patternId === 'breakbeat') {
      notes.push(n(DRUM_KICK, b + 0, 0.25, 118), n(DRUM_KICK, b + 0.5, 0.25, 96), n(DRUM_KICK, b + 2.5, 0.25, 114))
      notes.push(n(DRUM_SNARE, b + 1, 0.25, 115), n(DRUM_SNARE, b + 1.75, 0.25, 78))
      notes.push(n(DRUM_SNARE, b + 2.25, 0.25, 82), n(DRUM_SNARE, b + 3, 0.25, 118))
      if (bar % 2 === 1) notes.push(n(DRUM_SNARE, b + 3.5, 0.25, 92), n(DRUM_CLAP, b + 3.75, 0.25, 104))
      for (let step = 0; step < 8; step += 1) {
        notes.push(n(DRUM_HAT, b + step * 0.5, 0.25, 85))
      }
      notes.push(n(DRUM_OPEN_HAT, b + 1.5, 0.25, 92))
    } else if (patternId === 'disco') {
      for (let beat = 0; beat < 4; beat += 1) {
        notes.push(n(DRUM_KICK, b + beat, 0.25, 115))
        notes.push(n(DRUM_HAT, b + beat, 0.25, 80))
        notes.push(n(DRUM_OPEN_HAT, b + beat + 0.5, 0.25, 98))
      }
      notes.push(n(DRUM_SNARE, b + 1, 0.25, 106), n(DRUM_CLAP, b + 1, 0.25, 98))
      notes.push(n(DRUM_SNARE, b + 3, 0.25, 110), n(DRUM_CLAP, b + 3, 0.25, 102))
    }
  }
  return sortNotes(notes)
}

export type MelodicPatternId = 'chords' | 'octaveBass' | 'acidLine' | 'arpUp' | 'randomRiff'

export const MELODIC_PATTERN_LIST: ReadonlyArray<{ id: MelodicPatternId; label: string }> = [
  { id: 'chords', label: '和弦进行' },
  { id: 'octaveBass', label: '八度贝斯' },
  { id: 'acidLine', label: '303 酸液线' },
  { id: 'arpUp', label: '流水琶音' },
  { id: 'randomRiff', label: '随机灵感旋律' },
]

function scalePitches(rootSemitone: number, scaleId: string, minPitch: number, maxPitch: number): number[] {
  const result: number[] = []
  for (let p = minPitch; p <= maxPitch; p += 1) {
    if (isPitchInScale(p, rootSemitone, scaleId)) result.push(p)
  }
  return result.length > 0 ? result : [60, 62, 63, 65, 67, 68, 70]
}

export function generateMelodicPattern(
  patternId: MelodicPatternId,
  bars = 4,
  rootSemitone = 9,
  scaleId = 'minor',
): Note[] {
  const notes: Note[] = []
  const scale = SCALES.find((s) => s.id === scaleId)?.intervals ?? [0, 2, 3, 5, 7, 8, 10]
  const degreePitch = (octaveBase: number, degree: number): number => {
    const len = scale.length
    const oct = Math.floor(degree / len)
    const idx = ((degree % len) + len) % len
    const pitch = octaveBase + rootSemitone + oct * 12 + (scale[idx] ?? 0)
    return Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch))
  }

  const progDegrees = [0, 5, 2, 6] // i - VI - III - VII in minor

  if (patternId === 'chords') {
    for (let bar = 0; bar < bars; bar += 1) {
      const deg = progDegrees[bar % progDegrees.length] ?? 0
      const b = bar * 4
      const triad = [
        degreePitch(48, deg),
        degreePitch(48, deg + 2),
        degreePitch(48, deg + 4),
        degreePitch(48, deg + 6),
      ]
      const unique = [...new Set(triad)]
      for (const pitch of unique) {
        notes.push(n(pitch, b, 3.75, 86))
      }
    }
  } else if (patternId === 'octaveBass') {
    for (let bar = 0; bar < bars; bar += 1) {
      const deg = progDegrees[bar % progDegrees.length] ?? 0
      const low = degreePitch(36, deg)
      const high = Math.min(PITCH_MAX, low + 12)
      const b = bar * 4
      for (let step = 0; step < 16; step += 1) {
        const pitch = step % 2 === 0 ? low : high
        const vel = step % 4 === 0 ? 112 : 84
        notes.push(n(pitch, b + step * 0.25, 0.25, vel))
      }
    }
  } else if (patternId === 'acidLine') {
    const stepsPattern = [
      { step: 0, deg: 0, dur: 0.25, vel: 118 },
      { step: 1, deg: 0, dur: 0.25, vel: 78 },
      { step: 2, deg: 7, dur: 0.5, vel: 122 },
      { step: 4, deg: 0, dur: 0.25, vel: 90 },
      { step: 6, deg: 3, dur: 0.25, vel: 115 },
      { step: 7, deg: 2, dur: 0.5, vel: 105 },
      { step: 9, deg: 0, dur: 0.25, vel: 82 },
      { step: 10, deg: 6, dur: 0.5, vel: 120 },
      { step: 12, deg: 4, dur: 0.25, vel: 110 },
      { step: 14, deg: 7, dur: 0.25, vel: 124 },
      { step: 15, deg: 5, dur: 0.25, vel: 96 },
    ]
    for (let bar = 0; bar < bars; bar += 1) {
      const barOffsetDeg = bar % 2 === 1 ? 2 : 0
      const b = bar * 4
      for (const item of stepsPattern) {
        const pitch = degreePitch(36, item.deg + barOffsetDeg)
        notes.push(n(pitch, b + item.step * 0.25, item.dur, item.vel))
      }
    }
  } else if (patternId === 'arpUp') {
    const arpOffsets = [0, 2, 4, 7, 4, 2, 0, 4]
    for (let bar = 0; bar < bars; bar += 1) {
      const deg = progDegrees[bar % progDegrees.length] ?? 0
      const b = bar * 4
      for (let step = 0; step < 16; step += 1) {
        const offset = arpOffsets[step % arpOffsets.length] ?? 0
        const pitch = degreePitch(60, deg + offset)
        notes.push(n(pitch, b + step * 0.25, 0.25, step % 4 === 0 ? 108 : 82))
      }
    }
  } else if (patternId === 'randomRiff') {
    const pool = scalePitches(rootSemitone, scaleId, 55, 76)
    for (let bar = 0; bar < bars; bar += 1) {
      const b = bar * 4
      let step = 0
      while (step < 16) {
        if (Math.random() < 0.25) {
          step += 1
          continue
        }
        const durSteps = Math.random() < 0.35 ? 2 : Math.random() < 0.15 ? 4 : 1
        const clampedSteps = Math.min(durSteps, 16 - step)
        const pitch = pool[Math.floor(Math.random() * pool.length)] ?? 60
        const vel = 80 + Math.floor(Math.random() * 40)
        notes.push(n(pitch, b + step * 0.25, clampedSteps * 0.25, vel))
        step += clampedSteps
      }
    }
  }
  return sortNotes(notes)
}

export function transposeNotes(notes: readonly Note[], semitones: number): Note[] {
  return notes.map((note) => ({
    ...note,
    pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, note.pitch + semitones)),
  }))
}

export interface SongPresetItem {
  id: string
  title: string
  subtitle: string
  bpm: number
  accent: string
  build: (projectId?: string) => Project
}

/**
 * 1. Synthwave '84 (霓虹夜驾 · 118 BPM · A Minor)
 */
function buildSynthwaveProject(id = createProjectId()): Project {
  return {
    version: 1,
    id,
    name: '霓虹夜驾 · Synthwave 84',
    bpm: 118,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.85,
        notes: generateDrumPattern('synthwave', 4),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'bass',
        mute: false,
        gain: 0.82,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.bass!,
          waveform: 'sawtooth',
          detune: 6,
          subMix: 0.5,
          cutoff: 620,
          resonance: 3.8,
          envMod: 0.58,
          drive: 0.28,
        },
        notes: generateMelodicPattern('octaveBass', 4, 9, 'minor'),
      },
      {
        id: 'keys',
        name: '铺底',
        instrumentId: 'pad',
        mute: false,
        gain: 0.68,
        synth: DEFAULT_SYNTH_PATCHES.pad!,
        notes: generateMelodicPattern('chords', 4, 9, 'minor'),
      },
      {
        id: 'lead',
        name: '琶音',
        instrumentId: 'lead',
        mute: false,
        gain: 0.72,
        synth: DEFAULT_SYNTH_PATCHES.lead!,
        notes: generateMelodicPattern('arpUp', 4, 9, 'minor'),
      },
    ],
  }
}

/**
 * 2. Lo-Fi Chillhop (雨夜自习室 · 88 BPM · D Dorian)
 */
function buildLofiProject(id = createProjectId()): Project {
  const chords: Note[] = [
    // Bar 1: Dm9 (D3, F3, A3, C4, E4)
    n(50, 0, 3.5, 82), n(53, 0, 3.5, 78), n(57, 0, 3.5, 80), n(60, 0, 3.5, 84), n(64, 0, 3.5, 76),
    // Bar 2: G13 (G3, F3, B3, E4)
    n(55, 4, 3.5, 80), n(53, 4, 3.5, 76), n(59, 4, 3.5, 82), n(64, 4, 3.5, 78),
    // Bar 3: Cmaj9 (C3, E3, G3, B3, D4)
    n(48, 8, 3.5, 84), n(52, 8, 3.5, 78), n(55, 8, 3.5, 80), n(59, 8, 3.5, 82), n(62, 8, 3.5, 78),
    // Bar 4: A7alt (A3, G3, C#4, F4)
    n(57, 12, 3.5, 82), n(55, 12, 3.5, 78), n(61, 12, 3.5, 80), n(65, 12, 3.5, 76),
  ]
  const bassNotes: Note[] = [
    n(38, 0, 1.5, 104), n(38, 2.5, 1, 90), n(40, 3.5, 0.5, 84),
    n(43, 4, 1.5, 102), n(43, 6.5, 1, 88), n(41, 7.5, 0.5, 85),
    n(36, 8, 1.5, 106), n(36, 10.5, 1, 92), n(43, 11.5, 0.5, 86),
    n(45, 12, 1.5, 100), n(45, 14, 1, 88), n(37, 15, 1, 92),
  ]
  const melody: Note[] = [
    n(69, 0.5, 0.75, 92), n(72, 1.25, 0.5, 86), n(74, 2, 1.25, 96), n(72, 3.5, 0.5, 82),
    n(71, 4.5, 1, 90), n(67, 5.5, 0.75, 84), n(64, 6.5, 1.25, 88),
    n(67, 8.5, 0.75, 92), n(71, 9.25, 0.5, 88), n(74, 10, 1.5, 95),
    n(76, 12, 0.75, 94), n(73, 12.75, 0.75, 88), n(69, 13.5, 2, 90),
  ]
  return {
    version: 1,
    id,
    name: '雨夜自习室 · Lo-Fi Chill',
    bpm: 88,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.8,
        notes: generateDrumPattern('lofi', 4),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'bass',
        mute: false,
        gain: 0.82,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.bass!,
          waveform: 'triangle',
          detune: 2,
          subMix: 0.65,
          cutoff: 380,
          resonance: 1.8,
          envMod: 0.25,
          drive: 0.12,
        },
        notes: sortNotes(bassNotes),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'keys',
        mute: false,
        gain: 0.74,
        synth: DEFAULT_SYNTH_PATCHES.keys!,
        notes: sortNotes(chords),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: 'bell',
        mute: false,
        gain: 0.68,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.bell!,
          waveform: 'sine',
          detune: 10,
          cutoff: 2400,
          resonance: 2.4,
          attack: 0.03,
          decay: 0.35,
          sustain: 0.45,
          release: 0.3,
          delayMix: 0.36,
        },
        notes: sortNotes(melody),
      },
    ],
  }
}

/**
 * 3. Acid 303 Warehouse (酸液仓库 · 132 BPM · E Minor)
 */
function buildAcidProject(id = createProjectId()): Project {
  const stabs: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    for (const beat of [0.75, 2.5]) {
      stabs.push(n(64, b + beat, 0.5, 96), n(67, b + beat, 0.5, 94), n(71, b + beat, 0.5, 92))
    }
  }
  return {
    version: 1,
    id,
    name: '酸液仓库 · Acid 303',
    bpm: 132,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.88,
        notes: generateDrumPattern('fourOnFloor', 4),
      },
      {
        id: 'bass',
        name: '酸液',
        instrumentId: 'acid',
        mute: false,
        gain: 0.85,
        synth: DEFAULT_SYNTH_PATCHES.acid!,
        notes: generateMelodicPattern('acidLine', 4, 4, 'minor'),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'pluck',
        mute: false,
        gain: 0.66,
        synth: DEFAULT_SYNTH_PATCHES.pluck!,
        notes: sortNotes(stabs),
      },
      {
        id: 'lead',
        name: '琶音',
        instrumentId: 'lead',
        mute: false,
        gain: 0.65,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.lead!,
          cutoff: 3800,
          resonance: 4.5,
          envMod: 0.65,
          delayMix: 0.38,
        },
        notes: generateMelodicPattern('arpUp', 4, 4, 'pentatonic'),
      },
    ],
  }
}

/**
 * 4. 8-Bit Chiptune Quest (红白机冒险 · 140 BPM · C Minor)
 */
function buildChiptuneProject(id = createProjectId()): Project {
  const leadNotes: Note[] = [
    n(72, 0, 0.5, 110), n(75, 0.5, 0.5, 106), n(79, 1, 0.75, 115), n(77, 1.75, 0.25, 100),
    n(75, 2, 0.5, 108), n(74, 2.5, 0.5, 104), n(72, 3, 1, 112),
    n(70, 4, 0.5, 108), n(74, 4.5, 0.5, 106), n(77, 5, 0.75, 114), n(75, 5.75, 0.25, 100),
    n(74, 6, 0.5, 106), n(70, 6.5, 0.5, 102), n(67, 7, 1, 110),
    n(68, 8, 0.5, 110), n(72, 8.5, 0.5, 108), n(75, 9, 0.75, 116), n(80, 9.75, 0.25, 118),
    n(79, 10, 0.5, 112), n(75, 10.5, 0.5, 106), n(74, 11, 1, 110),
    n(72, 12, 0.5, 112), n(74, 12.5, 0.5, 108), n(75, 13, 0.5, 114), n(79, 13.5, 0.5, 118),
    n(84, 14, 2, 120),
  ]
  return {
    version: 1,
    id,
    name: '红白机冒险 · 8-Bit Quest',
    bpm: 140,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.78,
        notes: generateDrumPattern('breakbeat', 4),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'chip',
        mute: false,
        gain: 0.8,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.chip!,
          waveform: 'triangle',
          subMix: 0.35,
          cutoff: 4200,
        },
        notes: generateMelodicPattern('octaveBass', 4, 0, 'minor'),
      },
      {
        id: 'keys',
        name: '琶音',
        instrumentId: 'chip',
        mute: false,
        gain: 0.62,
        synth: DEFAULT_SYNTH_PATCHES.chip!,
        notes: generateMelodicPattern('arpUp', 4, 0, 'minor'),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: 'chip',
        mute: false,
        gain: 0.78,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.chip!,
          detune: 4,
          delayMix: 0.2,
        },
        notes: sortNotes(leadNotes),
      },
    ],
  }
}

/**
 * 5. Cosmic Drift Ambient (深空漂流 · 96 BPM · F Major / D Minor)
 */
function buildAmbientProject(id = createProjectId()): Project {
  const sparseDrums: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    sparseDrums.push(n(DRUM_KICK, b + 0, 0.25, 92), n(DRUM_KICK, b + 0.75, 0.25, 70))
    sparseDrums.push(n(DRUM_RIM, b + 2, 0.25, 76), n(DRUM_HAT, b + 1.5, 0.25, 58), n(DRUM_HAT, b + 3.5, 0.25, 54))
  }
  return {
    version: 1,
    id,
    name: '深空漂流 · Cosmic Drift',
    bpm: 96,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.65,
        notes: sortNotes(sparseDrums),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'bass',
        mute: false,
        gain: 0.76,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.bass!,
          waveform: 'sine',
          subMix: 0.7,
          cutoff: 320,
          attack: 0.08,
          release: 0.4,
        },
        notes: [n(41, 0, 4, 100), n(38, 4, 4, 98), n(36, 8, 4, 102), n(43, 12, 4, 96)],
      },
      {
        id: 'keys',
        name: '铺底',
        instrumentId: 'pad',
        mute: false,
        gain: 0.78,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.pad!,
          waveform: 'sawtooth',
          detune: 22,
          cutoff: 1450,
          attack: 0.35,
          release: 0.85,
          delayMix: 0.45,
        },
        notes: generateMelodicPattern('chords', 4, 5, 'major'),
      },
      {
        id: 'lead',
        name: '铃音',
        instrumentId: 'bell',
        mute: false,
        gain: 0.72,
        synth: DEFAULT_SYNTH_PATCHES.bell!,
        notes: generateMelodicPattern('arpUp', 4, 5, 'major'),
      },
    ],
  }
}

/**
 * 6. Disco House (午夜舞池 · 122 BPM · A Minor). Uses the 808 kit and the newer sounds.
 */
function buildDiscoProject(id = createProjectId()): Project {
  return {
    version: 1,
    id,
    name: '午夜舞池 · Disco House',
    bpm: 122,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 9,
    scaleId: 'minor',
    tracks: [
      { id: 'drums', name: '鼓', instrumentId: 'drums', mute: false, gain: 0.85, kit: '808',
        notes: generateDrumPattern('disco', 4) },
      { id: 'bass', name: '贝斯', instrumentId: 'bass', mute: false, gain: 0.84,
        synth: presetPatch('bass-pluck'), notes: generateMelodicPattern('octaveBass', 4, 9, 'minor') },
      { id: 'pad', name: '铺底', instrumentId: 'pad', mute: false, gain: 0.6,
        synth: presetPatch('pad-strings'), notes: generateMelodicPattern('chords', 4, 9, 'minor') },
      { id: 'pluck', name: '琶音', instrumentId: 'pluck', mute: false, gain: 0.66,
        synth: presetPatch('pluck-muted'), notes: generateMelodicPattern('arpUp', 4, 9, 'minor') },
    ],
  }
}

/**
 * 7. Tape Sunset (磁带黄昏 · 78 BPM · D Dorian). Uses the lo-fi kit.
 */
function buildTapeProject(id = createProjectId()): Project {
  return {
    version: 1,
    id,
    name: '磁带黄昏 · Tape Sunset',
    bpm: 78,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 2,
    scaleId: 'dorian',
    tracks: [
      { id: 'drums', name: '鼓', instrumentId: 'drums', mute: false, gain: 0.8, kit: 'lofi',
        notes: generateDrumPattern('lofi', 4) },
      { id: 'bass', name: '贝斯', instrumentId: 'bass', mute: false, gain: 0.82,
        synth: presetPatch('bass-sub'), notes: generateMelodicPattern('octaveBass', 4, 2, 'dorian') },
      { id: 'keys', name: '和弦', instrumentId: 'keys', mute: false, gain: 0.66,
        synth: presetPatch('keys-warm'), notes: generateMelodicPattern('chords', 4, 2, 'dorian') },
      { id: 'bell', name: '琶音', instrumentId: 'bell', mute: false, gain: 0.5,
        synth: presetPatch('bell-box'), notes: generateMelodicPattern('arpUp', 4, 2, 'dorian') },
    ],
  }
}

export const SONG_PRESETS: readonly SongPresetItem[] = [
  {
    id: 'synthwave',
    title: '霓虹夜驾',
    subtitle: 'Synthwave · 118 BPM',
    bpm: 118,
    accent: '#3b82f6',
    build: buildSynthwaveProject,
  },
  {
    id: 'lofi',
    title: '雨夜自习室',
    subtitle: 'Lo-Fi Chill · 88 BPM',
    bpm: 88,
    accent: '#f97316',
    build: buildLofiProject,
  },
  {
    id: 'acid',
    title: '酸液仓库',
    subtitle: 'Acid 303 · 132 BPM',
    bpm: 132,
    accent: '#eab308',
    build: buildAcidProject,
  },
  {
    id: 'chiptune',
    title: '红白机冒险',
    subtitle: '8-Bit · 140 BPM',
    bpm: 140,
    accent: '#ec4899',
    build: buildChiptuneProject,
  },
  {
    id: 'ambient',
    title: '深空漂流',
    subtitle: 'Ambient · 96 BPM',
    bpm: 96,
    accent: '#14b8a6',
    build: buildAmbientProject,
  },
  {
    id: 'disco',
    title: '午夜舞池',
    subtitle: 'Disco House · 122 BPM',
    bpm: 122,
    accent: '#8b5cf6',
    build: buildDiscoProject,
  },
  {
    id: 'tape',
    title: '磁带黄昏',
    subtitle: 'Tape Sunset · 78 BPM',
    bpm: 78,
    accent: '#f59e0b',
    build: buildTapeProject,
  },
]

export function createStarterProject(id = createProjectId()): Project {
  return buildSynthwaveProject(id)
}

export function generateRandomGrooveProject(id = createProjectId()): Project {
  const roots = [0, 2, 4, 5, 7, 9]
  const root = roots[Math.floor(Math.random() * roots.length)] ?? 9
  const scaleChoices = ['minor', 'dorian', 'pentatonic', 'major'] as const
  const scaleId = scaleChoices[Math.floor(Math.random() * scaleChoices.length)] ?? 'minor'
  const drumPatterns: DrumPatternId[] = ['synthwave', 'fourOnFloor', 'lofi', 'breakbeat', 'disco']
  const drumPattern = drumPatterns[Math.floor(Math.random() * drumPatterns.length)] ?? 'synthwave'
  const bpmPool = [92, 105, 116, 124, 128, 135]
  const bpm = bpmPool[Math.floor(Math.random() * bpmPool.length)] ?? 120
  const bassChoices = ['acid', 'bass'] as const
  const bassInst = bassChoices[Math.floor(Math.random() * bassChoices.length)] ?? 'bass'
  const leadChoices = ['lead', 'pluck', 'bell', 'chip'] as const
  const leadInst = leadChoices[Math.floor(Math.random() * leadChoices.length)] ?? 'lead'
  const rootName = ROOT_NOTES.find((r) => r.semitone === root)?.name ?? 'A'

  return {
    version: 1,
    id,
    name: `随机灵感 · ${rootName} ${scaleId.toUpperCase()}`,
    bpm,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.84,
        notes: generateDrumPattern(drumPattern, 4),
      },
      {
        id: 'bass',
        name: bassInst === 'acid' ? '酸液' : '贝斯',
        instrumentId: bassInst,
        mute: false,
        gain: 0.82,
        synth: DEFAULT_SYNTH_PATCHES[bassInst],
        notes: generateMelodicPattern(bassInst === 'acid' ? 'acidLine' : 'octaveBass', 4, root, scaleId),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'pad',
        mute: false,
        gain: 0.68,
        synth: DEFAULT_SYNTH_PATCHES.pad,
        notes: generateMelodicPattern('chords', 4, root, scaleId),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: leadInst,
        mute: false,
        gain: 0.74,
        synth: DEFAULT_SYNTH_PATCHES[leadInst],
        notes: generateMelodicPattern('randomRiff', 4, root, scaleId),
      },
    ],
  }
}
