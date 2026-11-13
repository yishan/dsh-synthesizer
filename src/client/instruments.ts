/**
 * Browser instruments. Built-in voices are real-time Web Audio synthesizers;
 * `sample` is a slot another instrument can register later without changing project JSON.
 */
import {
  DRUM_CLAP,
  DRUM_CYMBAL,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_OPEN_HAT,
  DRUM_RIM,
  DRUM_SNARE,
  DRUM_TOM_LOW,
  type LfoTarget,
  type SynthPatch,
} from '../model.ts'

export interface ScheduledNote {
  stop(time: number): void
}

export interface Instrument {
  readonly id: string
  readonly kind: 'synth' | 'sample'
  noteOn(
    ctx: AudioContext,
    out: AudioNode,
    time: number,
    pitch: number,
    velocity: number,
    patch?: SynthPatch,
    /** Instrument-specific variant. For drums, the kit id. */
    variant?: string,
  ): ScheduledNote
}

export type DrumPiece = 'kick' | 'rim' | 'snare' | 'clap' | 'hat' | 'tom' | 'openHat' | 'cymbal'

export const INSTRUMENT_LABELS: Record<string, string> = {
  lead: '主音 Lead',
  bass: '贝斯 Bass',
  pad: '铺底 Pad',
  keys: '键盘 Keys',
  acid: '酸液 303',
  pluck: '拨弦 Pluck',
  chip: '红白机 8-Bit',
  bell: '星际铃 Bell',
  drums: '鼓组 Drums',
}

/**
 * What a track is called until the user names it: its role in the song, not
 * its sound. The instrument and sound are already shown under the name.
 */
export const TRACK_NAMES: Record<string, string> = {
  lead: '主旋律',
  bass: '贝斯',
  pad: '铺底',
  keys: '键盘',
  acid: '酸液',
  pluck: '拨弦',
  chip: '红白机',
  bell: '铃音',
  drums: '鼓',
}

export function defaultTrackName(instrumentId: string): string {
  return TRACK_NAMES[instrumentId] ?? '音轨'
}

export const DRUM_LABELS: Record<number, { name: string; short: string; piece: DrumPiece; color: string }> = {
  [DRUM_CYMBAL]: { name: '吊镲 Crash', short: 'CR', piece: 'cymbal', color: '#f59e0b' },
  [DRUM_OPEN_HAT]: { name: '开镲 Open Hat', short: 'OH', piece: 'openHat', color: '#eab308' },
  [DRUM_TOM_LOW]: { name: '通鼓 Low Tom', short: 'TM', piece: 'tom', color: '#10b981' },
  [DRUM_HAT]: { name: '闭镲 Closed Hat', short: 'CH', piece: 'hat', color: '#06b6d4' },
  [DRUM_CLAP]: { name: '拍手 Clap', short: 'CP', piece: 'clap', color: '#ec4899' },
  [DRUM_SNARE]: { name: '军鼓 Snare', short: 'SD', piece: 'snare', color: '#f97316' },
  [DRUM_RIM]: { name: '边击 Rimshot', short: 'RM', piece: 'rim', color: '#8b5cf6' },
  [DRUM_KICK]: { name: '底鼓 Kick', short: 'BD', piece: 'kick', color: '#ef4444' },
}

