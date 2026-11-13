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
    patch: { ...patch('sawtooth', 14, 0, 3800, 0.8, 0.1, 0.35, 0.5, 0.85, 0.9, 0.2, 0), reverbMix: 0.3 } },
  { id: 'pad-dark', instrumentId: 'pad', label: '暗色铺底', description: '低沉、缓慢的三角波铺底',
    patch: { ...patch('triangle', 10, 0.4, 900, 1, 0.2, 0.6, 0.8, 0.8, 1.4, 0.3, 0), reverbMix: 0.4 } },
  { id: 'pad-glass', instrumentId: 'pad', label: '玻璃铺底', description: '带共鸣的方波，尾音长而通透',
    patch: { ...patch('square', 8, 0, 5200, 2.5, 0.3, 0.25, 0.6, 0.6, 1.2, 0.45, 0), reverbMix: 0.35 } },
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
    patch: { ...patch('triangle', 3, 0, 4200, 1, 0.3, 0.003, 0.5, 0, 0.6, 0.35, 0), reverbMix: 0.3 } },
  // Chip
  { id: 'chip-triangle', instrumentId: 'chip', label: '三角波', description: '红白机的三角波声道，常用作贝斯',
    patch: patch('triangle', 0, 0, 12000, 0.7, 0, 0.002, 0.05, 1, 0.03, 0, 0) },
  { id: 'chip-pulse', instrumentId: 'chip', label: '失谐脉冲', description: '两路失谐方波，带回声的 8-bit 主音',
    patch: patch('square', 9, 0, 9000, 0.7, 0, 0.002, 0.08, 0.5, 0.06, 0.25, 0) },
  // Bell
  { id: 'bell-box', instrumentId: 'bell', label: '音乐盒', description: '纯正弦短音，像八音盒',
    patch: { ...patch('sine', 0, 0, 8000, 1, 0.2, 0.002, 0.6, 0, 0.8, 0.3, 0), reverbMix: 0.35 } },
  { id: 'bell-glass', instrumentId: 'bell', label: '玻璃铃', description: '大失谐三角波，金属感长尾',
    patch: { ...patch('triangle', 18, 0, 7000, 5, 0.4, 0.002, 0.9, 0, 1.2, 0.5, 0), reverbMix: 0.4 } },
  // Sounds that need the LFO
  { id: 'lead-vibrato', instrumentId: 'lead', label: '颤音主音', description: '带颤音的锯齿主音，长音更有歌唱感',
    patch: { ...patch('sawtooth', 8, 0.1, 4600, 2, 0.4, 0.01, 0.2, 0.7, 0.2, 0.25, 0.15),
      lfoTarget: 'pitch', lfoRate: 5.5, lfoDepth: 0.18 } },
  { id: 'bass-wobble', instrumentId: 'bass', label: 'Wobble', description: '滤波器被 LFO 来回扫动的摇摆贝斯',
    patch: { ...patch('sawtooth', 8, 0.4, 500, 6, 0.2, 0.005, 0.2, 0.9, 0.15, 0, 0.35),
      lfoTarget: 'filter', lfoRate: 4, lfoDepth: 0.85 } },
  { id: 'pad-breath', instrumentId: 'pad', label: '呼吸铺底', description: '音量缓慢起伏、带混响的铺底',
    patch: { ...patch('triangle', 12, 0.2, 2400, 1, 0.1, 0.5, 0.6, 0.85, 1.3, 0.2, 0),
      reverbMix: 0.35, lfoTarget: 'amp', lfoRate: 0.35, lfoDepth: 0.6 } },
  { id: 'keys-tremolo', instrumentId: 'keys', label: '震音电钢', description: '音量快速颤动的电钢，老式音箱的味道',
    patch: { ...patch('triangle', 4, 0.15, 2200, 1, 0.3, 0.004, 0.6, 0.4, 0.4, 0.1, 0),
      reverbMix: 0.15, lfoTarget: 'amp', lfoRate: 5.2, lfoDepth: 0.55 } },
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
  const target = preset.patch
  if (current.waveform !== target.waveform) return false
  if (!PATCH_KEYS.every((key) => Math.abs(current[key] - target[key]) < 1e-6)) return false
  if (Math.abs((current.reverbMix ?? 0) - (target.reverbMix ?? 0)) > 1e-6) return false
  const lfoOn = (patch: SynthPatch): boolean => patch.lfoTarget !== undefined && (patch.lfoDepth ?? 0) > 0
  if (lfoOn(current) !== lfoOn(target)) return false
  if (!lfoOn(current)) return true
  return current.lfoTarget === target.lfoTarget
    && Math.abs((current.lfoRate ?? 0) - (target.lfoRate ?? 0)) < 1e-6
    && Math.abs((current.lfoDepth ?? 0) - (target.lfoDepth ?? 0)) < 1e-6
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

export type ChordBrushMode = 'single' | 'triad' | 'seventh'

