import { useRef, useState } from 'react'
import { MAX_PROJECTS, type Project } from '../model.ts'
import type { ProjectSummary } from './api.ts'
import { downloadFile, safeFileName } from './download.ts'
import { getEngine } from './engine.ts'
import { Icon } from './icons.tsx'
import { projectToMidi } from './midi.ts'
import { SONG_PRESETS } from './presets.ts'
import { getProjectStore, type SessionState } from './project-store.ts'
import { encodeWav, renderProject } from './render.ts'

const SEARCH_THRESHOLD = 8

/** "刚刚", "5 分钟前", "3 小时前", "昨天", "4 天前", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  const date = new Date(then)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function describe(item: ProjectSummary): string {
  const parts: string[] = []
  if (item.bpm !== undefined) parts.push(`${item.bpm} BPM`)
  if (item.bars !== undefined) parts.push(`${item.bars} 小节`)
  if (item.notes !== undefined) parts.push(`${item.notes} 音符`)
  const when = relativeTime(item.updatedAt)
  if (when !== '') parts.push(when)
  return parts.join(' · ')
}

function downloadProject(project: Project): void {
  downloadFile(JSON.stringify(project, null, 2), 'application/json', `${safeFileName(project.name)}.dsh-synth.json`)
}

/**
 * Everything about projects as files: open, rename, duplicate, export, delete,
 * create, and import. Lives in the dropdown under the project name.
 */
export function ProjectPanel({
  state,
  close,
  run,
}: {
  state: SessionState
  close: () => void
  run: (action: () => Promise<void>) => Promise<void>
}): JSX.Element {
  const store = getProjectStore()
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [rendering, setRendering] = useState(false)

  const currentId = state.project.id
  const all = state.projects.some((item) => item.id === currentId)
    ? state.projects
    : [{ id: currentId, name: state.project.name, updatedAt: new Date().toISOString() }, ...state.projects]
  const needle = query.trim().toLowerCase()
  const visible = needle === '' ? all : all.filter((item) => item.name.toLowerCase().includes(needle))
  const full = all.length >= MAX_PROJECTS
  const startPlayback = (): void => {
    if (!store.getState().playing) getEngine().togglePlay()
  }
  const commitRename = (): void => {
    if (renaming === null) return
    const { id, name } = renaming
    setRenaming(null)
    void run(() => store.renameProject(id, name))
  }

  return (
    <div className="dsyn-projects">
      {all.length > SEARCH_THRESHOLD ? (
        <input
          aria-label="搜索工程"
          placeholder="搜索工程"
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          className="dsyn-field"
          style={{ margin: '4px 4px 6px' }}
        />
      ) : null}

      <div className="dsyn-project-list" role="list">
        {visible.length === 0 ? <div className="dsyn-menu-title">没有名字包含“{query.trim()}”的工程</div> : null}
        {visible.map((item) => {
          const current = item.id === currentId
          const editing = renaming?.id === item.id
          return (
            <div key={item.id} role="listitem" className={`dsyn-project${current ? ' is-current' : ''}`}>
              {editing ? (
                <input
                  aria-label="工程名称"
                  autoFocus
                  value={renaming.name}
                  maxLength={80}
                  onChange={(event) => { setRenaming({ id: item.id, name: event.target.value }) }}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                  className="dsyn-field"
                  style={{ flex: 1, fontWeight: 500 }}
                />
              ) : (
                <button
                  type="button"
                  className="dsyn-project-main"
                  title={current ? '当前工程' : `打开「${item.name}」`}
                  onClick={() => {
                    close()
                    void run(() => store.selectProject(item.id))
                  }}
                  onDoubleClick={() => { setRenaming({ id: item.id, name: item.name }) }}
                >
                  <span className="dsyn-project-name">{item.name}</span>
                  <span className="dsyn-project-meta">{current ? `当前 · ${describe(item)}` : describe(item)}</span>
                </button>
              )}
              {editing ? null : (
                <div className="dsyn-project-actions">
                  <RowAction label="重命名" icon="pencil" onClick={() => { setRenaming({ id: item.id, name: item.name }) }} />
                  <RowAction
                    label={full ? `已达 ${MAX_PROJECTS} 个工程上限` : '复制'}
                    icon="copy"
                    disabled={full}
                    onClick={() => {
                      close()
                      void run(() => store.duplicateProject(item.id))
                    }}
                  />
                  <RowAction
                    label="导出为文件"
                    icon="download"
                    onClick={() => { void run(async () => { downloadProject(await store.exportProject(item.id)) }) }}
                  />
                  <RowAction
                    label="删除"
                    icon="trash"
                    onClick={() => { void run(() => store.removeProject(item.id)) }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-menu-title">新建</div>
      <div className="dsyn-project-new">
        <button
          type="button"
          className="dsyn-btn is-small"
          disabled={full}
          onClick={() => {
            close()
            void run(() => store.newProject(true))
          }}
        >
          空白工程
        </button>
        {SONG_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="dsyn-btn is-small"
            title={`示范曲 · ${preset.bpm} BPM`}
            onClick={() => {
              close()
              void run(async () => {
                await store.loadSongPreset(preset.id)
                startPlayback()
              })
            }}
          >
            {preset.title}
          </button>
        ))}
        <button
          type="button"
          className="dsyn-btn is-small"
          onClick={() => {
            close()
            void run(async () => {
              await store.loadRandomGroove()
              startPlayback()
            })
          }}
        >
          随机生成
        </button>
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-menu-title">导出当前工程</div>
      <div className="dsyn-project-new">
        <button
          type="button"
          className="dsyn-btn is-small"
          title="标准 MIDI 文件，每条音轨一轨，可以拖进其他音乐软件"
          onClick={() => {
            void run(async () => {
              const project = await store.exportProject(currentId)
              downloadFile(projectToMidi(project), 'audio/midi', `${safeFileName(project.name)}.mid`)
            })
          }}
        >
          MIDI
        </button>
        <button
          type="button"
          className="dsyn-btn is-small"
          disabled={rendering}
          title="把循环渲染一遍成音频文件，和播放听到的一致"
          onClick={() => {
            setRendering(true)
            void run(async () => {
              try {
                const project = await store.exportProject(currentId)
                downloadFile(encodeWav(await renderProject(project), 0.98), 'audio/wav', `${safeFileName(project.name)}.wav`)
              } finally {
                setRendering(false)
              }
            })
          }}
        >
          {rendering ? '渲染中…' : '音频 WAV'}
        </button>
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-spread" style={{ padding: '2px 4px 4px' }}>
        <button
          type="button"
          className="dsyn-btn is-small is-quiet"
          disabled={full}
          onClick={() => { fileInput.current?.click() }}
        >
          <Icon name="upload" size={14} />
          导入文件…
        </button>
        <span className="dsyn-caption">{all.length} / {MAX_PROJECTS}</span>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file === undefined) return
            close()
            void run(async () => {
              let parsed: unknown
              try {
                parsed = JSON.parse(await file.text()) as unknown
              } catch {
                throw new Error('invalid_import')
              }
              await store.importProject(parsed)
            })
          }}
        />
      </div>
    </div>
  )
}

function RowAction({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  label: string
  icon: 'pencil' | 'copy' | 'download' | 'trash'
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="dsyn-btn is-small is-icon is-quiet"
    >
      <Icon name={icon} size={14} />
    </button>
  )
}
