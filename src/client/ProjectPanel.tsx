import { useRef, useState } from 'react'
import { MAX_PROJECTS, type Project } from '../model.ts'
import type { ProjectSummary } from './api.ts'
import { downloadFile, safeFileName } from './download.ts'
import { getEngine } from './engine.ts'
import { t, useLocale } from './i18n.ts'
import { Icon } from './icons.tsx'
import { projectToMidi } from './midi.ts'
import { SONG_PRESETS, songPresetTitle } from './presets.ts'
import { getProjectStore, type SessionState } from './project-store.ts'
import { encodeWav, renderProject } from './render.ts'

const SEARCH_THRESHOLD = 8

/** "刚刚", "5 分钟前", "3 小时前", "昨天", "4 天前", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return t('project.justNow')
  if (minutes < 60) return t('project.minsAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('project.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return t('project.yesterday')
  if (days < 30) return t('project.daysAgo', { n: days })
  const date = new Date(then)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function describe(item: ProjectSummary): string {
  const parts: string[] = []
  if (item.bpm !== undefined) parts.push(`${item.bpm} BPM`)
  if (item.bars !== undefined) parts.push(t('project.barsUnit', { n: item.bars }))
  if (item.notes !== undefined) parts.push(t('project.notesUnit', { n: item.notes }))
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
  useLocale()
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
          aria-label={t('project.search')}
          placeholder={t('project.search')}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          className="dsyn-field"
          style={{ margin: '4px 4px 6px' }}
        />
      ) : null}

      <div className="dsyn-project-list" role="list">
        {visible.length === 0 ? <div className="dsyn-menu-title">{t('project.noMatch', { query: query.trim() })}</div> : null}
        {visible.map((item) => {
          const current = item.id === currentId
          const editing = renaming?.id === item.id
          return (
            <div key={item.id} role="listitem" className={`dsyn-project${current ? ' is-current' : ''}`}>
              {editing ? (
                <input
                  aria-label={t('project.nameAria')}
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
                  title={current ? t('project.currentTitle') : t('project.openTitle', { name: item.name })}
                  onClick={() => {
                    close()
                    void run(() => store.selectProject(item.id))
                  }}
                  onDoubleClick={() => { setRenaming({ id: item.id, name: item.name }) }}
                >
                  <span className="dsyn-project-name">{item.name}</span>
                  <span className="dsyn-project-meta">{current ? `${t('project.current')} · ${describe(item)}` : describe(item)}</span>
                </button>
              )}
              {editing ? null : (
                <div className="dsyn-project-actions">
                  <RowAction label={t('project.rename')} icon="pencil" onClick={() => { setRenaming({ id: item.id, name: item.name }) }} />
                  <RowAction
                    label={full ? t('project.maxProjects', { max: MAX_PROJECTS }) : t('project.duplicate')}
                    icon="copy"
                    disabled={full}
                    onClick={() => {
                      close()
                      void run(() => store.duplicateProject(item.id))
                    }}
                  />
                  <RowAction
                    label={t('project.exportFile')}
                    icon="download"
                    onClick={() => { void run(async () => { downloadProject(await store.exportProject(item.id)) }) }}
                  />
                  <RowAction
                    label={t('project.delete')}
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
      <div className="dsyn-menu-title">{t('project.newSection')}</div>
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
          {t('project.blank')}
        </button>
        {SONG_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="dsyn-btn is-small"
            title={t('project.demoTitle', { bpm: preset.bpm })}
            onClick={() => {
              close()
              void run(async () => {
                await store.loadSongPreset(preset.id)
                startPlayback()
              })
            }}
          >
            {songPresetTitle(preset)}
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
          {t('project.random')}
        </button>
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-menu-title">{t('project.exportSection')}</div>
      <div className="dsyn-project-new">
        <button
          type="button"
          className="dsyn-btn is-small"
          title={t('project.midiTitle')}
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
          title={t('project.wavTitle')}
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
          {rendering ? t('project.rendering') : t('project.wav')}
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
          {t('project.import')}
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
