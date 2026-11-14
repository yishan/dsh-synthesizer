/**
 * Module-level playback. The editor page can unmount without stopping the loop;
 * the sidebar transport keeps the same AudioContext.
 */
import { isTrackAudible, STEP_BEATS, type SynthPatch } from '../model.ts'
import { resolveSynthPatch, type ScheduledNote } from './instruments.ts'
import { createMixGraph, type MixGraph } from './mix.ts'
import { getProjectStore, type ProjectClient } from './project-store.ts'
import {
  advanceScheduler,
  playEvents,
  schedulerSignature,
  type ScheduleEvent,
  type SchedulerState,
} from './scheduler.ts'

const LOOKAHEAD_SECONDS = 0.1
const POLL_MS = 25

interface LiveVoice {
  trackId: string
  note: ScheduledNote
  stopTime: number
}

export class Engine {
  private audio: AudioContext | undefined
  private mix: MixGraph | undefined
  private voices: LiveVoice[] = []
  private previews = new Map<number, { voice: ScheduledNote; startedAtBeat: number | null; trackId: string }>()
  private cursor: SchedulerState | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private pausedBeat = 0
  private reported = new Set<string>()
  private signature = ''
  private projectId = ''
  private unsubscribeStore: (() => void) | undefined

  constructor(private readonly store: ProjectClient) {
    this.projectId = store.getState().project.id
    this.unsubscribeStore = store.subscribe(() => {
      const nextId = this.store.getState().project.id
      if (nextId !== this.projectId) {
        this.projectId = nextId
        if (this.store.getState().playing || this.timer !== undefined || this.voices.length > 0) {
          this.pause(true)
        } else {
          this.pausedBeat = 0
        }
        return
      }
      this.syncLiveVoices()
    })
  }

  togglePlay(): void {
    if (this.store.getState().playing) {
      this.pause(false)
      return
    }
    const audio = this.ensure()
    if (audio === undefined) {
      this.store.setError('Web Audio 不可用')
      return
    }
    void audio.resume()
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.stopVoices(audio.currentTime)
    const project = this.store.getState().project
    this.projectId = project.id
    const loopBeats = project.bars * project.beatsPerBar
    const secondsPerBeat = 60 / project.bpm
    const beat = ((this.pausedBeat % loopBeats) + loopBeats) % loopBeats
    this.syncDelayTempo(project.bpm)
    this.cursor = {
      origin: audio.currentTime - beat * secondsPerBeat,
      scheduledUntilBeat: beat,
      signature: schedulerSignature(project),
    }
    this.signature = this.cursor.signature
    this.applyMute()
    this.store.setPlaying(true)
    this.timer = setInterval(() => { this.tick() }, POLL_MS)
    this.tick()
  }

  stopAndRewind(): void {
    this.pause(true)
  }

  seekBeat(targetBeat: number): void {
    const project = this.store.getState().project
    const loopBeats = project.bars * project.beatsPerBar
    const clamped = ((targetBeat % loopBeats) + loopBeats) % loopBeats
    this.pausedBeat = clamped
    if (this.store.getState().playing && this.audio !== undefined) {
      this.stopVoices(this.audio.currentTime)
      const secondsPerBeat = 60 / project.bpm
      this.cursor = {
        origin: this.audio.currentTime - clamped * secondsPerBeat,
        scheduledUntilBeat: clamped,
        signature: schedulerSignature(project),
      }
      this.tick()
    }
  }

  getCurrentBeat(): number {
    const state = this.store.getState()
    const project = state.project
    const loopBeats = Math.max(1, project.bars * project.beatsPerBar)
    if (!state.playing || this.audio === undefined || this.cursor === undefined) {
      return ((this.pausedBeat % loopBeats) + loopBeats) % loopBeats
    }
    const secondsPerBeat = 60 / project.bpm
    const rawBeat = (this.audio.currentTime - this.cursor.origin) / secondsPerBeat
    if (!project.loop) return Math.max(0, Math.min(loopBeats, rawBeat))
    return ((rawBeat % loopBeats) + loopBeats) % loopBeats
  }

