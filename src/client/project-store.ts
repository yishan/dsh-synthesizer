/** In-memory project shared by the editor page and the sidebar transport. */
import {
  clipToBars,
  createDefaultProject,
  createProjectId,
  MAX_TRACKS,
  removeNoteAt,
  sanitizeProject,
  toggleCell,
  upsertNote,
  type Note,
  type Project,
  type SynthPatch,
  type Track,
} from '../model.ts'
import { deleteProject, listProjects, readProject, saveProject, type ProjectSummary } from './api.ts'
import { DEFAULT_SYNTH_PATCHES, resolveSynthPatch } from './instruments.ts'
import { createStarterProject, generateRandomGrooveProject, SONG_PRESETS, type SynthPresetItem } from './presets.ts'

export interface SessionState {
  ready: boolean
  /** The first load failed. The editor offers a retry instead of an unsaved draft. */
  loadFailed: boolean
  project: Project
  projects: ProjectSummary[]
  playing: boolean
  muted: boolean
  recordArm: boolean
  selectedTrackId: string
  scaleRoot: number
  scaleId: string
  octaveOffset: number
  showGhostNotes: boolean
  showOnboarding: boolean
  saving: boolean
  canUndo: boolean
  error: string | null
}

/** Same-control edits closer together than this share one undo step, so a slider drag is one step. */
const UNDO_COALESCE_MS = 400
const UNDO_LIMIT = 50

const INSTRUMENT_CYCLE = ['lead', 'bass', 'pad', 'keys', 'acid', 'pluck', 'chip', 'bell', 'drums'] as const

function summaryOf(project: Project, previous: readonly ProjectSummary[]): ProjectSummary[] {
  const next = previous.filter((item) => item.id !== project.id)
  next.unshift({ id: project.id, name: project.name, updatedAt: new Date().toISOString() })
  return next
}

export class ProjectClient {
  private state: SessionState
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private revision = 0
  private hydrated = false
  private history: Project[] = []
  private lastCommitAt = 0
  private lastCommitKey: string | undefined
  /** True while the open project is an untouched preset or new project, so replacing it loses nothing. */
  private pristine = false

  constructor() {
    const project = createStarterProject('draft')
    this.state = {
      ready: false,
      loadFailed: false,
      project,
      projects: [],
      playing: false,
      muted: false,
      recordArm: false,
      selectedTrackId: project.tracks[0]?.id ?? '',
      scaleRoot: 9,
      scaleId: 'minor',
      octaveOffset: 0,
      showGhostNotes: true,
      showOnboarding: false,
      saving: false,
      canUndo: false,
      error: null,
    }
  }

  getState = (): SessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Load the most recent project. A failed load can be retried by calling this again. */
  async hydrate(): Promise<void> {
    if (this.hydrated) return
    this.hydrated = true
    if (this.state.loadFailed) {
      this.state = { ...this.state, loadFailed: false, error: null }
      this.emit()
    }
    try {
      const projects = await listProjects()
      if (projects.length === 0) {
        const created = await saveProject(createStarterProject())
        this.replaceProject(created, summaryOf(created, []), false, true)
        return
      }
      const current = await readProject(projects[0]?.id ?? '')
      this.replaceProject(current, projects, false)
    } catch (error) {
      this.hydrated = false
      this.state = {
        ...this.state,
        loadFailed: true,
        error: error instanceof Error ? error.message : 'load_failed',
      }
      this.emit()
    }
  }

  toggleNote(trackId: string, pitch: number, startBeat: number): void {
    this.mapTrack(trackId, (track) => ({ ...track, notes: toggleCell(track.notes, pitch, startBeat) }))
  }

  upsertTrackNote(trackId: string, note: Note): void {
    const maxBeats = this.state.project.bars * this.state.project.beatsPerBar
    this.mapTrack(trackId, (track) => ({
      ...track,
      notes: upsertNote(track.notes, note, maxBeats),
    }))
  }

  removeTrackNote(trackId: string, pitch: number, beat: number): void {
    this.mapTrack(trackId, (track) => ({
      ...track,
      notes: removeNoteAt(track.notes, pitch, beat),
    }), `erase:${trackId}`)
  }

  setTrackNotes(trackId: string, notes: readonly Note[]): void {
    const maxBeats = this.state.project.bars * this.state.project.beatsPerBar
    const clipped = notes.filter((n) => n.startBeat < maxBeats && n.startBeat + n.durationBeats <= maxBeats + 1e-6)
    this.mapTrack(trackId, (track) => ({ ...track, notes: [...clipped] }))
  }

