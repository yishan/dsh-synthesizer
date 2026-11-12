/**
 * Authenticated project routes.
 *
 * The 0.2.x connection contract only delivers exact GET, HEAD, and POST routes,
 * so a project id travels in the query string or JSON body. PUT and DELETE are
 * not dispatched to plugin fetch handlers.
 */
import type { Context } from '@deepseek-ai/cordis'
import { ProjectStore, ProjectStoreError } from './store.ts'
import { VERSION } from './version.ts'

type FetchMethod = 'GET' | 'HEAD' | 'POST'

interface FetchRoute {
  path: string
  methods: readonly FetchMethod[]
  requestBody: 'buffered' | 'streaming'
  fetch: (request: Request) => Promise<Response>
}

interface ConnectionFace {
  fetch?: {
    register?: (route: FetchRoute) => () => Promise<void>
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

function failure(error: unknown): Response {
  if (error instanceof ProjectStoreError) return json({ ok: false, error: error.message }, error.status)
  if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_json' }, 400)
  return json({ ok: false, error: 'project_failed' }, 500)
}

/**
 * Register the project routes on the authenticated `/api` channel.
 * @returns the number of routes registered.
 */
export function registerRoutes(connectionCtx: Context, projects: ProjectStore): number {
  const connection = connectionCtx.get('connection') as ConnectionFace | undefined
  const fetchRegistry = connection?.fetch
  const register = fetchRegistry?.register
  if (fetchRegistry === undefined || typeof register !== 'function') return 0
  let routeCount = 0

  const add = (path: string, methods: readonly FetchMethod[], fetch: FetchRoute['fetch']): void => {
    // Tie the route to the plugin fiber so a reload or uninstall removes it.
    connectionCtx.effect(() => {
      const dispose = register.call(fetchRegistry, { path, methods, requestBody: 'buffered', fetch })
      return () => { void Promise.resolve(typeof dispose === 'function' ? dispose() : undefined).catch(() => {}) }
    })
    routeCount += 1
  }

  add('/api/dsh-synthesizer/projects', ['GET', 'POST'], async (request) => {
    try {
      if (request.method === 'GET') {
        const id = new URL(request.url).searchParams.get('id')
        if (id === null || id === '') return json({ ok: true, version: VERSION, projects: projects.list() })
        return json({ ok: true, project: projects.read(id) })
      }
      return json({ ok: true, project: projects.save(await request.json() as unknown) })
    } catch (error) {
      return failure(error)
    }
  })

  add('/api/dsh-synthesizer/projects/delete', ['POST'], async (request) => {
    try {
      const body = await request.json() as { id?: unknown }
      if (typeof body.id !== 'string') return json({ ok: false, error: 'invalid_id' }, 400)
      projects.remove(body.id)
      return json({ ok: true })
    } catch (error) {
      return failure(error)
    }
  })

  return routeCount
}
