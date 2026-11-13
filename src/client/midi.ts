/**
 * Standard MIDI File export (format 1, 480 ticks per quarter note).
 * One tempo track, then one track per project track. Drum tracks go to
 * channel 10; their pitches already follow the General MIDI drum map.
 */
import { BEATS_PER_BAR, type Project } from '../model.ts'
import { swingOffset } from './scheduler.ts'

export const MIDI_PPQ = 480
const DRUM_CHANNEL = 9

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f]
  let rest = value >>> 7
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80)
    rest >>>= 7
  }
  return bytes
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function meta(type: number, data: readonly number[]): number[] {
  return [0xff, type, ...variableLength(data.length), ...data]
}

function text(type: number, value: string): number[] {
  return meta(type, [...new TextEncoder().encode(value)])
}

function chunk(id: string, body: readonly number[]): number[] {
  return [...id].map((char) => char.charCodeAt(0)).concat(uint32(body.length), body)
}

interface TimedEvent {
  tick: number
  /** Note-offs sort before note-ons on the same tick, so a repeated pitch retriggers. */
  order: number
  bytes: number[]
}

function trackChunk(events: TimedEvent[], endTick: number): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order)
  const body: number[] = []
  let cursor = 0
  for (const event of sorted) {
    body.push(...variableLength(event.tick - cursor), ...event.bytes)
    cursor = event.tick
  }
  body.push(...variableLength(Math.max(0, endTick - cursor)), ...meta(0x2f, []))
  return chunk('MTrk', body)
}

/**
 * Every track is written, muted or not, so the file can be remixed elsewhere.
 * Swing is baked into the note times, since a MIDI file has no swing setting.
 */
export function projectToMidi(project: Project): Uint8Array<ArrayBuffer> {
  const endTick = project.bars * BEATS_PER_BAR * MIDI_PPQ
  const microsecondsPerBeat = Math.round(60_000_000 / project.bpm)
  const tempoTrack = trackChunk([
    { tick: 0, order: 0, bytes: text(0x03, project.name) },
    {
      tick: 0,
      order: 1,
      bytes: meta(0x51, [(microsecondsPerBeat >>> 16) & 0xff, (microsecondsPerBeat >>> 8) & 0xff, microsecondsPerBeat & 0xff]),
    },
    { tick: 0, order: 2, bytes: meta(0x58, [BEATS_PER_BAR, 2, 24, 8]) },
  ], endTick)

  let nextChannel = 0
  const tracks = project.tracks.map((track) => {
    let channel = DRUM_CHANNEL
    if (track.instrumentId !== 'drums') {
      if (nextChannel === DRUM_CHANNEL) nextChannel += 1
      channel = nextChannel % 16
      nextChannel += 1
    }
    const events: TimedEvent[] = [{ tick: 0, order: 0, bytes: text(0x03, track.name) }]
    for (const note of track.notes) {
      const on = Math.round((note.startBeat + swingOffset(note.startBeat, project.swing)) * MIDI_PPQ)
      const off = Math.max(on + 1, Math.round((note.startBeat + note.durationBeats) * MIDI_PPQ))
      events.push({ tick: on, order: 2, bytes: [0x90 | channel, note.pitch, note.velocity] })
      events.push({ tick: off, order: 1, bytes: [0x80 | channel, note.pitch, 0] })
    }
    return trackChunk(events, endTick)
  })

  const header = chunk('MThd', [0, 1, (tracks.length + 1) >> 8, (tracks.length + 1) & 0xff, MIDI_PPQ >> 8, MIDI_PPQ & 0xff])
  const all = [...header, ...tempoTrack, ...tracks.flat()]
  const bytes = new Uint8Array(new ArrayBuffer(all.length))
  bytes.set(all)
  return bytes
}
