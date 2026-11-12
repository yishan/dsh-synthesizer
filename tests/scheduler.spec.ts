import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultProject, type Note, type Project, type Track } from '../src/schema.ts'
import { registerInstrument, unregisterInstrument, type Instrument } from '../src/client/instruments.ts'
import { advanceScheduler, initialSchedulerState, playEvents, type ScheduleEvent } from '../src/client/scheduler.ts'

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
})