/** Build a diatonic triad or seventh chord rooted at `rootPitch` in the active scale. */
export function buildScaleChord(
  rootPitch: number,
  rootSemitone: number,
  scaleId: string,
  mode: ChordBrushMode,
): number[] {
  if (mode === 'single') return [rootPitch]
  const count = mode === 'triad' ? 3 : 4
  if (scaleId === 'chromatic') {
    const offsets = mode === 'triad' ? [0, 4, 7] : [0, 4, 7, 11]
    return offsets.map((o) => rootPitch + o).filter((p) => p >= PITCH_MIN && p <= PITCH_MAX)
  }
  const pool = scalePitches(rootSemitone, scaleId, rootPitch, PITCH_MAX)
  const notes = [rootPitch]
  // If rootPitch is in pool, pool[0] === rootPitch, so step by 2 scale degrees.
  // If rootPitch is out of scale, step from index 0 of pool above rootPitch.
  const startIdx = pool[0] === rootPitch ? 0 : -1
  for (let i = 1; i < count; i += 1) {
    const target = pool[startIdx + i * 2]
    if (target !== undefined && target <= PITCH_MAX && !notes.includes(target)) {
      notes.push(target)
    }
  }
  return notes
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
  progDegrees: readonly number[] = [0, 5, 2, 6],
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
 * Driving 8th-note synth bass, lush voice-led retro pads, dotted pluck arp, and singing vibrato lead.
 */
function buildSynthwaveProject(id = createProjectId()): Project {
  const bassNotes: Note[] = []
  const bassRoots = [45, 41, 36, 43] // A2, F2, C2, G2
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    const root = bassRoots[bar]!
    const oct = root + 12
    for (let step = 0; step < 8; step += 1) {
      const isOct = step === 3 || step === 7
      bassNotes.push(n(isOct ? oct : root, b + step * 0.5, 0.25, step % 2 === 0 ? 112 : 88))
    }
  }

  const padNotes: Note[] = [
    // Am (A3, C4, E4)
    n(57, 0, 3.75, 82), n(60, 0, 3.75, 80), n(64, 0, 3.75, 84),
    // Fmaj7 (F3, A3, C4, E4)
    n(53, 4, 3.75, 80), n(57, 4, 3.75, 78), n(60, 4, 3.75, 82), n(64, 4, 3.75, 80),
    // C/G (G3, C4, E4)
    n(55, 8, 3.75, 82), n(60, 8, 3.75, 84), n(64, 8, 3.75, 80),
    // G6 -> G (G3, B3, D4, E4 -> D4)
    n(55, 12, 3.75, 82), n(59, 12, 3.75, 80), n(62, 12, 3.75, 84), n(64, 12, 1.75, 76),
  ]

  // Dotted-16th / syncopated retro pluck arpeggio matching each bar's harmony
  const arpChords = [
    [69, 72, 76], // Am
    [65, 69, 72], // F
    [67, 72, 76], // C
    [67, 71, 74], // G
  ]
  const arpPattern = [
    { t: 0, i: 0, v: 98 },
    { t: 0.75, i: 1, v: 84 },
    { t: 1.5, i: 2, v: 94 },
    { t: 2, i: 1, v: 82 },
    { t: 2.75, i: 2, v: 92 },
    { t: 3.5, i: 0, v: 86 },
  ]
  const arpNotes: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const chord = arpChords[bar]!
    const b = bar * 4
    for (const step of arpPattern) {
      arpNotes.push(n(chord[step.i]!, b + step.t, 0.25, step.v))
    }
  }

  // Soaring 80s anthem melody
  const leadNotes: Note[] = [
    n(76, 0, 1.5, 108), n(74, 1.5, 0.5, 96), n(72, 2, 1.5, 104), n(71, 3.5, 0.5, 92),
    n(72, 4, 2, 106), n(69, 6, 1.5, 98), n(72, 7.5, 0.5, 94),
    n(76, 8, 1, 110), n(79, 9, 1.5, 114), n(76, 10.5, 1, 102), n(72, 11.5, 0.5, 94),
    n(74, 12, 2.5, 108), n(71, 14.5, 1, 98), n(72, 15.5, 0.5, 96),
  ]

  const drums = generateDrumPattern('synthwave', 4)
  drums.push(n(DRUM_CYMBAL, 0, 0.5, 94))
  // Turnaround tom fill at end of bar 4
  drums.push(n(DRUM_TOM_LOW, 15.25, 0.25, 92), n(DRUM_SNARE, 15.5, 0.25, 98), n(DRUM_TOM_LOW, 15.75, 0.25, 104))

  return {
    version: 1,
    id,
    name: '霓虹夜驾 · Synthwave 84',
    bpm: 118,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 9,
    scaleId: 'minor',
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.85,
        kit: 'classic',
        notes: sortNotes(drums),
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
        notes: sortNotes(bassNotes),
      },
      {
        id: 'pad',
        name: '铺底',
        instrumentId: 'pad',
        mute: false,
        gain: 0.6,
        synth: {
          ...presetPatch('pad-strings'),
          reverbMix: 0.42,
        },
        notes: sortNotes(padNotes),
      },
      {
        id: 'pluck',
        name: '琶音',
        instrumentId: 'pluck',
        mute: false,
        gain: 0.58,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.pluck!,
          reverbMix: 0.3,
        },
        notes: sortNotes(arpNotes),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: 'lead',
        mute: false,
        gain: 0.72,
        synth: {
          ...presetPatch('lead-vibrato'),
          reverbMix: 0.35,
        },
        notes: sortNotes(leadNotes),
      },
    ],
  }
}