  updateTrack(trackId: string, patch: Partial<Pick<Track, 'name' | 'instrumentId' | 'mute' | 'gain' | 'synth'>>): void {
    this.mapTrack(trackId, (track) => {
      const nextInstrument = patch.instrumentId ?? track.instrumentId
      let nextSynth = patch.synth !== undefined ? patch.synth : track.synth
      if (patch.instrumentId !== undefined && patch.instrumentId !== track.instrumentId && patch.synth === undefined) {
        nextSynth = patch.instrumentId === 'drums' ? undefined : DEFAULT_SYNTH_PATCHES[nextInstrument]
      }
      const updated: Track = {
        ...track,
        ...patch,
      }
      if (nextSynth !== undefined && nextInstrument !== 'drums') {
        updated.synth = nextSynth
      } else {
        delete updated.synth
      }
      return updated
    }, `track:${trackId}:${Object.keys(patch).join(',')}`)
  }

  updateTrackSynth(trackId: string, synthPatch: Partial<SynthPatch>): void {
    this.mapTrack(trackId, (track) => {
      if (track.instrumentId === 'drums') return track
      const current = resolveSynthPatch(track.instrumentId, track.synth)
      return {
        ...track,
        synth: { ...current, ...synthPatch },
      }
    }, `synth:${trackId}`)
  }

  applySynthPreset(trackId: string, preset: SynthPresetItem): void {
    this.mapTrack(trackId, (track) => ({
      ...track,
      instrumentId: preset.instrumentId,
      synth: { ...preset.patch },
    }))
  }

  selectTrack(trackId: string): void {
    if (!this.state.project.tracks.some((track) => track.id === trackId)) return
    this.state = { ...this.state, selectedTrackId: trackId }
    this.emit()
  }

  setScale(scaleRoot: number, scaleId: string): void {
    this.state = { ...this.state, scaleRoot, scaleId }
    this.emit()
  }

  setOctaveOffset(octaveOffset: number): void {
    const clamped = Math.max(-2, Math.min(2, octaveOffset))
    this.state = { ...this.state, octaveOffset: clamped }
    this.emit()
  }

  setRecordArm(recordArm: boolean): void {
    this.state = { ...this.state, recordArm }
    this.emit()
  }

  setShowGhostNotes(showGhostNotes: boolean): void {
    this.state = { ...this.state, showGhostNotes }
    this.emit()
  }

  setShowOnboarding(showOnboarding: boolean): void {
    this.state = { ...this.state, showOnboarding }
    this.emit()
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return
    const clamped = Math.max(40, Math.min(240, Math.round(bpm)))
    this.commit({ ...this.state.project, bpm: clamped })
  }

  setBars(bars: number): void {
    if (!Number.isFinite(bars)) return
    const clamped = Math.max(1, Math.min(32, Math.round(bars)))
    this.commit(clipToBars({ ...this.state.project, bars: clamped }))
  }

  setLoop(loop: boolean): void {
    this.commit({ ...this.state.project, loop })
  }

  rename(name: string): void {
    const trimmed = name.slice(0, 80)
    if (trimmed.length === 0) return
    this.commit({ ...this.state.project, name: trimmed }, 'rename')
  }

  addTrack(): void {
    const project = this.state.project
    if (project.tracks.length >= MAX_TRACKS) return
    const instrumentId = INSTRUMENT_CYCLE[project.tracks.length % INSTRUMENT_CYCLE.length] ?? 'lead'
    const track: Track = {
      id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name: `音轨 ${project.tracks.length + 1}`,
      instrumentId,
      mute: false,
      gain: 0.72,
      ...(instrumentId !== 'drums' && DEFAULT_SYNTH_PATCHES[instrumentId] !== undefined
        ? { synth: { ...DEFAULT_SYNTH_PATCHES[instrumentId]! } }
        : {}),
      notes: [],
    }
    this.commit({ ...project, tracks: [...project.tracks, track] })
    this.selectTrack(track.id)
  }

  removeTrack(trackId: string): void {
    const project = this.state.project
    if (project.tracks.length <= 1) return
    const tracks = project.tracks.filter((track) => track.id !== trackId)
    this.commit({ ...project, tracks })
    if (this.state.selectedTrackId === trackId) this.selectTrack(tracks[0]?.id ?? '')
  }

  async loadSongPreset(presetId: string): Promise<void> {
    const preset = SONG_PRESETS.find((item) => item.id === presetId)
    if (preset === undefined) return
    await this.openPreset((id) => preset.build(id))
  }

  async loadRandomGroove(): Promise<void> {
    await this.openPreset((id) => generateRandomGrooveProject(id))
  }

  /** Step back one edit. Project switches clear the history. */
  undo(): void {
    const previous = this.history.pop()
    if (previous === undefined) return
    this.revision += 1
    this.lastCommitAt = 0
    this.lastCommitKey = undefined
    this.state = {
      ...this.state,
      project: previous,
      selectedTrackId: previous.tracks.some((track) => track.id === this.state.selectedTrackId)
        ? this.state.selectedTrackId
        : previous.tracks[0]?.id ?? '',
      canUndo: this.history.length > 0,
      error: null,
    }
    this.emit()
    this.scheduleSave()
  }