export const DEFAULT_SYNTH_PATCHES: Record<string, SynthPatch> = {
  lead: {
    waveform: 'sawtooth',
    detune: 14,
    subMix: 0.22,
    cutoff: 5200,
    resonance: 2.2,
    envMod: 0.45,
    attack: 0.01,
    decay: 0.22,
    sustain: 0.6,
    release: 0.14,
    delayMix: 0.26,
    drive: 0.18,
  },
  bass: {
    waveform: 'square',
    detune: 4,
    subMix: 0.45,
    cutoff: 480,
    resonance: 3.4,
    envMod: 0.52,
    attack: 0.005,
    decay: 0.18,
    sustain: 0.42,
    release: 0.07,
    delayMix: 0,
    drive: 0.24,
  },
  pad: {
    waveform: 'sine',
    detune: 16,
    subMix: 0.18,
    cutoff: 2100,
    resonance: 1.3,
    envMod: 0.22,
    attack: 0.14,
    decay: 0.45,
    sustain: 0.78,
    release: 0.42,
    delayMix: 0.34,
    drive: 0.04,
  },
  keys: {
    waveform: 'triangle',
    detune: 8,
    subMix: 0.1,
    cutoff: 2800,
    resonance: 1.6,
    envMod: 0.35,
    attack: 0.006,
    decay: 0.38,
    sustain: 0.22,
    release: 0.2,
    delayMix: 0.2,
    drive: 0.06,
  },
  acid: {
    waveform: 'sawtooth',
    detune: 0,
    subMix: 0.15,
    cutoff: 320,
    resonance: 11.5,
    envMod: 0.88,
    attack: 0.004,
    decay: 0.16,
    sustain: 0.08,
    release: 0.06,
    delayMix: 0.18,
    drive: 0.45,
  },
  pluck: {
    waveform: 'sawtooth',
    detune: 11,
    subMix: 0,
    cutoff: 880,
    resonance: 4.0,
    envMod: 0.78,
    attack: 0.003,
    decay: 0.15,
    sustain: 0.05,
    release: 0.18,
    delayMix: 0.4,
    drive: 0.1,
  },
  chip: {
    waveform: 'square',
    detune: 0,
    subMix: 0,
    cutoff: 9500,
    resonance: 1.0,
    envMod: 0.1,
    attack: 0.002,
    decay: 0.12,
    sustain: 0.5,
    release: 0.04,
    delayMix: 0.12,
    drive: 0.15,
  },
  bell: {
    waveform: 'sine',
    detune: 22,
    subMix: 0,
    cutoff: 6800,
    resonance: 6.2,
    envMod: 0.48,
    attack: 0.004,
    decay: 0.52,
    sustain: 0.14,
    release: 0.58,
    delayMix: 0.45,
    drive: 0.05,
  },
}

export function resolveSynthPatch(instrumentId: string, custom?: SynthPatch): SynthPatch {
  if (custom !== undefined) return custom
  return DEFAULT_SYNTH_PATCHES[instrumentId] ?? DEFAULT_SYNTH_PATCHES.lead!
}

const registry = new Map<string, Instrument>()
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>()
const driveCurves = new Map<number, Float32Array<ArrayBuffer>>()

export function registerInstrument(instrument: Instrument): void {
  registry.set(instrument.id, instrument)
}

export function unregisterInstrument(id: string): void {
  registry.delete(id)
}

export function getInstrument(id: string): Instrument {
  const found = registry.get(id)
  if (found === undefined) throw new Error(`unknown_instrument:${id}`)
  return found
}

export function listInstruments(): readonly Instrument[] {
  return [...registry.values()]
}

/** General-MIDI-ish 8-piece drum kit. Unmapped pitches stay silent. */
export function drumPiece(pitch: number): DrumPiece | null {
  if (pitch === DRUM_KICK) return 'kick'
  if (pitch === DRUM_RIM) return 'rim'
  if (pitch === DRUM_SNARE) return 'snare'
  if (pitch === DRUM_CLAP) return 'clap'
  if (pitch === DRUM_HAT) return 'hat'
  if (pitch === DRUM_TOM_LOW) return 'tom'
  if (pitch === DRUM_OPEN_HAT) return 'openHat'
  if (pitch === DRUM_CYMBAL) return 'cymbal'
  return null
}

function silence(): ScheduledNote {
  return { stop() {} }
}

export function midiHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12)
}

function amplitude(velocity: number): number {
  return Math.max(0, Math.min(1, velocity / 127)) * 0.22
}

function getDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(Math.max(0, Math.min(1, amount)) * 20)
  const cached = driveCurves.get(key)
  if (cached !== undefined) return cached
  const k = (key / 20) * 36
  const samples = 256
  const curve = new Float32Array(new ArrayBuffer(samples * 4))
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1
    curve[i] = k === 0 ? x : ((1 + k / 12) * x) / (1 + (k / 12) * Math.abs(x))
  }
  driveCurves.set(key, curve)
  return curve
}

interface ToneOptions {
  type: OscillatorType
  detuneCents?: readonly number[]
  subMix?: number
  attack: number
  decay: number
  sustain: number
  release: number
  filterHz?: number
  resonance?: number
  envMod?: number
  drive?: number
  lfo?: { target: LfoTarget; rate: number; depth: number }
}

