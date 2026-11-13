import { describe, expect, it } from 'vitest'
import { createDefaultProject, type Project } from '../src/schema.ts'
import { MIDI_PPQ, projectToMidi } from '../src/client/midi.ts'
import { parseMidiMessage } from '../src/client/midi-input.ts'
import { encodeWav } from '../src/client/render.ts'

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

/** Index of `needle` in `bytes`, or -1. */
function find(bytes: Uint8Array, needle: readonly number[]): number {
  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer
    }
    return index
  }
  return -1
}

function sketch(overrides: Partial<Project> = {}): Project {
  const base = createDefaultProject('midi')
  const [drums, bass] = base.tracks
  if (drums === undefined || bass === undefined) throw new Error('default tracks missing')
  return {
    ...base,
    bars: 1,
    tracks: [
      { ...drums, notes: [{ pitch: 36, startBeat: 0, durationBeats: 0.25, velocity: 110 }] },
      { ...bass, mute: true, notes: [{ pitch: 45, startBeat: 0.25, durationBeats: 0.5, velocity: 90 }] },
    ],
    ...overrides,
  }
}

describe('MIDI export', () => {
  it('writes a format-1 file with a tempo track and one track per project track', () => {
    const bytes = projectToMidi(sketch())
    expect(ascii(bytes, 0, 4)).toBe('MThd')
    expect([...bytes.slice(8, 14)]).toEqual([0, 1, 0, 3, MIDI_PPQ >> 8, MIDI_PPQ & 0xff])
    let chunks = 0
    for (let index = 0; index < bytes.length - 3; index += 1) {
      if (ascii(bytes, index, 4) === 'MTrk') chunks += 1
    }
    expect(chunks).toBe(3)
    // 120 BPM is 500000 microseconds per beat.
    expect(find(bytes, [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20])).toBeGreaterThan(0)
    // Drums on channel 10, the muted bass still exported on channel 1.
    expect(find(bytes, [0x99, 36, 110])).toBeGreaterThan(0)
    expect(find(bytes, [0x90, 45, 90])).toBeGreaterThan(0)
    // The bass starts a sixteenth in: 120 ticks, then lasts an eighth: 240 ticks.
    expect(find(bytes, [120, 0x90, 45, 90, 0x81, 0x70, 0x80, 45, 0])).toBeGreaterThan(0)
  })

  it('bakes swing into the note times', () => {
    const bytes = projectToMidi(sketch({ swing: 1 / 3 }))
    // (0.25 + 0.25 / 3) beats = 160 ticks, written as the variable-length pair 0x81 0x20.
    expect(find(bytes, [0x81, 0x20, 0x90, 45, 90])).toBeGreaterThan(0)
  })
})

describe('WAV export', () => {
  it('encodes interleaved 16-bit PCM with a correct header', () => {
    const left = Float32Array.from([0, 1, -1, 2])
    const right = Float32Array.from([0.5, -0.5, 0, -2])
    const bytes = encodeWav({
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 4,
      getChannelData: (channel) => channel === 0 ? left : right,
    })
    const view = new DataView(bytes.buffer)
    expect(ascii(bytes, 0, 4) + ascii(bytes, 8, 8)).toBe('RIFFWAVEfmt ')
    expect(bytes.length).toBe(44 + 16)
    expect(view.getUint32(4, true)).toBe(36 + 16)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(16)
    const samples = Array.from({ length: 8 }, (_, index) => view.getInt16(44 + index * 2, true))
    // Out-of-range input is clamped, not wrapped.
    expect(samples).toEqual([0, 16384, 32767, -16384, -32768, 0, 32767, -32768])
  })

  it('scales a hot signal down to the ceiling instead of clipping it', () => {
    const hot = Float32Array.from([0.5, -2, 1])
    const view = new DataView(encodeWav({
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 3,
      getChannelData: () => hot,
    }, 0.5).buffer)
    const samples = [0, 1, 2].map((index) => view.getInt16(44 + index * 2, true) / 32768)
    expect(samples[0]).toBeCloseTo(0.125, 3)
    expect(samples[1]).toBeCloseTo(-0.5, 3)
    expect(samples[2]).toBeCloseTo(0.25, 3)
  })
})

describe('MIDI input', () => {
  it('parses Note On / Note Off messages and clamps pitch into grid range', () => {
    expect(parseMidiMessage(new Uint8Array([0x92, 60, 110]))).toEqual({ type: 'noteOn', pitch: 60, velocity: 110 })
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))).toEqual({ type: 'noteOff', pitch: 60 })
    expect(parseMidiMessage(new Uint8Array([0x80, 72, 64]))).toEqual({ type: 'noteOff', pitch: 72 })
    expect(parseMidiMessage(new Uint8Array([0x90, 20, 90]))).toEqual({ type: 'noteOn', pitch: 36, velocity: 90 })
    expect(parseMidiMessage(new Uint8Array([0x90, 108, 90]))).toEqual({ type: 'noteOn', pitch: 84, velocity: 90 })
    expect(parseMidiMessage(new Uint8Array([0xb0, 1, 64]))).toBeNull()
  })
})
