/**
 * The mixer after the voices: one bus per track with delay and reverb sends,
 * then a master gain, a compressor, and an analyser. Live playback and the
 * offline WAV render build the same graph, so an export sounds like playback.
 */
import type { SynthPatch } from '../model.ts'

export interface MixGraph {
  /** The node a track's voices connect to. Updates that track's level and sends. */
  input(trackId: string, gain: number, synth: SynthPatch | undefined): GainNode
  setTempo(bpm: number): void
  setMuted(muted: boolean): void
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

  let delay: DelayNode | undefined
  if (typeof ctx.createDelay === 'function') {
    delay = ctx.createDelay(2.0)
    const feedback = ctx.createGain()
    feedback.gain.setValueAtTime(0.34, ctx.currentTime)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.setValueAtTime(2600, ctx.currentTime)
    delay.connect(tone)
    tone.connect(feedback)
    feedback.connect(delay)
    tone.connect(master)
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
    input(trackId, gain, synth) {
      let bus = buses.get(trackId)
      if (bus === undefined) {
        const dry = ctx.createGain()
        const delaySend = ctx.createGain()
        const reverbSend = ctx.createGain()
        dry.connect(master)
        if (delay !== undefined) {
          dry.connect(delaySend)
          delaySend.connect(delay)
        }
        if (reverb !== undefined) {
          dry.connect(reverbSend)
          reverbSend.connect(reverb)
        }
        bus = { dry, delaySend, reverbSend }
        buses.set(trackId, bus)
      }
      bus.dry.gain.setValueAtTime(gain, ctx.currentTime)
      bus.delaySend.gain.setValueAtTime((synth?.delayMix ?? 0) * 0.65, ctx.currentTime)
      bus.reverbSend.gain.setValueAtTime(synth?.reverbMix ?? 0, ctx.currentTime)
      return bus.dry
    },
    setTempo(bpm) {
      if (delay === undefined) return
      const dottedEighth = Math.max(0.08, Math.min(1.2, (60 / bpm) * 0.75))
      delay.delayTime.setValueAtTime(dottedEighth, ctx.currentTime)
    },
    setMuted(muted) {
      master.gain.setValueAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime)
    },
  }
}
