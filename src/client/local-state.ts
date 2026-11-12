/**
 * Browser-local memory: which project was open last, and per-project view
 * state that is not part of the music (selected track, keyboard octave, ghost
 * notes). Storage may be missing or full; every call degrades to a no-op.
 */
const LAST_PROJECT_KEY = 'dsh-synthesizer:last-project'
const VIEW_PREFIX = 'dsh-synthesizer:view:'

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