/**
 * 2. Lo-Fi Chillhop (雨夜自习室 · 86 BPM · D Dorian · Swing)
 * Dusty swung Rhodes jazz-hop (Dm9 -> G13 -> Cmaj9 -> A7alt) with warm triangle bass and bell counter-melody.
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
    bpm: 86,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 2,
    scaleId: 'dorian',
    swing: 0.3,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.8,
        kit: 'lofi',
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
        gain: 0.72,
        synth: {
          ...presetPatch('keys-warm'),
          reverbMix: 0.26,
        },
        notes: sortNotes(chords),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: 'bell',
        mute: false,
        gain: 0.66,
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
          reverbMix: 0.35,
        },
        notes: sortNotes(melody),
      },
    ],
  }
}

/**
 * 3. Acid 303 Warehouse (酸液仓库 · 132 BPM · E Minor)
 * Squelchy TB-303 bassline with resonant accent jumps, dub-techno minor chord stabs, and hypnotic filter-swept lead.
 */
function buildAcidProject(id = createProjectId()): Project {
  const acidNotes: Note[] = []
  const barA = [
    { t: 0, p: 40, d: 0.25, v: 112 },
    { t: 0.25, p: 40, d: 0.25, v: 78 },
    { t: 0.5, p: 52, d: 0.25, v: 124 }, // high accent squelch
    { t: 1, p: 40, d: 0.25, v: 92 },
    { t: 1.5, p: 43, d: 0.25, v: 114 },
    { t: 1.75, p: 47, d: 0.5, v: 120 },
    { t: 2.5, p: 40, d: 0.25, v: 85 },
    { t: 2.75, p: 50, d: 0.25, v: 125 },
    { t: 3, p: 47, d: 0.25, v: 95 },
    { t: 3.5, p: 43, d: 0.25, v: 108 },
    { t: 3.75, p: 42, d: 0.25, v: 118 },
  ]
  const barB = [
    { t: 0, p: 40, d: 0.25, v: 115 },
    { t: 0.5, p: 52, d: 0.5, v: 126 },
    { t: 1.25, p: 47, d: 0.25, v: 96 },
    { t: 1.5, p: 48, d: 0.25, v: 118 },
    { t: 2, p: 40, d: 0.25, v: 88 },
    { t: 2.5, p: 55, d: 0.25, v: 125 },
    { t: 2.75, p: 52, d: 0.25, v: 110 },
    { t: 3.25, p: 47, d: 0.25, v: 102 },
    { t: 3.5, p: 50, d: 0.25, v: 122 },
    { t: 3.75, p: 52, d: 0.25, v: 127 },
  ]
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    const pattern = bar % 2 === 0 ? barA : barB
    for (const item of pattern) {
      acidNotes.push(n(item.p, b + item.t, item.d, item.v))
    }
  }

  const stabs: Note[] = []
  const stabBeats = [
    [0.75, 2.25],
    [1.5, 3.25],
    [0.75, 2.25],
    [1.5, 3.75],
  ]
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    for (const beat of stabBeats[bar]!) {
      stabs.push(
        n(64, b + beat, 0.25, 96),
        n(67, b + beat, 0.25, 92),
        n(71, b + beat, 0.25, 94),
        n(74, b + beat, 0.25, 88),
      )
    }
  }

  const raveLead: Note[] = [
    n(71, 0, 0.5, 96), n(76, 1.5, 0.25, 104), n(74, 2.5, 0.5, 94),
    n(71, 4, 0.5, 98), n(79, 5.5, 0.5, 110), n(76, 7, 0.5, 96),
    n(71, 8, 0.5, 96), n(76, 9.5, 0.25, 104), n(74, 10.5, 0.5, 98),
    n(79, 12, 0.75, 112), n(78, 13.5, 0.5, 104), n(76, 14.5, 1, 108),
  ]

  return {
    version: 1,
    id,
    name: '酸液仓库 · Acid 303',
    bpm: 132,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 4,
    scaleId: 'minor',
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.88,
        kit: '808',
        notes: generateDrumPattern('fourOnFloor', 4),
      },
      {
        id: 'bass',
        name: '酸液',
        instrumentId: 'acid',
        mute: false,
        gain: 0.85,
        synth: DEFAULT_SYNTH_PATCHES.acid!,
        notes: sortNotes(acidNotes),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'pluck',
        mute: false,
        gain: 0.64,
        synth: {
          ...presetPatch('pluck-muted'),
          reverbMix: 0.45,
          delayMix: 0.4,
        },
        notes: sortNotes(stabs),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: 'lead',
        mute: false,
        gain: 0.62,
        synth: {
          ...presetPatch('lead-bright'),
          cutoff: 2400,
          lfoTarget: 'filter',
          lfoRate: 0.5,
          lfoDepth: 0.35,
          delayMix: 0.38,
          reverbMix: 0.3,
        },
        notes: sortNotes(raveLead),
      },
    ],
  }
}