  async newProject(blank = false): Promise<void> {
    await this.flush()
    const base = blank ? createDefaultProject(createProjectId()) : createStarterProject(createProjectId())
    const created = await saveProject(base)
    this.replaceProject(created, summaryOf(created, this.state.projects), false, true)
  }

  async selectProject(id: string): Promise<void> {
    await this.flush()
    const project = await readProject(id)
    this.replaceProject(project, this.state.projects, false)
  }

  async removeProject(): Promise<void> {
    const id = this.state.project.id
    await this.flush()
    await deleteProject(id)
    const projects = this.state.projects.filter((item) => item.id !== id)
    if (projects.length === 0) {
      const created = await saveProject(createStarterProject(createProjectId()))
      this.replaceProject(created, summaryOf(created, []), false, true)
      return
    }
    const next = await readProject(projects[0]?.id ?? '')
    this.replaceProject(next, projects, false)
  }

  setPlaying(playing: boolean): void {
    this.state = { ...this.state, playing }
    this.emit()
  }

  setMuted(muted: boolean): void {
    this.state = { ...this.state, muted }
    this.emit()
  }

  setError(error: string | null): void {
    this.state = { ...this.state, error }
    this.emit()
  }

  async flush(): Promise<void> {
    if (!this.state.ready) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    const revision = this.revision
    const project = this.state.project
    this.state = { ...this.state, saving: true }
    this.emit()
    try {
      const saved = await saveProject(project)
      if (this.revision !== revision) {
        this.scheduleSave()
        return
      }
      this.state = {
        ...this.state,
        project: saved,
        projects: summaryOf(saved, this.state.projects),
        saving: false,
        error: null,
      }
      this.emit()
    } catch (error) {
      this.state = { ...this.state, saving: false, error: error instanceof Error ? error.message : 'save_failed' }
      this.emit()
    }
  }

  private mapTrack(trackId: string, map: (track: Track) => Track, coalesceKey?: string): void {
    this.commit({
      ...this.state.project,
      tracks: this.state.project.tracks.map((track) => track.id === trackId ? map(track) : track),
    }, coalesceKey)
  }

  /**
   * Open a preset without destroying work: an untouched project is replaced in
   * place, an edited one is saved and the preset opens as a new project.
   */
  private async openPreset(build: (id: string) => Project): Promise<void> {
    if (this.pristine) {
      const next = sanitizeProject(build(this.state.project.id))
      this.revision += 1
      this.history = []
      this.state = {
        ...this.state,
        project: next,
        projects: summaryOf(next, this.state.projects),
        selectedTrackId: next.tracks.some((track) => track.id === this.state.selectedTrackId)
          ? this.state.selectedTrackId
          : next.tracks[0]?.id ?? '',
        canUndo: false,
        error: null,
      }
      this.emit()
      this.scheduleSave()
      return
    }
    await this.flush()
    const created = await saveProject(build(createProjectId()))
    this.replaceProject(created, summaryOf(created, this.state.projects), false, true)
  }

  /** `coalesceKey` names a continuous control; repeated commits from it merge into one undo step. */
  private commit(rawProject: Project, coalesceKey?: string): void {
    // sanitizeProject clamps every field into the schema's range; the Host validates again on save.
    const sanitized = sanitizeProject(rawProject)
    const now = Date.now()
    const continues = coalesceKey !== undefined
      && coalesceKey === this.lastCommitKey
      && now - this.lastCommitAt <= UNDO_COALESCE_MS
      && this.history.length > 0
    if (!continues) {
      this.history.push(this.state.project)
      if (this.history.length > UNDO_LIMIT) this.history.shift()
    }
    this.lastCommitAt = now
    this.lastCommitKey = coalesceKey
    this.pristine = false
    this.revision += 1
    this.state = { ...this.state, project: sanitized, canUndo: true, error: null }
    this.emit()
    this.scheduleSave()
  }

  private replaceProject(project: Project, projects: ProjectSummary[], save: boolean, pristine = false): void {
    const sanitized = sanitizeProject(project)
    this.revision += 1
    this.history = []
    this.lastCommitAt = 0
    this.pristine = pristine
    this.state = {
      ...this.state,
      ready: true,
      project: sanitized,
      projects: projects.some((item) => item.id === sanitized.id) ? projects : summaryOf(sanitized, projects),
      selectedTrackId: sanitized.tracks.some((track) => track.id === this.state.selectedTrackId)
        ? this.state.selectedTrackId
        : sanitized.tracks[0]?.id ?? '',
      canUndo: false,
      error: null,
    }
    this.emit()
    if (save) this.scheduleSave()
  }

  private scheduleSave(): void {
    // Until a project has loaded, the state holds a placeholder that must not reach the profile.
    if (!this.state.ready) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, 500)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

let singleton: ProjectClient | undefined

export function getProjectStore(): ProjectClient {
  if (singleton === undefined) singleton = new ProjectClient()
  return singleton
}