  readWaveform(target: Uint8Array<ArrayBuffer>): boolean {
    const analyser = this.mix?.analyser
    if (analyser === undefined || !this.store.getState().playing) return false
    analyser.getByteTimeDomainData(target)
    return true
  }

  toggleMute(): void {
    this.store.setMuted(!this.store.getState().muted)
    this.applyMute()
  }

  previewDown(instrumentId: string, pitch: number, synth?: SynthPatch, velocity = 105): void {
    const audio = this.ensure()
    if (audio === undefined) return
    void audio.resume()
    this.previewUp(pitch)
    this.applyMute()
    const vel = Math.max(1, Math.min(127, Math.round(velocity)))
    const state = this.store.getState()
    const selectedTrack = state.project.tracks.find((t) => t.id === state.selectedTrackId)
    const effectiveSynth = synth ?? selectedTrack?.synth
    const startedAtBeat = state.playing && state.recordArm ? this.getCurrentBeat() : null
    try {
      const [voice] = playEvents([{
        key: `preview:${pitch}`,
        trackId: 'preview',
        instrumentId,
        pitch,
        velocity: vel,
        // Audition at the track's own level, so a quiet track previews quietly.
        gain: selectedTrack?.gain ?? 0.82,
        ...(selectedTrack?.pan !== undefined ? { pan: selectedTrack.pan } : {}),
        synth: effectiveSynth,
        kit: instrumentId === 'drums' && selectedTrack?.instrumentId === 'drums' ? selectedTrack.kit : undefined,
        time: audio.currentTime,
        stopTime: audio.currentTime + 8,
      }], audio, (event) => this.outputFor(event))
      if (voice !== undefined) {
        this.previews.set(pitch, {
          voice,
          startedAtBeat,
          trackId: selectedTrack?.id ?? '',
        })
      }
      if (startedAtBeat !== null && selectedTrack !== undefined) {
        const loopBeats = state.project.bars * state.project.beatsPerBar
        const quantizedStart = Math.round(startedAtBeat / STEP_BEATS) * STEP_BEATS % loopBeats
        this.store.upsertTrackNote(selectedTrack.id, {
          pitch,
          startBeat: quantizedStart,
          durationBeats: STEP_BEATS,
          velocity: vel,
        })
      }
    } catch {
      this.report(instrumentId)
    }
  }

  previewUp(pitch: number): void {
    const entry = this.previews.get(pitch)
    const audio = this.audio
    if (entry === undefined || audio === undefined) return
    entry.voice.stop(audio.currentTime)
    this.previews.delete(pitch)
    const state = this.store.getState()
    if (entry.startedAtBeat !== null && state.playing && state.recordArm && entry.trackId !== '') {
      const loopBeats = state.project.bars * state.project.beatsPerBar
      const startBeat = Math.round(entry.startedAtBeat / STEP_BEATS) * STEP_BEATS % loopBeats
      const nowBeat = this.getCurrentBeat()
      let heldBeats = nowBeat - entry.startedAtBeat
      if (heldBeats < 0) heldBeats += loopBeats
      const durationBeats = Math.max(
        STEP_BEATS,
        Math.min(loopBeats - startBeat, Math.round(heldBeats / STEP_BEATS) * STEP_BEATS),
      )
      if (durationBeats > STEP_BEATS) {
        this.store.upsertTrackNote(entry.trackId, {
          pitch,
          startBeat,
          durationBeats,
          velocity: 105,
        })
      }
    }
  }

  dispose(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = undefined
    this.pause(true)
    void this.audio?.close()
    this.audio = undefined
    this.mix = undefined
  }

