/** Browser fetch helpers for the authenticated project routes. */
import { coerceSynthPatch, sanitizeProject, type Project, type SynthPatch } from '../model.ts'

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
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
 * Wire payload without `synth`, for a Host still running the first v1 schema
 * whose strict track object rejects the field.
 */
function withoutSynth(project: Project): Project {
  return {
    ...project,
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

async function postProject(project: Project): Promise<Project> {
  const body = await readBody<ProjectBody>(await fetch('/api/dsh-synthesizer/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
    cache: 'no-store',
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
export async function saveProject(project: Project): Promise<Project> {
  const clean = sanitizeProject(project)
  const patches = saveLocalSynthPatches(clean)
  try {
    return await postProject(clean)
  } catch (error) {
    const hasSynth = clean.tracks.some((track) => track.synth !== undefined)
    if (!hasSynth || !(error instanceof Error) || error.message !== 'invalid_project') throw error
    return mergeSynthPatches(await postProject(withoutSynth(clean)), patches)
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