/**
 * Click-free ADSR + Resonant Lowpass Filter voice.
 * Properly interpolates the envelope level at `stopTime` even when `stop(stopTime)`
 * is called immediately after `noteOn()` for short 16th-note events.
 */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  pitch: number,
  velocity: number,
  options: ToneOptions,
): ScheduledNote {
  const gain = ctx.createGain()
  const peak = amplitude(velocity) * (options.drive !== undefined && options.drive > 0 ? 1 + options.drive * 0.25 : 1)
  const sustainLevel = peak * options.sustain
  const attackEnd = time + options.attack
  const decayEnd = attackEnd + options.decay

  gain.gain.setValueAtTime(0, time)
  gain.gain.linearRampToValueAtTime(peak, attackEnd)
  gain.gain.linearRampToValueAtTime(sustainLevel, decayEnd)

  let target: AudioNode = gain
  if (options.drive !== undefined && options.drive > 0.05 && typeof ctx.createWaveShaper === 'function') {
    const shaper = ctx.createWaveShaper()
    shaper.curve = getDriveCurve(options.drive)
    shaper.connect(gain)
    target = shaper
  }

  let filter: BiquadFilterNode | undefined
  let filterBaseHz = 0
  if (options.filterHz !== undefined) {
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    const baseHz = Math.max(40, Math.min(16000, options.filterHz))
    filterBaseHz = baseHz
    const modHz = options.envMod !== undefined && options.envMod > 0
      ? Math.min(16000, baseHz + options.envMod * 7200)
      : baseHz
    filter.frequency.setValueAtTime(baseHz, time)
    if (modHz > baseHz + 1) {
      filter.frequency.linearRampToValueAtTime(modHz, attackEnd)
      filter.frequency.linearRampToValueAtTime(
        baseHz + (modHz - baseHz) * options.sustain * 0.35,
        decayEnd + options.decay * 0.3,
      )
    }
    if (options.resonance !== undefined && filter.Q !== undefined) {
      filter.Q.setValueAtTime(options.resonance, time)
    }
    filter.connect(target)
    target = filter
  }

  const baseFreq = midiHz(pitch)
  const oscillators = (options.detuneCents ?? [0]).map((cents) => {
    const oscillator = ctx.createOscillator()
    oscillator.type = options.type
    oscillator.frequency.setValueAtTime(baseFreq * 2 ** (cents / 1200), time)
    oscillator.connect(target)
    oscillator.start(time)
    return oscillator
  })

  if (options.subMix !== undefined && options.subMix > 0.02 && pitch >= 24) {
    const subOsc = ctx.createOscillator()
    subOsc.type = 'sine'
    subOsc.frequency.setValueAtTime(midiHz(pitch - 12), time)
    const subGain = ctx.createGain()
    subGain.gain.setValueAtTime(options.subMix * 0.55, time)
    subOsc.connect(subGain)
    subGain.connect(target)
    subOsc.start(time)
    oscillators.push(subOsc)
  }

  // LFO: one sine per voice, restarted with the note, routed to pitch, filter, or level.
  let voiceOut: AudioNode = gain
  const lfo = options.lfo
  if (lfo !== undefined && lfo.depth > 0) {
    const lfoOsc = ctx.createOscillator()
    lfoOsc.type = 'sine'
    lfoOsc.frequency.setValueAtTime(lfo.rate, time)
    const lfoGain = ctx.createGain()
    lfoOsc.connect(lfoGain)
    if (lfo.target === 'pitch') {
      // Up to a semitone either way.
      lfoGain.gain.setValueAtTime(lfo.depth * 100, time)
      for (const oscillator of oscillators) {
        if (oscillator.detune !== undefined) lfoGain.connect(oscillator.detune)
      }
    } else if (lfo.target === 'filter' && filter !== undefined) {
      // Sweeps the cutoff around its base value, never down to zero.
      lfoGain.gain.setValueAtTime(lfo.depth * filterBaseHz * 0.9, time)
      lfoGain.connect(filter.frequency)
    } else if (lfo.target === 'amp') {
      const tremolo = ctx.createGain()
      tremolo.gain.setValueAtTime(1 - lfo.depth / 2, time)
      lfoGain.gain.setValueAtTime(lfo.depth / 2, time)
      lfoGain.connect(tremolo.gain)
      gain.connect(tremolo)
      voiceOut = tremolo
    }
    lfoOsc.start(time)
    oscillators.push(lfoOsc)
  }

  voiceOut.connect(out)
  let scheduledStop: number | undefined

  return {
    // A voice gets its planned stop time as soon as it starts. A later call may
    // only move the stop earlier (a held preview key being released).
    stop(stopTime: number) {
      const at = Math.max(stopTime, time + 0.004)
      if (scheduledStop !== undefined && at >= scheduledStop) return
      scheduledStop = at
      const elapsed = at - time
      let levelAtStop = sustainLevel
      if (elapsed < options.attack) {
        levelAtStop = peak * (elapsed / Math.max(0.001, options.attack))
      } else if (elapsed < options.attack + options.decay) {
        const decayFraction = (elapsed - options.attack) / Math.max(0.001, options.decay)
        levelAtStop = peak + (sustainLevel - peak) * decayFraction
      }

      gain.gain.cancelScheduledValues(at)
      if (at <= attackEnd) {
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(levelAtStop, at)
      } else if (at < decayEnd) {
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(peak, attackEnd)
        gain.gain.linearRampToValueAtTime(levelAtStop, at)
      } else {
        gain.gain.setValueAtTime(levelAtStop, at)
      }
      gain.gain.linearRampToValueAtTime(0, at + options.release)

      for (const oscillator of oscillators) {
        try {
          oscillator.stop(at + options.release + 0.02)
        } catch {
          /* Already stopped. */
        }
      }
    },
  }
}

