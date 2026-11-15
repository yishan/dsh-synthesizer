/**
 * Browser-local memory: which project was open last, and per-project view
 * state that is not part of the music (selected track, keyboard octave, ghost
 * notes). Storage may be missing or full; every call degrades to a no-op.
 */
const LAST_PROJECT_KEY = 'dsh-synthesizer:last-project'
const VIEW_PREFIX = 'dsh-synthesizer:view:'
const SETTINGS_KEY = 'dsh-synthesizer:settings'

export type SidechainStrength = 'off' | 'normal' | 'strong'

export interface SynthSettings {
  showSidebarTransport: boolean
  sidebarTipDismissed: boolean
  backgroundPlayback: boolean
  masterVolume: number
  sidechainStrength: SidechainStrength
  auditionOnDraw: boolean
  qwertyPianoEnabled: boolean
  showGhostNotes: boolean
  showOscilloscope: boolean
}

const DEFAULT_SETTINGS: SynthSettings = {
  showSidebarTransport: true,
  sidebarTipDismissed: false,
  backgroundPlayback: true,
  masterVolume: 1,
  sidechainStrength: 'normal',
  auditionOnDraw: true,
  qwertyPianoEnabled: true,
  showGhostNotes: true,
  showOscilloscope: true,
}

export interface ViewState {
  selectedTrackId?: string
  octaveOffset?: number
  showGhostNotes?: boolean
}

function storage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage
  } catch {
    return undefined
  }
}

export function getLastProjectId(): string | null {
  try {
    return storage()?.getItem(LAST_PROJECT_KEY) ?? null
  } catch {
    return null
  }
}

export function setLastProjectId(id: string): void {
  try {
    storage()?.setItem(LAST_PROJECT_KEY, id)
  } catch {
    /* Ignore quota errors. */
  }
}

export function loadViewState(projectId: string): ViewState {
  try {
    const raw = storage()?.getItem(`${VIEW_PREFIX}${projectId}`)
    if (raw === null || raw === undefined) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const view: ViewState = {}
    if (typeof parsed.selectedTrackId === 'string') view.selectedTrackId = parsed.selectedTrackId
    if (typeof parsed.octaveOffset === 'number' && Number.isFinite(parsed.octaveOffset)) {
      view.octaveOffset = Math.max(-2, Math.min(2, Math.round(parsed.octaveOffset)))
    }
    if (typeof parsed.showGhostNotes === 'boolean') view.showGhostNotes = parsed.showGhostNotes
    return view
  } catch {
    return {}
  }
}

export function saveViewState(projectId: string, view: ViewState): void {
  try {
    storage()?.setItem(`${VIEW_PREFIX}${projectId}`, JSON.stringify(view))
  } catch {
    /* Ignore quota errors. */
  }
}

export function clearViewState(projectId: string): void {
  try {
    storage()?.removeItem(`${VIEW_PREFIX}${projectId}`)
  } catch {
    /* Ignore. */
  }
}

function normalizeMasterVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}

function normalizeSidechainStrength(value: unknown, fallback: SidechainStrength): SidechainStrength {
  return value === 'off' || value === 'normal' || value === 'strong' ? value : fallback
}

export function loadSettings(): SynthSettings {
  const defaults = { ...DEFAULT_SETTINGS }
  try {
    const raw = storage()?.getItem(SETTINGS_KEY)
    if (raw === null || raw === undefined) return defaults
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      showSidebarTransport: typeof parsed.showSidebarTransport === 'boolean'
        ? parsed.showSidebarTransport
        : defaults.showSidebarTransport,
      sidebarTipDismissed: typeof parsed.sidebarTipDismissed === 'boolean'
        ? parsed.sidebarTipDismissed
        : defaults.sidebarTipDismissed,
      backgroundPlayback: typeof parsed.backgroundPlayback === 'boolean'
        ? parsed.backgroundPlayback
        : defaults.backgroundPlayback,
      masterVolume: normalizeMasterVolume(parsed.masterVolume, defaults.masterVolume),
      sidechainStrength: normalizeSidechainStrength(parsed.sidechainStrength, defaults.sidechainStrength),
      auditionOnDraw: typeof parsed.auditionOnDraw === 'boolean'
        ? parsed.auditionOnDraw
        : defaults.auditionOnDraw,
      qwertyPianoEnabled: typeof parsed.qwertyPianoEnabled === 'boolean'
        ? parsed.qwertyPianoEnabled
        : defaults.qwertyPianoEnabled,
      showGhostNotes: typeof parsed.showGhostNotes === 'boolean'
        ? parsed.showGhostNotes
        : defaults.showGhostNotes,
      showOscilloscope: typeof parsed.showOscilloscope === 'boolean'
        ? parsed.showOscilloscope
        : defaults.showOscilloscope,
    }
  } catch {
    return defaults
  }
}

export function saveSettings(patch: Partial<SynthSettings>): SynthSettings {
  const current = loadSettings()
  const next: SynthSettings = {
    ...current,
    ...patch,
    masterVolume: patch.masterVolume !== undefined
      ? normalizeMasterVolume(patch.masterVolume, current.masterVolume)
      : current.masterVolume,
    sidechainStrength: patch.sidechainStrength !== undefined
      ? normalizeSidechainStrength(patch.sidechainStrength, current.sidechainStrength)
      : current.sidechainStrength,
  }
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* Ignore quota errors. */
  }
  return next
}

export function resetSettings(): SynthSettings {
  const defaults = { ...DEFAULT_SETTINGS }
  try {
    storage()?.removeItem(SETTINGS_KEY)
  } catch {
    /* Ignore. */
  }
  return defaults
}
