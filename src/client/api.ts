/** Browser fetch helpers for the authenticated project routes. */
import { coerceSynthPatch, sanitizeProject, type Project, type SynthPatch } from '../model.ts'

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  bpm?: number
  bars?: number
  tracks?: number
  notes?: number
}

interface ListBody {
  ok?: boolean
  error?: string
  projects?: ProjectSummary[]
}

interface ProjectBody {
  ok?: boolean
  error?: string
  project?: Project
}

const SYNTH_STORAGE_PREFIX = 'dsh-synthesizer:synth:'

function saveLocalSynthPatches(project: Project): Map<string, SynthPatch> {
  const patches = new Map<string, SynthPatch>()
  const record: Record<string, SynthPatch> = {}
  for (const track of project.tracks) {
    if (track.synth !== undefined && track.instrumentId !== 'drums') {
      patches.set(track.id, track.synth)
      record[track.id] = track.synth
    }
  }
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(`${SYNTH_STORAGE_PREFIX}${project.id}`, JSON.stringify(record))
    }
  } catch {
    /* Ignore storage quota or SSR environments. */
  }
  return patches
}

function loadLocalSynthPatches(projectId: string): Map<string, SynthPatch> {
  const patches = new Map<string, SynthPatch>()
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      const raw = globalThis.localStorage.getItem(`${SYNTH_STORAGE_PREFIX}${projectId}`)
      if (raw !== null) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        for (const [trackId, value] of Object.entries(parsed)) {
          const patch = coerceSynthPatch(value)
          if (patch !== null) patches.set(trackId, patch)
        }
      }
    }
  } catch {
    /* Ignore corrupt local entries. */
  }
  return patches
}

function mergeSynthPatches(project: Project, patches: Map<string, SynthPatch>): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.instrumentId === 'drums') return track
      const patch = track.synth ?? patches.get(track.id)
      return patch !== undefined ? { ...track, synth: patch } : track
    }),
  }
}

/**
 * Wire payload for a Host still running an older schema, whose strict objects
 * reject the fields added since: per-track `synth` and the project scale.
 */
function legacyWire(project: Project): Project {
  return {
    version: 1,
    id: project.id,
    name: project.name,
    bpm: project.bpm,
    beatsPerBar: project.beatsPerBar,
    bars: project.bars,
    loop: project.loop,
    tracks: project.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      instrumentId: track.instrumentId,
      mute: track.mute,
      gain: track.gain,
      notes: track.notes,
    })),
  }
}

/** A request the browser may finish after the page is gone has a small body budget. */
const KEEPALIVE_MAX_BYTES = 60_000

async function postProject(project: Project, keepalive: boolean): Promise<Project> {
  const payload = JSON.stringify(project)
  const body = await readBody<ProjectBody>(await fetch('/api/dsh-synthesizer/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    cache: 'no-store',
    ...(keepalive && payload.length < KEEPALIVE_MAX_BYTES ? { keepalive: true } : {}),
  }))
  if (body.project === undefined) throw new Error('invalid_project')
  return body.project
}

async function readBody<T extends { ok?: boolean; error?: string }>(response: Response): Promise<T> {
  const text = await response.text()
  let body: T
  try {
    body = JSON.parse(text) as T
  } catch {
    throw new Error(response.ok ? 'invalid_json' : `HTTP ${response.status}`)
  }
  if (!response.ok || body.ok === false) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const body = await readBody<ListBody>(await fetch('/api/dsh-synthesizer/projects', { cache: 'no-store' }))
  return body.projects ?? []
}

export async function readProject(id: string): Promise<Project> {
  const query = new URLSearchParams({ id })
  const body = await readBody<ProjectBody>(await fetch(`/api/dsh-synthesizer/projects?${query.toString()}`, { cache: 'no-store' }))
  if (body.project === undefined) throw new Error('invalid_project')
  const patches = loadLocalSynthPatches(body.project.id)
  return mergeSynthPatches(body.project, patches)
}

/**
 * Save the whole project, synth patches included, to the profile.
 * The browser copy of the patches is only a fallback: it is used when an older
 * Host rejects `synth`, and to recover patches saved before the Host stored them.
 */
/**
 * Save the whole project to the profile. `keepalive` asks the browser to
 * finish the request even if the page is closing.
 * The browser copy of the synth patches is only a fallback: it is used when an
 * older Host rejects the newer fields, and to recover patches saved before the
 * Host stored them.
 */
export async function saveProject(project: Project, options: { keepalive?: boolean } = {}): Promise<Project> {
  const clean = sanitizeProject(project)
  const patches = saveLocalSynthPatches(clean)
  const keepalive = options.keepalive === true
  try {
    return await postProject(clean, keepalive)
  } catch (error) {
    const hasNewFields = clean.scaleRoot !== undefined
      || clean.swing !== undefined
      || clean.scaleId !== undefined
      || clean.tracks.some((track) => track.synth !== undefined || track.kit !== undefined)
    if (!hasNewFields || !(error instanceof Error) || error.message !== 'invalid_project') throw error
    const saved = mergeSynthPatches(await postProject(legacyWire(clean), keepalive), patches)
    const kits = new Map(clean.tracks.map((track) => [track.id, track.kit]))
    return {
      ...saved,
      tracks: saved.tracks.map((track) => {
        const kit = kits.get(track.id)
        return kit !== undefined ? { ...track, kit } : track
      }),
      ...(clean.swing !== undefined ? { swing: clean.swing } : {}),
      ...(clean.scaleRoot !== undefined ? { scaleRoot: clean.scaleRoot } : {}),
      ...(clean.scaleId !== undefined ? { scaleId: clean.scaleId } : {}),
    }
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(`${SYNTH_STORAGE_PREFIX}${id}`)
    }
  } catch {
    /* Ignore. */
  }
  await readBody(await fetch('/api/dsh-synthesizer/projects/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
    cache: 'no-store',
  }))
}