function patchToToneOptions(patch: SynthPatch): ToneOptions {
  const detuneCents = patch.detune > 0.5 ? [-patch.detune, patch.detune] : [0]
  return {
    type: patch.waveform,
    detuneCents,
    subMix: patch.subMix,
    attack: patch.attack,
    decay: patch.decay,
    sustain: patch.sustain,
    release: patch.release,
    filterHz: patch.cutoff,
    resonance: patch.resonance,
    envMod: patch.envMod,
    drive: patch.drive,
    ...(patch.lfoTarget !== undefined && patch.lfoDepth !== undefined && patch.lfoDepth > 0
      ? { lfo: { target: patch.lfoTarget, rate: patch.lfoRate ?? 5, depth: patch.lfoDepth } }
      : {}),
  }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx)
  if (cached !== undefined) return cached
  const rate = ctx.sampleRate || 44100
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(rate * 0.5)), rate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1
  noiseBuffers.set(ctx, buffer)
  return buffer
}

function noiseHit(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  velocity: number,
  decay: number,
  highpass: number | null,
): ScheduledNote {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const gain = ctx.createGain()
  const peak = amplitude(velocity)
  gain.gain.setValueAtTime(peak, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay)
  if (highpass === null) {
    source.connect(gain)
  } else {
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(highpass, time)
    source.connect(filter)
    filter.connect(gain)
  }
  gain.connect(out)
  source.start(time)
  source.stop(time + decay + 0.02)
  return RING_OUT
}

/**
 * A drum hit is a one-shot: it rings for its own length and ignores note-off.
 * Cutting it at the end of a sixteenth-note step clipped kicks and cymbals.
 */
const RING_OUT: ScheduledNote = { stop() {} }

interface SweepVoice {
  type: OscillatorType
  /** Pitch falls from `from` to `to` Hz over `sweep` seconds. */
  from: number
  to: number
  sweep: number
  decay: number
  level: number
}

interface NoiseVoice {
  decay: number
  highpass: number
  level: number
}

/** One synthesized drum kit: the same eight pieces, voiced differently. */
export interface DrumKit {
  id: string
  label: string
  description: string
  kick: SweepVoice
  tom: SweepVoice
  snare: { type: OscillatorType; pitch: number; toneDecay: number; noiseDecay: number; highpass: number }
  clap: { decay: number; highpass: number }
  rim: { pitch: number; decay: number; filterHz: number }
  hat: NoiseVoice
  openHat: NoiseVoice
  cymbal: NoiseVoice
}

export const DEFAULT_DRUM_KIT = 'classic'