/**
 * 4. 8-Bit Chiptune Quest (红白机冒险 · 142 BPM · C Minor)
 * Classic NES action-stage progression (Cm -> Bb -> Ab -> G7), bouncy triangle bass, rapid triad arps, and heroic pulse lead.
 */
function buildChiptuneProject(id = createProjectId()): Project {
  // Cm -> Bb -> Ab -> G7 bassline
  const bassNotes: Note[] = []
  const bassBars = [
    [48, 48, 60, 48, 55, 60, 48, 55], // Cm (C3-C4-G3)
    [46, 46, 58, 46, 53, 58, 46, 53], // Bb
    [44, 44, 56, 44, 51, 56, 44, 51], // Ab
    [43, 43, 55, 43, 50, 55, 47, 50], // G (G2-G3-D3-B2)
  ]
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    const seq = bassBars[bar]!
    for (let i = 0; i < 8; i += 1) {
      bassNotes.push(n(seq[i]!, b + i * 0.5, 0.25, i % 2 === 0 ? 112 : 92))
    }
  }

  // Rapid 16th-note NES chord arps matching Cm -> Bb -> Ab -> G7
  const arpChords = [
    [60, 63, 67, 72], // Cm
    [58, 62, 65, 70], // Bb
    [56, 60, 63, 68], // Ab
    [55, 59, 62, 67], // G
  ]
  const arpNotes: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    const chord = arpChords[bar]!
    for (let step = 0; step < 16; step += 1) {
      const pitch = chord[step % 4]!
      arpNotes.push(n(pitch, b + step * 0.25, 0.25, step % 4 === 0 ? 96 : 74))
    }
  }

  const leadNotes: Note[] = [
    // Bar 1 (Cm)
    n(72, 0, 0.5, 112), n(75, 0.5, 0.5, 108), n(79, 1, 0.75, 118), n(77, 1.75, 0.25, 102),
    n(75, 2, 0.5, 110), n(74, 2.5, 0.5, 104), n(72, 3, 1, 114),
    // Bar 2 (Bb)
    n(70, 4, 0.5, 110), n(74, 4.5, 0.5, 106), n(77, 5, 0.75, 116), n(75, 5.75, 0.25, 102),
    n(74, 6, 0.5, 108), n(70, 6.5, 0.5, 102), n(67, 7, 1, 110),
    // Bar 3 (Ab)
    n(68, 8, 0.5, 110), n(72, 8.5, 0.5, 108), n(75, 9, 0.75, 116), n(80, 9.75, 0.25, 120),
    n(79, 10, 0.5, 112), n(75, 10.5, 0.5, 106), n(74, 11, 1, 110),
    // Bar 4 (G7 turnaround)
    n(74, 12, 0.5, 114), n(77, 12.5, 0.5, 110), n(79, 13, 0.5, 116), n(83, 13.5, 0.5, 120),
    n(84, 14, 1.5, 122), n(79, 15.5, 0.5, 106),
  ]

  return {
    version: 1,
    id,
    name: '红白机冒险 · 8-Bit Quest',
    bpm: 142,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 0,
    scaleId: 'minor',
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.78,
        kit: 'chip',
        notes: generateDrumPattern('breakbeat', 4),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'chip',
        mute: false,
        gain: 0.8,
        synth: presetPatch('chip-triangle'),
        notes: sortNotes(bassNotes),
      },
      {
        id: 'keys',
        name: '琶音',
        instrumentId: 'chip',
        mute: false,
        gain: 0.56,
        synth: DEFAULT_SYNTH_PATCHES.chip!,
        notes: sortNotes(arpNotes),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: 'chip',
        mute: false,
        gain: 0.78,
        synth: {
          ...presetPatch('chip-pulse'),
          delayMix: 0.2,
        },
        notes: sortNotes(leadNotes),
      },
    ],
  }
}

/**
 * 5. Cosmic Drift Ambient (深空漂流 · 78 BPM · F Major / Lydian)
 * Descending cinematic bass (F -> E -> D -> C), breathing reverb pad, and sparse asymmetrical harp & glass bell motifs.
 */