  private pause(restart: boolean): void {
    const project = this.store.getState().project
    if (!restart && this.cursor !== undefined && this.audio !== undefined) {
      const loopBeats = project.bars * project.beatsPerBar
      const beat = (this.audio.currentTime - this.cursor.origin) / (60 / project.bpm)
      this.pausedBeat = ((beat % loopBeats) + loopBeats) % loopBeats
    } else if (restart) {
      this.pausedBeat = 0
    }
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    this.stopVoices(this.audio?.currentTime ?? 0)
    this.cursor = undefined
    this.store.setPlaying(false)
  }

  private tick(): void {
    const audio = this.audio
    const cursor = this.cursor
    if (audio === undefined || cursor === undefined) return
    const { project, playing } = this.store.getState()
    if (!playing) return
    this.syncDelayTempo(project.bpm)
    const loopBeats = project.bars * project.beatsPerBar
    const loopEnd = cursor.origin + loopBeats * (60 / project.bpm)
    if (!project.loop && audio.currentTime >= loopEnd) {
      this.pause(true)
      return
    }
    this.applyMute()
    const step = advanceScheduler(cursor, audio.currentTime, LOOKAHEAD_SECONDS, project, true)
    this.cursor = step.state
    if (step.state.signature !== this.signature) {
      this.signature = step.state.signature
      this.pausedBeat = 0
    }
    for (const event of step.events) {
      try {
        const notes = playEvents([event], audio, (item) => this.outputFor(item), undefined, this.mix)
        for (const note of notes) this.voices.push({ trackId: event.trackId, note, stopTime: event.stopTime })
      } catch {
        this.report(event.instrumentId)
      }
    }
    const now = audio.currentTime
    this.voices = this.voices.filter((voice) => now < voice.stopTime + 0.5)
  }

  private syncLiveVoices(): void {
    const audio = this.audio
    if (audio === undefined) return
    const now = audio.currentTime
    const state = this.store.getState()
    const { project } = state
    for (const track of project.tracks) {
      if (this.mix !== undefined) {
        this.mix.input(track.id, isTrackAudible(track, project.tracks) ? track.gain : 0, track.synth, track.pan, track.instrumentId)
        if (track.id === state.selectedTrackId) {
          this.mix.input('preview', track.gain, track.synth, track.pan, track.instrumentId)
        }
      }
      if (track.instrumentId === 'drums') continue
      const patch = resolveSynthPatch(track.instrumentId, track.synth)
      for (const voice of this.voices) {
        if (voice.trackId === track.id && now < voice.stopTime) {
          voice.note.updatePatch?.(patch, now)
        }
      }
      for (const entry of this.previews.values()) {
        if (entry.trackId === track.id) {
          entry.voice.updatePatch?.(patch, now)
        }
      }
    }
  }

  private ensure(): AudioContext | undefined {
    const Constructor = globalThis.AudioContext
    if (Constructor === undefined) return undefined
    if (this.audio === undefined) {
      this.audio = new Constructor({ latencyHint: 'interactive' })
      this.mix = createMixGraph(this.audio, this.audio.destination)
      this.applyMute()
    }
    return this.audio
  }

  private syncDelayTempo(bpm: number): void {
    this.mix?.setTempo(bpm)
  }

  private applyMute(): void {
    this.mix?.setMuted(this.store.getState().muted)
  }

  private outputFor(event: ScheduleEvent): GainNode {
    if (this.mix === undefined) throw new Error('audio_unavailable')
    return this.mix.input(event.trackId, event.gain, event.synth, event.pan, event.instrumentId)
  }

  private stopVoices(when: number): void {
    for (const voice of this.voices) voice.note.stop(when)
    this.voices = []
    for (const entry of this.previews.values()) entry.voice.stop(when)
    this.previews.clear()
  }

  private report(id: string): void {
    if (this.reported.has(id)) return
    this.reported.add(id)
    this.store.setError(`未知音色 ${id}`)
  }
}

let singleton: Engine | undefined

export function getEngine(): Engine {
  if (singleton === undefined) singleton = new Engine(getProjectStore())
  return singleton
}