export const DRUM_KITS: readonly DrumKit[] = [
  {
    id: 'classic',
    label: '电子鼓',
    description: '干净利落的通用电子鼓',
    kick: { type: 'sine', from: 155, to: 46, sweep: 0.12, decay: 0.24, level: 1.45 },
    tom: { type: 'sine', from: 115, to: 68, sweep: 0.16, decay: 0.2, level: 1.25 },
    snare: { type: 'triangle', pitch: 50, toneDecay: 0.08, noiseDecay: 0.16, highpass: 1200 },
    clap: { decay: 0.18, highpass: 1300 },
    rim: { pitch: 76, decay: 0.035, filterHz: 2400 },
    hat: { decay: 0.05, highpass: 6200, level: 0.72 },
    openHat: { decay: 0.26, highpass: 5600, level: 0.78 },
    cymbal: { decay: 0.45, highpass: 4200, level: 0.85 },
  },
  {
    id: '808',
    label: '808',
    description: '长尾低频底鼓、清脆军鼓和细亮的镲',
    kick: { type: 'sine', from: 130, to: 40, sweep: 0.09, decay: 0.55, level: 1.5 },
    tom: { type: 'sine', from: 150, to: 90, sweep: 0.2, decay: 0.32, level: 1.2 },
    snare: { type: 'triangle', pitch: 55, toneDecay: 0.1, noiseDecay: 0.2, highpass: 2200 },
    clap: { decay: 0.24, highpass: 1100 },
    rim: { pitch: 81, decay: 0.03, filterHz: 3200 },
    hat: { decay: 0.035, highpass: 8500, level: 0.65 },
    openHat: { decay: 0.32, highpass: 7800, level: 0.7 },
    cymbal: { decay: 0.7, highpass: 6000, level: 0.75 },
  },
  {
    id: 'lofi',
    label: '磁带 Lo-Fi',
    description: '发闷、偏短、高频收敛的磁带质感',
    kick: { type: 'sine', from: 105, to: 48, sweep: 0.1, decay: 0.2, level: 1.3 },
    tom: { type: 'sine', from: 100, to: 62, sweep: 0.14, decay: 0.18, level: 1.1 },
    snare: { type: 'triangle', pitch: 47, toneDecay: 0.09, noiseDecay: 0.13, highpass: 650 },
    clap: { decay: 0.14, highpass: 900 },
    rim: { pitch: 72, decay: 0.04, filterHz: 1700 },
    hat: { decay: 0.04, highpass: 3800, level: 0.6 },
    openHat: { decay: 0.2, highpass: 3400, level: 0.62 },
    cymbal: { decay: 0.32, highpass: 2800, level: 0.65 },
  },
  {
    id: 'chip',
    label: '8-Bit',
    description: '方波鼓和极短的噪声，红白机味道',
    kick: { type: 'square', from: 240, to: 55, sweep: 0.06, decay: 0.1, level: 0.8 },
    tom: { type: 'square', from: 300, to: 120, sweep: 0.08, decay: 0.12, level: 0.7 },
    snare: { type: 'square', pitch: 64, toneDecay: 0.04, noiseDecay: 0.07, highpass: 2500 },
    clap: { decay: 0.06, highpass: 3000 },
    rim: { pitch: 88, decay: 0.02, filterHz: 5000 },
    hat: { decay: 0.018, highpass: 9500, level: 0.6 },
    openHat: { decay: 0.09, highpass: 9000, level: 0.6 },
    cymbal: { decay: 0.16, highpass: 7000, level: 0.6 },
  },
]

export function getDrumKit(id?: string): DrumKit {
  return DRUM_KITS.find((kit) => kit.id === id) ?? DRUM_KITS[0]!
}

function sweepHit(ctx: AudioContext, out: AudioNode, time: number, velocity: number, voice: SweepVoice): ScheduledNote {
  const oscillator = ctx.createOscillator()
  oscillator.type = voice.type
  oscillator.frequency.setValueAtTime(voice.from, time)
  oscillator.frequency.exponentialRampToValueAtTime(voice.to, time + voice.sweep)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(amplitude(velocity) * voice.level, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + voice.decay)
  oscillator.connect(gain)
  gain.connect(out)
  oscillator.start(time)
  oscillator.stop(time + voice.decay + 0.02)
  return RING_OUT
}