function buildAmbientProject(id = createProjectId()): Project {
  const sparseDrums: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    sparseDrums.push(n(DRUM_KICK, b + 0, 0.25, 84), n(DRUM_KICK, b + 2.5, 0.25, 64))
    sparseDrums.push(n(DRUM_RIM, b + 2, 0.25, 70), n(DRUM_HAT, b + 1.5, 0.25, 48), n(DRUM_HAT, b + 3.5, 0.25, 44))
  }

  // Descending cinematic bassline: F2 -> E2 -> D2 -> C2
  const bassNotes: Note[] = [
    n(41, 0, 4, 96),
    n(40, 4, 4, 92),
    n(38, 8, 4, 96),
    n(36, 12, 4, 94),
  ]

  // Open-voiced lush pads: Fmaj7 -> C/E -> Dm9 -> Bbmaj7/C
  const padChords: Note[] = [
    n(53, 0, 3.75, 78), n(60, 0, 3.75, 76), n(64, 0, 3.75, 80), n(69, 0, 3.75, 74),
    n(52, 4, 3.75, 76), n(60, 4, 3.75, 78), n(67, 4, 3.75, 80), n(71, 4, 3.75, 72),
    n(50, 8, 3.75, 78), n(57, 8, 3.75, 76), n(64, 8, 3.75, 80), n(65, 8, 3.75, 74),
    n(48, 12, 3.75, 76), n(58, 12, 3.75, 78), n(62, 12, 3.75, 80), n(65, 12, 3.75, 74),
  ]

  // Sparse, meditative harp phrases with breathing room
  const harpNotes: Note[] = [
    n(65, 0.5, 1, 78), n(69, 1.5, 1, 84), n(72, 2.5, 1.5, 88),
    n(71, 4.5, 1, 80), n(67, 5.5, 1, 76), n(72, 6.75, 1.25, 84),
    n(69, 8.5, 1, 82), n(72, 9.5, 1, 86), n(76, 10.5, 1.5, 90),
    n(74, 12.5, 1, 82), n(72, 13.75, 1, 78), n(69, 15, 1, 74),
  ]

  // Distant glass bell sparkles
  const bellNotes: Note[] = [
    n(81, 1.5, 2, 76),
    n(79, 5.5, 2, 72),
    n(84, 9.5, 2.5, 80),
    n(77, 13.5, 2.5, 74),
  ]

  return {
    version: 1,
    id,
    name: '深空漂流 · Cosmic Drift',
    bpm: 78,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 5,
    scaleId: 'major',
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.58,
        kit: 'lofi',
        notes: sortNotes(sparseDrums),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'bass',
        mute: false,
        gain: 0.78,
        synth: presetPatch('bass-sub'),
        notes: sortNotes(bassNotes),
      },
      {
        id: 'pad',
        name: '铺底',
        instrumentId: 'pad',
        mute: false,
        gain: 0.76,
        synth: {
          ...presetPatch('pad-breath'),
          reverbMix: 0.65,
        },
        notes: sortNotes(padChords),
      },
      {
        id: 'pluck',
        name: '拨弦',
        instrumentId: 'pluck',
        mute: false,
        gain: 0.62,
        synth: {
          ...presetPatch('pluck-harp'),
          reverbMix: 0.55,
          delayMix: 0.42,
        },
        notes: sortNotes(harpNotes),
      },
      {
        id: 'lead',
        name: '铃音',
        instrumentId: 'bell',
        mute: false,
        gain: 0.64,
        synth: {
          ...presetPatch('bell-glass'),
          reverbMix: 0.6,
        },
        notes: sortNotes(bellNotes),
      },
    ],
  }
}

/**
 * 6. Disco House (午夜舞池 · 122 BPM · E Dorian · Groove Swing)
 * French-house funky progression (Em7 -> A13 -> Dmaj7 -> Bm7), syncopated slap bass, choppy clav stabs, and soaring strings.
 */
