import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_PROJECTS, createDefaultProject } from '../src/schema.ts'
import { ProjectStore } from '../src/store.ts'

const directories: string[] = []

function profile(): { url: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-synthesizer-'))
  directories.push(dir)
  return { url: pathToFileURL(`${dir}/`).href, dir }
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('project store', () => {
  it('round-trips a project and ignores a corrupt file', () => {
    const { url } = profile()
    const store = new ProjectStore(url)
    const saved = store.save(createDefaultProject('alpha'))
    store.save({ ...createDefaultProject('beta'), name: '第二个' })
    expect(store.read('alpha')).toEqual(saved)
    expect(store.list().map((item) => item.id)).toEqual(['beta', 'alpha'])
    const projects = fileURLToPath(new URL('storages/dsh-synthesizer/projects/', url))
    writeFileSync(join(projects, 'broken.json'), '{')
    expect(store.list().map((item) => item.id)).toEqual(['beta', 'alpha'])
    expect(readdirSync(projects).some((name) => name.includes('.tmp'))).toBe(false)
  })

  it('rejects path traversal, the project cap, and oversized documents', () => {
    const { url } = profile()
    const store = new ProjectStore(url)
    expect(() => store.read('..')).toThrow(/invalid_id/)
    expect(() => store.read('../secret')).toThrow(/invalid_id/)
    expect(() => store.save({ ...createDefaultProject('ok'), id: '../x' })).toThrow(/invalid_project/)
    for (let index = 0; index < MAX_PROJECTS; index += 1) store.save(createDefaultProject(`p${index}`))
    expect(() => store.save(createDefaultProject('overflow'))).toThrow(/too_many_projects/)
    expect(store.save(createDefaultProject('p0')).id).toBe('p0')
    const tiny = new ProjectStore(url, { maxBytes: 20, maxProjects: MAX_PROJECTS })
    expect(() => tiny.save(createDefaultProject('tiny'))).toThrow(/project_too_large/)
  })

  it('removes a project and reports a missing one', () => {
    const { url } = profile()
    const store = new ProjectStore(url)
    store.save(createDefaultProject('gone'))
    store.remove('gone')
    expect(() => store.read('gone')).toThrow(/not_found/)
    expect(store.list()).toEqual([])
  })
})
