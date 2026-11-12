import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.ts'
import { createDefaultProject } from '../src/schema.ts'

interface RecordedRoute {
  path: string
  methods: readonly string[]
  requestBody: string
  fetch: (request: Request) => Promise<Response>
}

class FakeConnection extends Service {
  readonly routes: RecordedRoute[] = []

  readonly fetch = {
    register: (route: RecordedRoute): (() => Promise<void>) => {
      this.routes.push(route)
      return async () => { this.routes.splice(this.routes.indexOf(route), 1) }
    },
  }

  constructor(ctx: Context) {
    super(ctx, 'connection')
  }
}

const directories: string[] = []

async function mountHost(): Promise<FakeConnection> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-synthesizer-host-'))
  directories.push(dir)
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(`${dir}/`).href
  ctx.plugin(FakeConnection)
  await new Promise((resolve) => setTimeout(resolve, 0))
  ctx.plugin(plugin)
  await new Promise((resolve) => setTimeout(resolve, 20))
  return ctx.get('connection') as unknown as FakeConnection
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('Host half', () => {
  it('registers exact GET and POST project routes', async () => {
    const connection = await mountHost()
    expect(connection.routes.map((route) => `${route.methods.join(',')} ${route.path}`).sort()).toEqual([
      'GET,POST /api/dsh-synthesizer/projects',
      'POST /api/dsh-synthesizer/projects/delete',
    ])
    for (const route of connection.routes) expect(route.requestBody).toBe('buffered')
  })

  it('saves, reads, lists, and deletes a project', async () => {
    const connection = await mountHost()
    const find = (path: string): RecordedRoute => {
      const route = connection.routes.find((item) => item.path === path)
      if (route === undefined) throw new Error(`missing route ${path}`)
      return route
    }
    const projects = find('/api/dsh-synthesizer/projects')
    const saved = await projects.fetch(new Request('http://127.0.0.1/api/dsh-synthesizer/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createDefaultProject('sketch')),
    }))
    expect(saved.status).toBe(200)
    const savedBody = await saved.json() as { ok: boolean; project: { id: string } }
    expect(savedBody.ok).toBe(true)
    expect(savedBody.project.id).toBe('sketch')

    const listed = await projects.fetch(new Request('http://127.0.0.1/api/dsh-synthesizer/projects'))
    const listedBody = await listed.json() as { projects: Array<{ id: string; bpm: number; bars: number; tracks: number; notes: number }> }
    expect(listedBody.projects.map((item) => item.id)).toEqual(['sketch'])
    expect(listedBody.projects[0]).toMatchObject({ bpm: 120, bars: 4, tracks: 4, notes: 0 })

    const read = await projects.fetch(new Request('http://127.0.0.1/api/dsh-synthesizer/projects?id=sketch'))
    expect((await read.json() as { project: { bpm: number } }).project.bpm).toBe(120)

    const rejected = await projects.fetch(new Request('http://127.0.0.1/api/dsh-synthesizer/projects?id=../secret'))
    expect(rejected.status).toBe(400)

    const removed = await find('/api/dsh-synthesizer/projects/delete').fetch(new Request('http://127.0.0.1/api/dsh-synthesizer/projects/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'sketch' }),
    }))
    expect(removed.status).toBe(200)
    const missing = await projects.fetch(new Request('http://127.0.0.1/api/dsh-synthesizer/projects?id=sketch'))
    expect(missing.status).toBe(404)
  })

  it('removes its routes when the plugin is disposed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-synthesizer-host-'))
    directories.push(dir)
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(`${dir}/`).href
    ctx.plugin(FakeConnection)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const fiber = ctx.plugin(plugin)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const connection = ctx.get('connection') as unknown as FakeConnection
    expect(connection.routes).toHaveLength(2)
    await fiber.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(connection.routes).toHaveLength(0)
  })
})