function buildDiscoProject(id = createProjectId()): Project {
  // Syncopated funky disco bassline in E Dorian (E2=40, A2=45, D2=38, B1? clamped -> B2=47/F#2=42)
  const bassNotes: Note[] = [
    // Bar 1: Em7
    n(40, 0, 0.5, 114), n(40, 0.75, 0.25, 86), n(52, 1.5, 0.5, 108), n(47, 2, 0.5, 98),
    n(40, 2.75, 0.5, 110), n(50, 3.5, 0.25, 96), n(52, 3.75, 0.25, 104),
    // Bar 2: A13
    n(45, 4, 0.5, 114), n(45, 4.75, 0.25, 86), n(57, 5.5, 0.5, 108), n(52, 6, 0.5, 98),
    n(45, 6.75, 0.5, 110), n(43, 7.5, 0.25, 94), n(45, 7.75, 0.25, 102),
    // Bar 3: Dmaj7
    n(38, 8, 0.5, 114), n(38, 8.75, 0.25, 86), n(50, 9.5, 0.5, 108), n(45, 10, 0.5, 98),
    n(38, 10.75, 0.5, 110), n(45, 11.5, 0.25, 94), n(48, 11.75, 0.25, 102),
    // Bar 4: Bm7 -> B7 turnaround
    n(47, 12, 0.5, 112), n(47, 12.75, 0.25, 86), n(54, 13.5, 0.5, 106), n(50, 14, 0.5, 98),
    n(47, 14.75, 0.5, 108), n(42, 15.5, 0.25, 96), n(43, 15.75, 0.25, 104),
  ]

  // Choppy funky house chord stabs
  const chordStabPitches = [
    [55, 59, 62, 66], // Em9
    [55, 57, 61, 66], // A13
    [54, 57, 61, 64], // Dmaj9
    [54, 57, 59, 64], // Bm11
  ]
  const stabRhythm = [
    { t: 0, d: 0.5, v: 98 },
    { t: 0.75, d: 0.25, v: 82 },
    { t: 1.5, d: 0.5, v: 94 },
    { t: 2.75, d: 0.25, v: 88 },
    { t: 3.5, d: 0.25, v: 92 },
  ]
  const keysNotes: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    const chord = chordStabPitches[bar]!
    for (const hit of stabRhythm) {
      for (const pitch of chord) {
        keysNotes.push(n(pitch, b + hit.t, hit.d, hit.v))
      }
    }
  }

  // Soaring high-octave disco strings melody
  const stringNotes: Note[] = [
    n(76, 0, 2, 82), n(78, 2, 2, 84),
    n(79, 4, 2.5, 88), n(76, 6.5, 1.5, 82),
    n(74, 8, 2.5, 86), n(73, 10.5, 1.5, 80),
    n(71, 12, 2, 84), n(74, 14, 1, 86), n(78, 15, 1, 90),
  ]

  return {
    version: 1,
    id,
    name: '午夜舞池 · Disco House',
    bpm: 122,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 4,
    scaleId: 'dorian',
    swing: 0.18,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.86,
        kit: '808',
        notes: generateDrumPattern('disco', 4),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'bass',
        mute: false,
        gain: 0.86,
        synth: presetPatch('bass-pluck'),
        notes: sortNotes(bassNotes),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'keys',
        mute: false,
        gain: 0.66,
        synth: {
          ...presetPatch('keys-clav'),
          reverbMix: 0.22,
        },
        notes: sortNotes(keysNotes),
      },
      {
        id: 'pad',
        name: '铺底',
        instrumentId: 'pad',
        mute: false,
        gain: 0.56,
        synth: {
          ...presetPatch('pad-strings'),
          reverbMix: 0.38,
        },
        notes: sortNotes(stringNotes),
      },
    ],
  }
}

/**
 * 7. Tape Sunset (磁带黄昏 · 76 BPM · Eb Major · Tape Swing)
 * Warm nostalgic ballad (Ebmaj7 -> Cm9 -> Abmaj7 -> Bb13sus4) with rolled tremolo keys and wistful music-box melody.
 */
function buildTapeProject(id = createProjectId()): Project {
  // Sparse dusty downtempo beat
  const drums: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    drums.push(n(DRUM_KICK, b + 0, 0.25, 102), n(DRUM_KICK, b + 1.5, 0.25, 80), n(DRUM_KICK, b + 2.75, 0.25, 92))
    drums.push(n(DRUM_SNARE, b + 1, 0.25, 92), n(DRUM_RIM, b + 3, 0.25, 86))
    for (const h of [0.5, 1.5, 2, 2.5, 3.5]) {
      drums.push(n(DRUM_HAT, b + h, 0.25, 58))
    }
  }

  // Slow warm sub bass with 5th pickups
  const bassNotes: Note[] = [
    n(39, 0, 2.75, 102), n(46, 3, 1, 86), // Eb2 -> Bb2
    n(36, 4, 2.75, 104), n(43, 7, 1, 86), // C2 -> G2
    n(44, 8, 2.75, 100), n(43, 11, 1, 84), // Ab2 -> G2
    n(46, 12, 2.5, 102), n(41, 14.5, 1.5, 88), // Bb2 -> F2
  ]

  // Rolled Rhodes chords (each note enters 0.25 beat apart like a gentle hand-strummed chord)
  const keysNotes: Note[] = [
    // Bar 1: Ebmaj7 (Eb3, G3, Bb3, D4)
    n(51, 0, 3.75, 78), n(55, 0.25, 3.5, 76), n(58, 0.5, 3.25, 80), n(62, 0.75, 3, 82),
    // Bar 2: Cm9 (C3, G3, Bb3, D4, Eb4)
    n(48, 4, 3.75, 80), n(55, 4.25, 3.5, 76), n(58, 4.5, 3.25, 78), n(62, 4.75, 3, 82), n(63, 5, 2.75, 74),
    // Bar 3: Abmaj7 (Ab3, C4, Eb4, G4)
    n(56, 8, 3.75, 78), n(60, 8.25, 3.5, 76), n(63, 8.5, 3.25, 80), n(67, 8.75, 3, 82),
    // Bar 4: Bb13sus4 -> Bb7 (Bb3, Eb4, G4, Ab4)
    n(58, 12, 3.75, 78), n(63, 12.25, 3.5, 76), n(67, 12.5, 3.25, 80), n(68, 12.75, 1.25, 76), n(62, 14, 1.75, 78),
  ]

  // Wistful music-box melody in Eb Major
  const bellNotes: Note[] = [
    n(74, 0.5, 1, 86), n(75, 1.5, 0.75, 92), n(79, 2.5, 1.25, 94),
    n(77, 4.5, 1, 88), n(75, 5.5, 0.75, 82), n(74, 6.5, 1.25, 84),
    n(72, 8.5, 1, 86), n(75, 9.5, 0.75, 90), n(79, 10.5, 1.25, 94),
    n(77, 12.5, 1.5, 92), n(74, 14.5, 1.5, 84),
  ]

  return {
    version: 1,
    id,
    name: '磁带黄昏 · Tape Sunset',
    bpm: 76,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 3,
    scaleId: 'major',
    swing: 0.32,
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.78,
        kit: 'lofi',
        notes: sortNotes(drums),
      },
      {
        id: 'bass',
        name: '贝斯',
        instrumentId: 'bass',
        mute: false,
        gain: 0.82,
        synth: presetPatch('bass-sub'),
        notes: sortNotes(bassNotes),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'keys',
        mute: false,
        gain: 0.68,
        synth: {
          ...presetPatch('keys-tremolo'),
          reverbMix: 0.35,
        },
        notes: sortNotes(keysNotes),
      },
      {
        id: 'bell',
        name: '主旋律',
        instrumentId: 'bell',
        mute: false,
        gain: 0.62,
        synth: {
          ...presetPatch('bell-box'),
          lfoTarget: 'pitch',
          lfoRate: 1.2,
          lfoDepth: 0.1,
          reverbMix: 0.45,
        },
        notes: sortNotes(bellNotes),
      },
    ],
  }
}

