/**
 * The mixer after the voices: one bus per track with delay and reverb sends,
 * then a master gain, a compressor, and an analyser. Live playback and the
 * offline WAV render build the same graph, so an export sounds like playback.
 */
import type { SynthPatch } from '../model.ts'

export interface MixGraph {
  /** The node a track's voices connect to. Updates that track's level, pan, and sends. */
  input(trackId: string, gain: number, synth: SynthPatch | undefined, pan?: number, instrumentId?: string): GainNode
  setTempo(bpm: number): void
  setMuted(muted: boolean): void
  triggerSidechain?(time: number, velocity?: number): void
  readonly analyser: AnalyserNode | undefined
}

const MASTER_LEVEL = 0.9
/**
 * Trim after the compressor, whose built-in make-up gain pushed a full
 * four-track loop about 10% past full scale. Measured on an offline render.
 */
const OUTPUT_TRIM = 0.8
const REVERB_SECONDS = 2.2

interface TrackBus {
  dry: GainNode
  panner: StereoPannerNode | undefined
  delaySend: GainNode
  reverbSend: GainNode
}

/** A plain algorithmic room: decaying stereo noise, darker towards the tail. */
function impulseResponse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate || 44100
  const length = Math.floor(rate * REVERB_SECONDS)
  const buffer = ctx.createBuffer(2, length, rate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    let smoothed = 0
    for (let index = 0; index < length; index += 1) {
      const progress = index / length
      // One-pole lowpass whose cutoff falls over time, so highs die first.
      const damping = 0.35 + progress * 0.6
      smoothed = smoothed * damping + (Math.random() * 2 - 1) * (1 - damping)
      data[index] = smoothed * (1 - progress) ** 2.6
    }
  }
  return buffer
}

export function createMixGraph(ctx: BaseAudioContext, destination: AudioNode): MixGraph {
  const master = ctx.createGain()
  master.gain.setValueAtTime(MASTER_LEVEL, ctx.currentTime)
  const duckBus = ctx.createGain()
  duckBus.gain.setValueAtTime(1, ctx.currentTime)
  duckBus.connect(master)

  let tail: AudioNode = master
  if (typeof ctx.createDynamicsCompressor === 'function') {
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold?.setValueAtTime(-10, ctx.currentTime)
    compressor.knee?.setValueAtTime(12, ctx.currentTime)
    compressor.ratio?.setValueAtTime(4, ctx.currentTime)
    compressor.attack?.setValueAtTime(0.005, ctx.currentTime)
    compressor.release?.setValueAtTime(0.16, ctx.currentTime)
    tail.connect(compressor)
    tail = compressor
  }
  const trim = ctx.createGain()
  trim.gain.setValueAtTime(OUTPUT_TRIM, ctx.currentTime)
  tail.connect(trim)
  tail = trim

  let analyser: AnalyserNode | undefined
  if (typeof ctx.createAnalyser === 'function') {
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.75
    tail.connect(analyser)
    tail = analyser
  }
  tail.connect(destination)

  let delayL: DelayNode | undefined
  let delayR: DelayNode | undefined
  if (typeof ctx.createDelay === 'function') {
    delayL = ctx.createDelay(2.0)
    const feedback = ctx.createGain()
    feedback.gain.setValueAtTime(0.32, ctx.currentTime)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.setValueAtTime(2600, ctx.currentTime)
    delayL.connect(tone)
    if (typeof ctx.createStereoPanner === 'function') {
      delayR = ctx.createDelay(2.0)
      const panL = ctx.createStereoPanner()
      const panR = ctx.createStereoPanner()
      panL.pan.setValueAtTime(-0.55, ctx.currentTime)
      panR.pan.setValueAtTime(0.55, ctx.currentTime)
      tone.connect(panL)
      panL.connect(duckBus)
      tone.connect(delayR)
      delayR.connect(panR)
      panR.connect(duckBus)
      delayR.connect(feedback)
      feedback.connect(delayL)
    } else {
      tone.connect(feedback)
      feedback.connect(delayL)
      tone.connect(duckBus)
    }
  }

  let reverb: ConvolverNode | undefined
  if (typeof ctx.createConvolver === 'function') {
    reverb = ctx.createConvolver()
    reverb.buffer = impulseResponse(ctx)
    const wet = ctx.createGain()
    wet.gain.setValueAtTime(0.9, ctx.currentTime)
    reverb.connect(wet)
    wet.connect(master)
  }

  const buses = new Map<string, TrackBus>()

  return {
    analyser,
    input(trackId, gain, synth, pan = 0, instrumentId) {
      let bus = buses.get(trackId)
      if (bus === undefined) {
        const dry = ctx.createGain()
        const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : undefined
        const delaySend = ctx.createGain()
        const reverbSend = ctx.createGain()
        const positioned: AudioNode = panner !== undefined ? (dry.connect(panner), panner) : dry
        const isDrums = instrumentId === 'drums' || trackId === 'drums'
        positioned.connect(isDrums ? master : duckBus)
        if (delayL !== undefined) {
          positioned.connect(delaySend)
          delaySend.connect(delayL)
        }
        if (reverb !== undefined) {
          positioned.connect(reverbSend)
          reverbSend.connect(reverb)
        }
        bus = { dry, panner, delaySend, reverbSend }
        buses.set(trackId, bus)
      }
      bus.dry.gain.setValueAtTime(gain, ctx.currentTime)
      if (bus.panner !== undefined) {
        bus.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime)
      }
      bus.delaySend.gain.setValueAtTime((synth?.delayMix ?? 0) * 0.65, ctx.currentTime)
      bus.reverbSend.gain.setValueAtTime(synth?.reverbMix ?? 0, ctx.currentTime)
      return bus.dry
    },
    setTempo(bpm) {
      const dottedEighth = Math.max(0.08, Math.min(1.2, (60 / bpm) * 0.75))
      delayL?.delayTime.setValueAtTime(dottedEighth, ctx.currentTime)
      delayR?.delayTime.setValueAtTime(dottedEighth, ctx.currentTime)
    },
    setMuted(muted) {
      master.gain.setValueAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime)
    },
    triggerSidechain(time, velocity = 100) {
      const velNorm = Math.max(0.3, Math.min(1, velocity / 127))
      const dip = Math.max(0.38, 1 - 0.48 * velNorm)
      duckBus.gain.cancelScheduledValues?.(time)
      duckBus.gain.setValueAtTime(1, time)
      duckBus.gain.linearRampToValueAtTime(dip, time + 0.008)
      duckBus.gain.exponentialRampToValueAtTime?.(1, time + 0.16)
    },
  }
}
