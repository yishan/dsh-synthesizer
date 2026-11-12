/** In-memory project shared by the editor page and the sidebar transport. */
import {
  clipToBars,
  coerceProject,
  createDefaultProject,
  createProjectId,
  MAX_TRACKS,
  removeNoteAt,
  sanitizeProject,
  toggleCell,
  uniqueName,
  upsertNote,
  type Note,
  type Project,
  type SynthPatch,
  type Track,
} from '../model.ts'
import { deleteProject, listProjects, readProject, saveProject, type ProjectSummary } from './api.ts'
import {
  clearViewState,
  getLastProjectId,
  loadViewState,
  saveViewState,
  setLastProjectId,
} from './local-state.ts'
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
  /** The last save did not reach the Host; the edits exist only in this page. */
  saveFailed: boolean
  /** A project deleted moments ago that `restoreDeleted` can bring back. */
  lastDeleted: { id: string; name: string } | null
  canUndo: boolean
  error: string | null
}

/** Same-control edits closer together than this share one undo step, so a slider drag is one step. */
const UNDO_COALESCE_MS = 400
const UNDO_LIMIT = 50

const DEFAULT_SCALE_ROOT = 9
const DEFAULT_SCALE_ID = 'minor'

const INSTRUMENT_CYCLE = ['lead', 'bass', 'pad', 'keys', 'acid', 'pluck', 'chip', 'bell', 'drums'] as const