/**
 * 8. Future 808 (暗涌 808 · 136 BPM half-time · F Minor)
 * Half-time trap snare on beat 2, rapid 16th hi-hat stutter rolls, booming 808 sub, LFO-pumped Future Bass chords, and dark bell motif.
 */
function buildTrapProject(id = createProjectId()): Project {
  const drums: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    // Half-time kick & snare/clap on beat 2
    drums.push(n(DRUM_KICK, b + 0, 0.25, 118), n(DRUM_KICK, b + 0.75, 0.25, 100), n(DRUM_KICK, b + 2.5, 0.25, 112))
    if (bar % 2 === 1) {
      drums.push(n(DRUM_KICK, b + 3.5, 0.25, 102))
    }
    drums.push(n(DRUM_SNARE, b + 2, 0.25, 112), n(DRUM_CLAP, b + 2, 0.25, 104))

    // Steady 8th hats + rapid 16th stutter rolls on beat 1.5 and 3.5
    for (let i = 0; i < 8; i += 1) {
      drums.push(n(DRUM_HAT, b + i * 0.5, 0.25, i % 2 === 0 ? 78 : 60))
    }
    drums.push(n(DRUM_HAT, b + 1.75, 0.25, 68), n(DRUM_HAT, b + 3.25, 0.25, 72), n(DRUM_HAT, b + 3.75, 0.25, 86))
    if (bar === 3) {
      drums.push(n(DRUM_OPEN_HAT, b + 3.5, 0.5, 82))
    }
  }

  // Booming 808 sub matching kick hits: Fm -> Db -> Ab -> Eb
  const bassRoots = [41, 37, 44, 39]
  const bassNotes: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    const root = bassRoots[bar]!
    bassNotes.push(n(root, b + 0, 0.75, 118), n(root, b + 0.75, 1.25, 108), n(root + 12, b + 2.5, 1, 112))
  }

  // LFO-pumped Future Bass chord swells
  const futureChords = [
    [53, 60, 65, 68, 72], // Fm9
    [49, 56, 60, 65, 68], // Dbmaj7
    [56, 60, 63, 67, 72], // Abmaj7
    [55, 58, 63, 67, 70], // Eb6
  ]
  const padNotes: Note[] = []
  for (let bar = 0; bar < 4; bar += 1) {
    const b = bar * 4
    for (const pitch of futureChords[bar]!) {
      padNotes.push(n(pitch, b, 3.75, 82))
    }
  }

  // Haunting trap bell counter-melody
  const bellNotes: Note[] = [
    n(77, 0, 0.5, 96), n(80, 1, 0.5, 92), n(79, 2, 0.5, 88), n(77, 3, 0.5, 84),
    n(73, 4, 0.5, 94), n(77, 5, 0.5, 90), n(75, 6, 1, 86),
    n(80, 8, 0.5, 98), n(84, 9, 0.5, 102), n(79, 10, 1, 90),
    n(75, 12, 0.5, 94), n(79, 13, 0.5, 90), n(77, 14, 1.5, 96),
  ]

  return {
    version: 1,
    id,
    name: '暗涌 808 · Future Trap',
    bpm: 136,
    beatsPerBar: BEATS_PER_BAR,
    bars: 4,
    loop: true,
    scaleRoot: 5,
    scaleId: 'minor',
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.9,
        kit: '808',
        notes: sortNotes(drums),
      },
      {
        id: 'bass',
        name: '808 Sub',
        instrumentId: 'bass',
        mute: false,
        gain: 0.88,
        synth: {
          ...presetPatch('bass-sub'),
          drive: 0.25,
          decay: 0.55,
          release: 0.25,
        },
        notes: sortNotes(bassNotes),
      },
      {
        id: 'pad',
        name: '和弦',
        instrumentId: 'pad',
        mute: false,
        gain: 0.62,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.pad!,
          cutoff: 2600,
          attack: 0.05,
          lfoTarget: 'amp',
          lfoRate: 4.5,
          lfoDepth: 0.45,
          reverbMix: 0.42,
        },
        notes: sortNotes(padNotes),
      },
      {
        id: 'bell',
        name: '铃音',
        instrumentId: 'bell',
        mute: false,
        gain: 0.64,
        synth: {
          ...DEFAULT_SYNTH_PATCHES.bell!,
          reverbMix: 0.5,
          delayMix: 0.35,
        },
        notes: sortNotes(bellNotes),
      },
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
    subtitle: 'Lo-Fi Chill · 86 BPM',
    bpm: 86,
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
    subtitle: '8-Bit · 142 BPM',
    bpm: 142,
    accent: '#ec4899',
    build: buildChiptuneProject,
  },
  {
    id: 'ambient',
    title: '深空漂流',
    subtitle: 'Ambient · 78 BPM',
    bpm: 78,
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
    subtitle: 'Tape Sunset · 76 BPM',
    bpm: 76,
    accent: '#f59e0b',
    build: buildTapeProject,
  },
  {
    id: 'trap',
    title: '暗涌 808',
    subtitle: 'Future Trap · 136 BPM',
    bpm: 136,
    accent: '#ef4444',
    build: buildTrapProject,
  },
]

