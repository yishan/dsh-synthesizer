/** Lookahead scheduler. Timing uses the audio clock, not the timer that polls it. */
import { getInstrument, type Instrument, type ScheduledNote } from './instruments.ts'
import type { MixGraph } from './mix.ts'
import { DRUM_KICK, isTrackAudible, STEP_BEATS, type Note, type Project, type SynthPatch } from '../model.ts'

export interface SchedulerState {
  origin: number
  scheduledUntilBeat: number
  signature: string
}

export interface ScheduleEvent {
  key: string
  trackId: string
  instrumentId: string
  pitch: number
  velocity: number
  gain: number
  pan?: number
  synth?: SynthPatch
  kit?: string
  time: number
  stopTime: number
  glideFromPitch?: number
}

const LEGATO_GLIDE_INSTRUMENTS = new Set<string>(['acid', 'bass', 'lead'])

export interface ScheduleStep {
  state: SchedulerState
  events: ScheduleEvent[]
  finished: boolean
}

export function schedulerSignature(project: Pick<Project, 'id' | 'bpm' | 'bars' | 'loop'>): string {
  return `${project.id}:${project.bpm}:${project.bars}:${project.loop ? 1 : 0}`
}

export function initialSchedulerState(now: number, project: Project): SchedulerState {
  return { origin: now, scheduledUntilBeat: 0, signature: schedulerSignature(project) }
}

/**
 * How late, in beats, a note starting at `startBeat` plays under `swing`.
 * Only the second and fourth sixteenth of each beat move.
 */
export function swingOffset(startBeat: number, swing: number | undefined): number {
  if (swing === undefined || swing <= 0) return 0
  const step = Math.round(startBeat / STEP_BEATS)
  return step % 2 === 1 ? swing * STEP_BEATS : 0
}

function collect(
  project: Project,
  origin: number,
  secondsPerBeat: number,
  loopBeats: number,
  fromBeat: number,
  toBeat: number,
): ScheduleEvent[] {
  const events: ScheduleEvent[] = []
  const firstLoop = Math.floor(fromBeat / loopBeats)
  const lastLoop = Math.floor(Math.max(fromBeat, toBeat - 1e-9) / loopBeats)
  for (let loop = firstLoop; loop <= lastLoop; loop += 1) {
    if (!project.loop && loop > 0) break
    const loopStart = loop * loopBeats
    const windowStart = Math.max(fromBeat, loopStart) - loopStart
    const windowEnd = Math.min(toBeat, loopStart + loopBeats) - loopStart
    if (windowEnd <= windowStart) continue
    for (const track of project.tracks) {
      if (!isTrackAudible(track, project.tracks)) continue
      const supportsGlide = LEGATO_GLIDE_INSTRUMENTS.has(track.instrumentId)
      const notes = supportsGlide
        ? [...track.notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch)
        : track.notes
      let prevNote: Note | undefined
      for (const note of notes) {
        const glideFromPitch = supportsGlide
          && prevNote !== undefined
          && prevNote.pitch !== note.pitch
          && prevNote.startBeat < note.startBeat - 1e-6
          && prevNote.startBeat + prevNote.durationBeats >= note.startBeat - 1e-6
          ? prevNote.pitch
          : undefined
        prevNote = note
        if (note.startBeat < windowStart || note.startBeat >= windowEnd) continue
        const beat = loopStart + note.startBeat
        // Swing delays the start only; the note still ends where it was drawn to end.
        const time = origin + (beat + swingOffset(note.startBeat, project.swing)) * secondsPerBeat
        events.push({
          key: `${loop}:${track.id}:${note.pitch}:${note.startBeat}`,
          trackId: track.id,
          instrumentId: track.instrumentId,
          pitch: note.pitch,
          velocity: note.velocity,
          gain: track.gain,
          ...(track.pan !== undefined ? { pan: track.pan } : {}),
          synth: track.synth,
          kit: track.kit,
          time,
          stopTime: origin + (beat + note.durationBeats) * secondsPerBeat,
          ...(glideFromPitch !== undefined ? { glideFromPitch } : {}),
        })
      }
    }
  }
  return events
}

/**
 * Schedule notes in the next lookahead window.
 * A muted track contributes nothing. The cursor only moves forward, so the
 * same note is not emitted twice unless the clock or the project signature resets.
 */
export function advanceScheduler(
  state: SchedulerState,
  now: number,
  lookAhead: number,
  project: Project,
  playing: boolean,
): ScheduleStep {
  if (!playing) return { state, events: [], finished: false }
  const signature = schedulerSignature(project)
  const secondsPerBeat = 60 / project.bpm
  const loopBeats = project.bars * project.beatsPerBar
  if (!(loopBeats > 0) || !Number.isFinite(secondsPerBeat) || !(secondsPerBeat > 0)) {
    return { state, events: [], finished: true }
  }
  let origin = state.origin
  let fromBeat = state.scheduledUntilBeat
  if (state.signature !== signature) {
    origin = now
    fromBeat = 0
  }
  if (!project.loop && fromBeat >= loopBeats) {
    return { state: { origin, scheduledUntilBeat: loopBeats, signature }, events: [], finished: true }
  }
  let toBeat = (now + lookAhead - origin) / secondsPerBeat
  if (!project.loop) toBeat = Math.min(toBeat, loopBeats)
  const maxSpan = (lookAhead * 4) / secondsPerBeat
  if (toBeat - fromBeat > maxSpan) fromBeat = toBeat - maxSpan
  const next: SchedulerState = { origin, scheduledUntilBeat: Math.max(fromBeat, toBeat), signature }
  if (!(toBeat > fromBeat)) {
    return { state: next, events: [], finished: !project.loop && next.scheduledUntilBeat >= loopBeats }
  }
  return {
    state: next,
    events: collect(project, origin, secondsPerBeat, loopBeats, fromBeat, toBeat),
    finished: !project.loop && next.scheduledUntilBeat >= loopBeats - 1e-9,
  }
}

/** Start each event on the instrument registry and schedule its release. */
export function playEvents(
  events: readonly ScheduleEvent[],
  ctx: AudioContext,
  destinationFor: (event: ScheduleEvent) => AudioNode,
  resolve: (id: string) => Instrument = getInstrument,
  mix?: Pick<MixGraph, 'triggerSidechain'>,
): ScheduledNote[] {
  const voices: ScheduledNote[] = []
  for (const event of events) {
    const instrument = resolve(event.instrumentId)
    const voice = instrument.noteOn(
      ctx,
      destinationFor(event),
      event.time,
      event.pitch,
      event.velocity,
      event.synth,
      event.kit,
      event.glideFromPitch,
    )
    voice.stop(event.stopTime)
    voices.push(voice)
    if (event.instrumentId === 'drums' && event.pitch === DRUM_KICK) {
      mix?.triggerSidechain?.(event.time, event.velocity)
    }
  }
  return voices
}