function summaryOf(project: Project, previous: readonly ProjectSummary[]): ProjectSummary[] {
  const next = previous.filter((item) => item.id !== project.id)
  next.unshift({
    id: project.id,
    name: project.name,
    updatedAt: new Date().toISOString(),
    bpm: project.bpm,
    bars: project.bars,
    tracks: project.tracks.length,
    notes: project.tracks.reduce((total, track) => total + track.notes.length, 0),
  })
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
  private deleted: { project: Project; wasOpen: boolean } | undefined

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
      scaleRoot: DEFAULT_SCALE_ROOT,
      scaleId: DEFAULT_SCALE_ID,
      octaveOffset: 0,
      showGhostNotes: true,
      showOnboarding: false,
      saving: false,
      saveFailed: false,
      lastDeleted: null,
      canUndo: false,
      error: null,
    }
  }

  getState = (): SessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Load the project that was open last, or the most recently modified one.
   * A failed load can be retried by calling this again.
   */
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
      const last = getLastProjectId()
      const target = projects.find((item) => item.id === last) ?? projects[0]
      const current = await readProject(target?.id ?? '')
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
    this.rememberView()
  }

  /** The scale belongs to the project, so it is saved with it and can be undone. */
  setScale(scaleRoot: number, scaleId: string): void {
    this.commit({ ...this.state.project, scaleRoot, scaleId })
  }

  setOctaveOffset(octaveOffset: number): void {
    const clamped = Math.max(-2, Math.min(2, octaveOffset))
    this.state = { ...this.state, octaveOffset: clamped }
    this.emit()
    this.rememberView()
  }

  setRecordArm(recordArm: boolean): void {
    this.state = { ...this.state, recordArm }
    this.emit()
  }

  setShowGhostNotes(showGhostNotes: boolean): void {
    this.state = { ...this.state, showGhostNotes }
    this.emit()
    this.rememberView()
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
    const created = await saveProject({ ...base, name: uniqueName(base.name, this.names()) })
    this.replaceProject(created, summaryOf(created, this.state.projects), false, true)
  }

  async selectProject(id: string): Promise<void> {
    if (id === this.state.project.id) return
    await this.flush()
    const project = await readProject(id)
    this.replaceProject(project, this.state.projects, false)
  }

  /** Copy a project under a new id and name, and open the copy. */
  async duplicateProject(id: string): Promise<void> {
    const source = await this.exportProject(id)
    const copy = await saveProject({
      ...source,
      id: createProjectId(),
      name: uniqueName(`${source.name} 副本`, this.names()),
    })
    this.replaceProject(copy, summaryOf(copy, this.state.projects), false)
  }

  async renameProject(id: string, name: string): Promise<void> {
    const trimmed = name.trim().slice(0, 80)
    if (trimmed === '') return
    if (id === this.state.project.id) {
      this.rename(trimmed)
      return
    }
    const saved = await saveProject({ ...(await readProject(id)), name: trimmed })
    const position = this.state.projects.findIndex((item) => item.id === id)
    const projects = summaryOf(saved, this.state.projects)
    // Renaming is not a content edit; keep the row where the user is looking at it.
    const [moved] = projects.splice(0, 1)
    if (moved !== undefined) projects.splice(Math.max(0, position), 0, moved)
    this.state = { ...this.state, projects }
    this.emit()
  }

  /** The full document of a project, with any pending edit saved first. */
  async exportProject(id: string): Promise<Project> {
    if (id !== this.state.project.id) return readProject(id)
    await this.flush()
    return this.state.project
  }

  /** Add a project from an exported file. It always gets a new id, so nothing is overwritten. */
  async importProject(raw: unknown): Promise<void> {
    const project = coerceProject(raw)
    if (project === null) throw new Error('invalid_import')
    await this.flush()
    const created = await saveProject({ ...project, name: uniqueName(project.name, this.names()) })
    this.replaceProject(created, summaryOf(created, this.state.projects), false)
  }

  /** Delete a project. Until `dismissDeleted`, `restoreDeleted` can bring it back. */
  async removeProject(id: string = this.state.project.id): Promise<void> {
    const wasOpen = id === this.state.project.id
    const doomed = await this.exportProject(id)
    await deleteProject(id)
    clearViewState(id)
    this.deleted = { project: doomed, wasOpen }
    const projects = this.state.projects.filter((item) => item.id !== id)
    this.state = { ...this.state, projects, lastDeleted: { id, name: doomed.name } }
    if (!wasOpen) {
      this.emit()
      return
    }
    if (projects.length === 0) {
      const created = await saveProject(createStarterProject(createProjectId()))
      this.replaceProject(created, summaryOf(created, []), false, true)
      return
    }
    const next = await readProject(projects[0]?.id ?? '')
    this.replaceProject(next, projects, false)
  }

  async restoreDeleted(): Promise<void> {
    const entry = this.deleted
    if (entry === undefined) return
    await this.flush()
    const saved = await saveProject(entry.project)
    this.deleted = undefined
    this.state = { ...this.state, lastDeleted: null }
    if (entry.wasOpen) {
      this.replaceProject(saved, summaryOf(saved, this.state.projects), false)
      return
    }
    // It was not the open project when deleted, so put it back without switching.
    this.state = { ...this.state, projects: summaryOf(saved, this.state.projects) }
    this.emit()
  }

  dismissDeleted(): void {
    this.deleted = undefined
    if (this.state.lastDeleted === null) return
    this.state = { ...this.state, lastDeleted: null }
    this.emit()
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

  /** Save now instead of waiting for the debounce. `keepalive` is for a page that is going away. */
  async flush(options: { keepalive?: boolean } = {}): Promise<void> {
    if (!this.state.ready) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    const revision = this.revision
    const project = this.state.project
    this.state = { ...this.state, saving: true }
    this.emit()
    try {
      const saved = await saveProject(project, options)
      if (this.revision !== revision) {
        this.state = { ...this.state, saveFailed: false }
        this.scheduleSave()
        return
      }
      this.state = {
        ...this.state,
        project: saved,
        projects: summaryOf(saved, this.state.projects),
        saving: false,
        saveFailed: false,
        error: null,
      }
      this.emit()
    } catch (error) {
      this.state = {
        ...this.state,
        saving: false,
        saveFailed: true,
        error: error instanceof Error ? error.message : 'save_failed',
      }
      this.emit()
    }
  }

  /** Called when the page is hidden or closing: push out an edit still waiting on the debounce. */
  flushPending(): void {
    if (this.timer === undefined && !this.state.saveFailed) return
    void this.flush({ keepalive: true })
  }

  private names(): string[] {
    return this.state.projects.map((item) => item.name)
  }

  private rememberView(): void {
    if (!this.state.ready) return
    saveViewState(this.state.project.id, {
      selectedTrackId: this.state.selectedTrackId,
      octaveOffset: this.state.octaveOffset,
      showGhostNotes: this.state.showGhostNotes,
    })
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
      const built = build(this.state.project.id)
      const others = this.state.projects.filter((item) => item.id !== built.id).map((item) => item.name)
      const next = sanitizeProject({ ...built, name: uniqueName(built.name, others) })
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
    const built = build(createProjectId())
    const created = await saveProject({ ...built, name: uniqueName(built.name, this.names()) })
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
    const view = loadViewState(sanitized.id)
    setLastProjectId(sanitized.id)
    this.revision += 1
    this.history = []
    this.lastCommitAt = 0
    this.pristine = pristine
    this.state = {
      ...this.state,
      ready: true,
      project: sanitized,
      projects: projects.some((item) => item.id === sanitized.id) ? projects : summaryOf(sanitized, projects),
      selectedTrackId: sanitized.tracks.some((track) => track.id === view.selectedTrackId)
        ? view.selectedTrackId ?? ''
        : sanitized.tracks[0]?.id ?? '',
      octaveOffset: view.octaveOffset ?? 0,
      showGhostNotes: view.showGhostNotes ?? true,
      saveFailed: false,
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
    // The scale lives in the project; mirror it so views read one flat state.
    const scaleRoot = this.state.project.scaleRoot ?? DEFAULT_SCALE_ROOT
    const scaleId = this.state.project.scaleId ?? DEFAULT_SCALE_ID
    if (scaleRoot !== this.state.scaleRoot || scaleId !== this.state.scaleId) {
      this.state = { ...this.state, scaleRoot, scaleId }
    }
    for (const listener of this.listeners) listener()
  }
}

let singleton: ProjectClient | undefined

export function getProjectStore(): ProjectClient {
  if (singleton === undefined) singleton = new ProjectClient()
  return singleton
}