export function createStarterProject(id = createProjectId()): Project {
  return buildSynthwaveProject(id)
}

export function generateRandomGrooveProject(id = createProjectId()): Project {
  const roots = [0, 2, 3, 4, 5, 7, 9]
  const root = roots[Math.floor(Math.random() * roots.length)] ?? 9
  const scaleChoices = ['minor', 'dorian', 'pentatonic', 'major'] as const
  const scaleId = scaleChoices[Math.floor(Math.random() * scaleChoices.length)] ?? 'minor'
  const progressions: ReadonlyArray<readonly number[]> = [
    [0, 5, 2, 6],
    [0, 3, 4, 0],
    [0, 4, 5, 3],
    [0, 2, 5, 4],
    [0, 6, 3, 4],
  ]
  const prog = progressions[Math.floor(Math.random() * progressions.length)] ?? [0, 5, 2, 6]
  const drumPatterns: DrumPatternId[] = ['synthwave', 'fourOnFloor', 'lofi', 'breakbeat', 'disco']
  const drumPattern = drumPatterns[Math.floor(Math.random() * drumPatterns.length)] ?? 'synthwave'
  const kitChoices = ['classic', '808', 'lofi', 'chip'] as const
  const kit = kitChoices[Math.floor(Math.random() * kitChoices.length)] ?? 'classic'
  const bpmPool = [84, 96, 108, 118, 124, 132, 138]
  const bpm = bpmPool[Math.floor(Math.random() * bpmPool.length)] ?? 120
  const swing = drumPattern === 'lofi' ? 0.28 : drumPattern === 'disco' ? 0.16 : undefined
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
    scaleRoot: root,
    scaleId,
    ...(swing !== undefined ? { swing } : {}),
    tracks: [
      {
        id: 'drums',
        name: '鼓',
        instrumentId: 'drums',
        mute: false,
        gain: 0.84,
        kit,
        notes: generateDrumPattern(drumPattern, 4),
      },
      {
        id: 'bass',
        name: bassInst === 'acid' ? '酸液' : '贝斯',
        instrumentId: bassInst,
        mute: false,
        gain: 0.82,
        synth: DEFAULT_SYNTH_PATCHES[bassInst],
        notes: generateMelodicPattern(bassInst === 'acid' ? 'acidLine' : 'octaveBass', 4, root, scaleId, prog),
      },
      {
        id: 'keys',
        name: '和弦',
        instrumentId: 'pad',
        mute: false,
        gain: 0.64,
        synth: DEFAULT_SYNTH_PATCHES.pad,
        notes: generateMelodicPattern('chords', 4, root, scaleId, prog),
      },
      {
        id: 'lead',
        name: '主旋律',
        instrumentId: leadInst,
        mute: false,
        gain: 0.74,
        synth: DEFAULT_SYNTH_PATCHES[leadInst],
        notes: generateMelodicPattern('randomRiff', 4, root, scaleId, prog),
      },
    ],
  }
}
