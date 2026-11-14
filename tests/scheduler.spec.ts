import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultProject, type Note, type Project, type Track } from '../src/schema.ts'
import { registerInstrument, unregisterInstrument, type Instrument } from '../src/client/instruments.ts'
import { advanceScheduler, initialSchedulerState, playEvents, swingOffset, type ScheduleEvent } from '../src/client/scheduler.ts'

const note: Note = { pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 100 }

function track(id: string, instrumentId: string, notes: Note[], mute = false): Track {
  return { id, name: id, instrumentId, mute, gain: 0.8, notes }
}

function withTracks(id: string, tracks: Track[], bars = 4): Project {
  return { ...createDefaultProject(id), bars, tracks }
}

describe('scheduler', () => {
  afterEach(() => { unregisterInstrument('fake-sample') })

  it('emits a note once, skips a muted track, and wraps the loop', () => {
    const project = withTracks('dup', [track('lead', 'lead', [note])])
    const first = advanceScheduler(initialSchedulerState(0, project), 0, 0.1, project, true)
    expect(first.events.map((event) => event.pitch)).toEqual([60])
    const second = advanceScheduler(first.state, 0, 0.1, project, true)
    expect(second.events).toEqual([])
    const paused = advanceScheduler(first.state, 1, 0.1, project, false)
    expect(paused.events).toEqual([])
    expect(paused.state).toBe(first.state)

    const muted = withTracks('mute', [
      track('quiet', 'lead', [note], true),
      track('bass', 'bass', [{ ...note, pitch: 40 }]),
    ])
    const mix = advanceScheduler(initialSchedulerState(0, muted), 0, 0.1, muted, true)
    expect(mix.events.map((event) => event.instrumentId)).toEqual(['bass'])

    const wrapped = withTracks('wrap', [track('lead', 'lead', [note])], 1)
    const cursor = { ...initialSchedulerState(10, wrapped), scheduledUntilBeat: 3.5 }
    const looped = advanceScheduler(cursor, 11.75, 0.5, wrapped, true)
    expect(looped.events).toHaveLength(1)
    expect(looped.events[0]?.time).toBeCloseTo(12)
    expect(looped.events[0]?.key.startsWith('1:')).toBe(true)
  })

  it('plays a sample instrument through the same scheduler and rejects an unknown id', () => {
    const calls: number[] = []
    const sample: Instrument = {
      id: 'fake-sample',
      kind: 'sample',
      noteOn(_ctx, _out, time) {
        calls.push(time)
        return { stop() {} }
      },
    }
    registerInstrument(sample)
    const project = withTracks('sample', [track('pad', 'fake-sample', [note])])
    const step = advanceScheduler(initialSchedulerState(0, project), 0, 0.1, project, true)
    playEvents(step.events, {} as AudioContext, () => ({}) as AudioNode)
    expect(calls).toEqual([0])
    const again = advanceScheduler(step.state, 0, 0.1, project, true)
    playEvents(again.events, {} as AudioContext, () => ({}) as AudioNode)
    expect(calls).toEqual([0])
    const missing: ScheduleEvent = {
      key: 'missing',
      trackId: 'x',
      instrumentId: 'missing',
      pitch: 60,
      velocity: 100,
      gain: 1,
      time: 0,
      stopTime: 0.2,
    }
    expect(() => playEvents([missing], {} as AudioContext, () => ({}) as AudioNode)).toThrow(/unknown_instrument:missing/)
  })

  it('swings every second sixteenth late without moving where it ends', () => {
    expect(swingOffset(0, 0.5)).toBe(0)
    expect(swingOffset(0.25, 0.5)).toBe(0.125)
    expect(swingOffset(0.5, 0.5)).toBe(0)
    expect(swingOffset(0.75, undefined)).toBe(0)

    const notes: Note[] = [0, 0.25, 0.5, 0.75].map((startBeat) => ({ ...note, startBeat }))
    const straight = withTracks('swing', [track('lead', 'lead', notes)], 1)
    const swung = { ...straight, swing: 0.4 }
    // 120 BPM: a beat is half a second.
    const times = (project: Project): Array<[number, number]> =>
      advanceScheduler(initialSchedulerState(0, project), 0, 0.5, project, true).events
        .map((event) => [Number(event.time.toFixed(4)), Number(event.stopTime.toFixed(4))])
    expect(times(straight)).toEqual([[0, 0.125], [0.125, 0.25], [0.25, 0.375], [0.375, 0.5]])
    expect(times(swung)).toEqual([[0, 0.125], [0.175, 0.25], [0.25, 0.375], [0.425, 0.5]])
  })

  it('silences non-soloed tracks whenever any track is soloed', () => {
    const project = withTracks('solo', [
      { ...track('a', 'lead', [note]), solo: true, mute: true },
      track('b', 'bass', [{ ...note, pitch: 48 }]),
    ], 1)
    const step = advanceScheduler(initialSchedulerState(0, project), 0, 0.5, project, true)
    expect(step.events.map((e) => e.trackId)).toEqual(['a'])
  })

  it('forwards track stereo pan onto emitted schedule events', () => {
    const project = withTracks('pan', [
      { ...track('left', 'lead', [note]), pan: -0.45 },
      track('center', 'bass', [{ ...note, pitch: 48 }]),
    ], 1)
    const step = advanceScheduler(initialSchedulerState(0, project), 0, 0.5, project, true)
    expect(step.events.map((e) => [e.trackId, e.pan])).toEqual([
      ['left', -0.45],
      ['center', undefined],
    ])
  })

  it('emits legato glideFromPitch for touching acid/bass/lead notes and triggers sidechain on kick', () => {
    const project = withTracks('glide', [
      track('acid', 'acid', [
        { pitch: 48, startBeat: 0, durationBeats: 0.5, velocity: 100 },
        { pitch: 55, startBeat: 0.5, durationBeats: 0.5, velocity: 105 },
        { pitch: 57, startBeat: 1.5, durationBeats: 0.25, velocity: 100 },
      ]),
      track('pad', 'pad', [
        { pitch: 60, startBeat: 0, durationBeats: 0.5, velocity: 90 },
        { pitch: 64, startBeat: 0.5, durationBeats: 0.5, velocity: 90 },
      ]),
      track('drums', 'drums', [
        { pitch: 36, startBeat: 0, durationBeats: 0.25, velocity: 120 },
      ]),
    ], 1)
    // Lookahead split across beat 0.4 so note 2 (startBeat 0.5) checks note 1 from prior window
    const s1 = advanceScheduler(initialSchedulerState(0, project), 0, 0.15, project, true)
    const s2 = advanceScheduler(s1.state, 0.15, 0.85, project, true)
    const allEvents = [...s1.events, ...s2.events]
    const acidGlides = allEvents
      .filter((e) => e.trackId === 'acid')
      .map((e) => [e.pitch, e.glideFromPitch])
    const padGlides = allEvents
      .filter((e) => e.trackId === 'pad')
      .map((e) => [e.pitch, e.glideFromPitch])

    expect(acidGlides).toEqual([
      [48, undefined],
      [55, 48],
      [57, undefined],
    ])
    expect(padGlides).toEqual([
      [60, undefined],
      [64, undefined],
    ])

    const seenGlides: Array<number | undefined> = []
    const sidechains: Array<{ time: number; velocity?: number }> = []
    const fakeInstrument: Instrument = {
      id: 'fake-sample',
      kind: 'sample',
      noteOn(_ctx, _out, _time, _pitch, _vel, _patch, _kit, glideFromPitch) {
        seenGlides.push(glideFromPitch)
        return { stop() {} }
      },
    }
    registerInstrument(fakeInstrument)
    playEvents(
      allEvents.filter((e) => e.trackId === 'acid' || e.trackId === 'drums'),
      {} as AudioContext,
      () => ({}) as AudioNode,
      (id) => (id === 'acid' ? fakeInstrument : {
        id,
        kind: 'synth',
        noteOn: () => ({ stop() {} }),
      }),
      {
        triggerSidechain(time, velocity) {
          sidechains.push({ time, velocity })
        },
      },
    )
    expect(seenGlides).toEqual([undefined, 48, undefined])
    expect(sidechains).toEqual([{ time: 0, velocity: 120 }])
  })
})
