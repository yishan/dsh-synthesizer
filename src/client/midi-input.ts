/** Optional Web MIDI input: plug-and-play note routing for external MIDI keyboards. */
import { PITCH_MAX, PITCH_MIN } from '../model.ts'

export type MidiNoteEvent =
  | { type: 'noteOn'; pitch: number; velocity: number }
  | { type: 'noteOff'; pitch: number }

function clampPitch(pitch: number): number {
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(pitch)))
}

/** Parse a 3-byte MIDI channel voice message into a clamped note event, or null if unrelated. */
export function parseMidiMessage(data: Uint8Array): MidiNoteEvent | null {
  if (data.length < 2) return null
  const status = (data[0] ?? 0) & 0xf0
  const rawPitch = data[1] ?? 0
  const rawVel = data[2] ?? 0
  if (status === 0x90) {
    const pitch = clampPitch(rawPitch)
    if (rawVel > 0) {
      return { type: 'noteOn', pitch, velocity: Math.max(1, Math.min(127, rawVel)) }
    }
    return { type: 'noteOff', pitch }
  }
  if (status === 0x80) {
    return { type: 'noteOff', pitch: clampPitch(rawPitch) }
  }
  return null
}

/**
 * Subscribe to all connected Web MIDI input ports when supported by the browser.
 * Returns a cleanup function.
 */
export function connectMidiInput(
  onNote: (event: MidiNoteEvent) => void,
  onDevicesChange?: (names: string[]) => void,
): () => void {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
    return () => {}
  }

  let disposed = false
  let access: MIDIAccess | null = null

  const bindInputs = (): void => {
    if (access === null || disposed) return
    const names: string[] = []
    for (const input of access.inputs.values()) {
      if (input.state === 'connected') {
        names.push(input.name?.trim() || 'MIDI 设备')
      }
      input.onmidimessage = (msg) => {
        if (disposed || msg.data === null) return
        const parsed = parseMidiMessage(msg.data)
        if (parsed !== null) onNote(parsed)
      }
    }
    onDevicesChange?.(names)
  }

  void navigator.requestMIDIAccess()
    .then((midi) => {
      if (disposed) return
      access = midi
      bindInputs()
      midi.onstatechange = bindInputs
    })
    .catch(() => {
      // Permission denied or MIDI unavailable: degrade silently.
    })

  return () => {
    disposed = true
    if (access !== null) {
      access.onstatechange = null
      for (const input of access.inputs.values()) {
        input.onmidimessage = null
      }
    }
  }
}
