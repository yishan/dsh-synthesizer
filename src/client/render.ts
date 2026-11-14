/**
 * Offline render of one pass of the loop to a WAV file. It schedules the same
 * events through the same mixer as live playback, into an OfflineAudioContext.
 */
import type { Project } from '../model.ts'
import { createMixGraph } from './mix.ts'
import { advanceScheduler, playEvents, schedulerSignature } from './scheduler.ts'

const SAMPLE_RATE = 44100
/** Room for release tails, echo, and reverb after the last bar. */
const TAIL_SECONDS = 2.5

export interface PcmSource {
  numberOfChannels: number
  sampleRate: number
  length: number
  getChannelData(channel: number): Float32Array
}

/**
 * 16-bit PCM WAV, channels interleaved. With `ceiling`, a signal that peaks
 * above it is scaled down to it, so a hot mix is exported quieter instead of clipped.
 */
export function encodeWav(source: PcmSource, ceiling?: number): Uint8Array<ArrayBuffer> {
  const channels = Math.max(1, source.numberOfChannels)
  const dataBytes = source.length * channels * 2
  const bytes = new Uint8Array(new ArrayBuffer(44 + dataBytes))
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, source.sampleRate, true)
  view.setUint32(28, source.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  const data = Array.from({ length: channels }, (_, channel) => source.getChannelData(channel))
  let scale = 1
  if (ceiling !== undefined) {
    let peak = 0
    for (const samples of data) {
      for (let frame = 0; frame < source.length; frame += 1) {
        const magnitude = Math.abs(samples[frame] ?? 0)
        if (magnitude > peak) peak = magnitude
      }
    }
    if (peak > ceiling) scale = ceiling / peak
  }
  let offset = 44
  for (let frame = 0; frame < source.length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, (data[channel]?.[frame] ?? 0) * scale))
      view.setInt16(offset, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true)
      offset += 2
    }
  }
  return bytes
}

/** Render one pass of the loop, muted tracks left out, exactly as playback would sound. */
export async function renderProject(project: Project): Promise<AudioBuffer> {
  const Offline = globalThis.OfflineAudioContext
  if (Offline === undefined) throw new Error('render_unavailable')
  const once: Project = { ...project, loop: false }
  const loopSeconds = once.bars * once.beatsPerBar * (60 / once.bpm)
  const ctx = new Offline(2, Math.ceil((loopSeconds + TAIL_SECONDS) * SAMPLE_RATE), SAMPLE_RATE)
  const mix = createMixGraph(ctx, ctx.destination)
  mix.setTempo(once.bpm)
  const step = advanceScheduler(
    { origin: 0, scheduledUntilBeat: 0, signature: schedulerSignature(once) },
    0,
    loopSeconds + 0.001,
    once,
    true,
  )
  // The instruments only use the node factories and the clock, which both context kinds share.
  playEvents(
    step.events,
    ctx as unknown as AudioContext,
    (event) => mix.input(event.trackId, event.gain, event.synth, event.pan, event.instrumentId),
    undefined,
    mix,
  )
  return ctx.startRendering()
}