function playDrum(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  piece: DrumPiece,
  velocity: number,
  kit: DrumKit,
): ScheduledNote {
  switch (piece) {
    case 'kick':
      return sweepHit(ctx, out, time, velocity, kit.kick)
    case 'tom':
      return sweepHit(ctx, out, time, velocity, kit.tom)
    case 'snare':
      tone(ctx, out, time, kit.snare.pitch, velocity, {
        type: kit.snare.type,
        attack: 0.001,
        decay: kit.snare.toneDecay,
        sustain: 0,
        release: 0.04,
      }).stop(time + kit.snare.toneDecay)
      return noiseHit(ctx, out, time, velocity, kit.snare.noiseDecay, kit.snare.highpass)
    case 'clap':
      noiseHit(ctx, out, time, velocity * 0.85, 0.025, kit.clap.highpass + 200)
      noiseHit(ctx, out, time + 0.012, velocity * 0.9, 0.03, kit.clap.highpass + 200)
      return noiseHit(ctx, out, time + 0.024, velocity, kit.clap.decay, kit.clap.highpass)
    case 'rim':
      tone(ctx, out, time, kit.rim.pitch, velocity * 1.1, {
        type: 'square',
        attack: 0.001,
        decay: kit.rim.decay,
        sustain: 0,
        release: 0.02,
        filterHz: kit.rim.filterHz,
        resonance: 6,
      }).stop(time + kit.rim.decay)
      return RING_OUT
    case 'hat':
      return noiseHit(ctx, out, time, velocity * kit.hat.level, kit.hat.decay, kit.hat.highpass)
    case 'openHat':
      return noiseHit(ctx, out, time, velocity * kit.openHat.level, kit.openHat.decay, kit.openHat.highpass)
    case 'cymbal':
      tone(ctx, out, time, 84, velocity * 0.5, {
        type: 'square',
        detuneCents: [-19, 23],
        attack: 0.002,
        decay: kit.cymbal.decay * 0.4,
        sustain: 0,
        release: 0.15,
        filterHz: Math.min(16000, kit.cymbal.highpass + 3300),
      }).stop(time + kit.cymbal.decay * 0.4)
      return noiseHit(ctx, out, time, velocity * kit.cymbal.level, kit.cymbal.decay, kit.cymbal.highpass)
    default: {
      const unexpected: never = piece
      throw new Error(`unexpected drum ${String(unexpected)}`)
    }
  }
}

export type BuiltinId = 'lead' | 'bass' | 'pad' | 'keys' | 'acid' | 'pluck' | 'chip' | 'bell' | 'drums'

function playBuiltin(
  id: BuiltinId,
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  pitch: number,
  velocity: number,
  patch?: SynthPatch,
  variant?: string,
): ScheduledNote {
  if (id === 'drums') {
    const piece = drumPiece(pitch)
    if (piece === null) return silence()
    return playDrum(ctx, out, time, piece, velocity, getDrumKit(variant))
  }
  if (patch !== undefined) {
    return tone(ctx, out, time, pitch, velocity, patchToToneOptions(patch))
  }
  switch (id) {
    case 'lead':
      return tone(ctx, out, time, pitch, velocity, {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.12,
        sustain: 0.55,
        release: 0.08,
      })
    case 'bass':
      return tone(ctx, out, time, pitch, velocity, {
        type: 'square',
        attack: 0.005,
        decay: 0.18,
        sustain: 0.45,
        release: 0.06,
        filterHz: 420,
      })
    case 'pad':
      return tone(ctx, out, time, pitch, velocity, {
        type: 'sine',
        detuneCents: [-7, 7],
        attack: 0.08,
        decay: 0.2,
        sustain: 0.75,
        release: 0.2,
      })
    case 'keys':
      return tone(ctx, out, time, pitch, velocity, {
        type: 'triangle',
        attack: 0.005,
        decay: 0.35,
        sustain: 0.15,
        release: 0.12,
      })
    case 'acid':
    case 'pluck':
    case 'chip':
    case 'bell':
      return tone(ctx, out, time, pitch, velocity, patchToToneOptions(resolveSynthPatch(id)))
    default: {
      const unexpected: never = id
      throw new Error(`unexpected instrument ${String(unexpected)}`)
    }
  }
}

function builtin(id: BuiltinId): Instrument {
  return {
    id,
    kind: 'synth',
    noteOn(ctx, out, time, pitch, velocity, patch, variant) {
      return playBuiltin(id, ctx, out, time, pitch, velocity, patch, variant)
    },
  }
}

for (const id of ['lead', 'bass', 'pad', 'keys', 'drums', 'acid', 'pluck', 'chip', 'bell'] as const) {
  registerInstrument(builtin(id))
}
