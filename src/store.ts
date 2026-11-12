/** Profile JSON store. Project ids are file names, so they cannot escape the directory. */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_PROJECT_BYTES,
  MAX_PROJECTS,
  projectSchema,
  type Project,
} from './schema.ts'

export class ProjectStoreError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ProjectStoreError'
    this.status = status
  }
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  bpm: number
  bars: number
  tracks: number
  notes: number
}

export interface StoreLimits {
  maxBytes: number
  maxProjects: number
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export class ProjectStore {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly limits: StoreLimits = { maxBytes: MAX_PROJECT_BYTES, maxProjects: MAX_PROJECTS },
  ) {}

  list(): ProjectSummary[] {
    const dir = this.projectsDir()
    const summaries: Array<ProjectSummary & { mtime: number }> = []
    for (const entry of readdirSync(dir)) {
      if (!/^[A-Za-z0-9_-]{1,64}\.json$/.test(entry)) continue
      const path = join(dir, entry)
      try {
        const project = projectSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown)
        const mtime = statSync(path).mtimeMs
        summaries.push({
          id: project.id,
          name: project.name,
          updatedAt: new Date(mtime).toISOString(),
          bpm: project.bpm,
          bars: project.bars,
          tracks: project.tracks.length,
          notes: project.tracks.reduce((total, track) => total + track.notes.length, 0),
          mtime,
        })
      } catch {
        // A corrupt file stays on disk but does not block the rest of the list.
      }
    }
    summaries.sort((a, b) => b.mtime - a.mtime)
    return summaries.map(({ mtime: _mtime, ...summary }) => summary)
  }

  read(id: string): Project {
    const path = this.fileFor(id)
    if (!existsSync(path)) throw new ProjectStoreError('not_found', 404)
    try {
      return projectSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    } catch (error) {
      if (error instanceof ProjectStoreError) throw error
      throw new ProjectStoreError('invalid_project', 400)
    }
  }

  save(raw: unknown): Project {
    const parsed = projectSchema.safeParse(raw)
    if (!parsed.success) throw new ProjectStoreError('invalid_project', 400)
    const body = JSON.stringify(parsed.data)
    if (Buffer.byteLength(body, 'utf8') > this.limits.maxBytes) throw new ProjectStoreError('project_too_large', 400)
    const path = this.fileFor(parsed.data.id)
    if (!existsSync(path) && this.list().length >= this.limits.maxProjects) {
      throw new ProjectStoreError('too_many_projects', 400)
    }
    const temporary = `${path}.${process.pid}.tmp`
    try {
      writeFileSync(temporary, body, { mode: 0o600 })
      renameSync(temporary, path)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
    return parsed.data
  }

  remove(id: string): void {
    const path = this.fileFor(id)
    if (!existsSync(path)) throw new ProjectStoreError('not_found', 404)
    rmSync(path)
  }

  private projectsDir(): string {
    if (this.baseUrl === undefined || this.baseUrl === '') throw new ProjectStoreError('profile_unavailable', 503)
    const dir = fileURLToPath(new URL('storages/dsh-synthesizer/projects/', this.baseUrl))
    mkdirSync(dir, { recursive: true })
    return dir
  }

  private fileFor(id: string): string {
    if (!ID_PATTERN.test(id)) throw new ProjectStoreError('invalid_id', 400)
    const dir = resolve(this.projectsDir())
    const path = resolve(dir, `${id}.json`)
    if (path !== join(dir, `${id}.json`)) throw new ProjectStoreError('invalid_id', 400)
    return path
  }
}
