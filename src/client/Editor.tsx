import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MAX_TRACKS } from '../model.ts'
import { getEngine } from './engine.ts'
import { Icon } from './icons.tsx'
import { INSTRUMENT_LABELS, listInstruments } from './instruments.ts'
import { PianoRoll } from './PianoRoll.tsx'
import { SONG_PRESETS } from './presets.ts'
import { getProjectStore } from './project-store.ts'
import { ensureStyles, trackColor } from './styles.ts'
import { Transport } from './Transport.tsx'
import { useProject } from './use-project.ts'

const ERRORS: Record<string, string> = {
  invalid_project: '工程数据格式有误，已自动校正参数范围',
  invalid_id: '工程编号无效',
  invalid_json: '工程数据不是有效 JSON',
  not_found: '找不到该工程',
  project_too_large: '工程体积超过 256KB 上限',
  too_many_projects: '最多保存 32 个工程，请先清理旧工程',
  profile_unavailable: '当前环境暂不支持写入工程文件',
  load_failed: '读取工程失败，请稍后重试',
  save_failed: '保存工程失败，请稍后重试',
}

/** Turn a store error code or a raw fetch failure into a sentence the user can act on. */
function errorText(code: string): string {
  const known = ERRORS[code]
  if (known !== undefined) return known
  const status = /^HTTP (\d+)$/.exec(code)?.[1]
  if (status !== undefined) return `DSH 宿主返回了错误（HTTP ${status}）。请确认合成器插件已在当前 profile 中启用`
  return `无法连接到 DSH 宿主，请稍后重试（${code}）`
}

/**
 * Three layers: the top bar (transport, tempo, project), the track list, and the
 * editor for the selected track. Playback continues after this page unmounts.
 */
export function Editor(): JSX.Element {
  const state = useProject()
  const store = getProjectStore()
  const engine = getEngine()
  useEffect(() => {
    ensureStyles()
    void store.hydrate()
  }, [store])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyZ' || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return
      // Text fields keep their own native undo.
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, select, textarea') !== null) return
      event.preventDefault()
      store.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [store])

  if (!state.ready) {
    return (
      <div className="dsyn dsyn-page" style={{ padding: 16, gap: 12, alignItems: 'flex-start' }}>
        {state.loadFailed ? (
          <>
            <div role="alert">
              <div style={{ fontWeight: 600 }}>没能读取工程</div>
              <div className="dsyn-caption" style={{ marginTop: 4 }}>{errorText(state.error ?? 'load_failed')}</div>
            </div>
            <button type="button" className="dsyn-btn is-primary" onClick={() => { void store.hydrate() }}>
              重试
            </button>
          </>
        ) : '正在载入合成器…'}
      </div>
    )
  }

  const project = state.project
  const selected = project.tracks.find((track) => track.id === state.selectedTrackId) ?? project.tracks[0]
  if (selected === undefined) return <div className="dsyn dsyn-page" style={{ padding: 16 }}>当前工程没有音轨</div>
  const instruments = listInstruments()
  const startPlayback = (): void => {
    if (!store.getState().playing) engine.togglePlay()
  }

  return (
    <div data-panel="dsh-synthesizer" className="dsyn dsyn-page">
      <header className="dsyn-top">
        <div className="dsyn-group">
          <Transport variant="page" />
          <span className="dsyn-sep" aria-hidden="true" />
          <label className="dsyn-label">
            速度
            <NumberField ariaLabel="BPM" min={40} max={240} value={project.bpm} width={56} onCommit={(value) => { store.setBpm(value) }} />
          </label>
          <label className="dsyn-label">
            小节
            <NumberField ariaLabel="小节数" min={1} max={32} value={project.bars} width={48} onCommit={(value) => { store.setBars(value) }} />
          </label>
          <button
            type="button"
            aria-label="循环播放"
            aria-pressed={project.loop}
            title={project.loop ? '循环播放：开' : '循环播放：关'}
            onClick={() => { store.setLoop(!project.loop) }}
            className="dsyn-btn is-icon"
          >
            <Icon name="loop" />
          </button>
        </div>

        <div className="dsyn-group">
          <span className="dsyn-status" aria-live="polite">
            {state.saving ? '保存中…' : state.error === null ? '已保存' : ''}
          </span>
          <input
            aria-label="工程名称"
            title="当前工程名称，可直接修改"
            value={project.name}
            onChange={(event) => { store.rename(event.target.value) }}
            className="dsyn-field is-quiet"
            style={{ width: 200, fontWeight: 600, fontSize: 13 }}
          />
          <Popover label="打开工程" trigger={<>打开<Icon name="chevronDown" size={12} /></>}>
            {(close) => (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {state.projects.map((item) => (
                  <MenuItem
                    key={item.id}
                    label={item.name}
                    detail={item.id === project.id ? '当前' : undefined}
                    onSelect={() => {
                      close()
                      if (item.id !== project.id) void run(() => store.selectProject(item.id))
                    }}
                  />
                ))}
              </div>
            )}
          </Popover>
          <Popover
            label="新建"
            trigger={<><Icon name="plus" />新建<Icon name="chevronDown" size={12} /></>}
          >
            {(close) => (
              <>
                <MenuItem
                  label="空白工程"
                  onSelect={() => {
                    close()
                    void run(() => store.newProject(true))
                  }}
                />
                <div className="dsyn-menu-rule" />
                <div className="dsyn-menu-title">从示范曲开始</div>
                {SONG_PRESETS.map((preset) => (
                  <MenuItem
                    key={preset.id}
                    label={preset.title}
                    detail={`${preset.bpm} BPM`}
                    onSelect={() => {
                      close()
                      void run(async () => {
                        await store.loadSongPreset(preset.id)
                        startPlayback()
                      })
                    }}
                  />
                ))}
                <MenuItem
                  label="随机生成一首"
                  onSelect={() => {
                    close()
                    void run(async () => {
                      await store.loadRandomGroove()
                      startPlayback()
                    })
                  }}
                />
              </>
            )}
          </Popover>
          <span className="dsyn-sep" aria-hidden="true" />
          <button
            type="button"
            aria-label="撤销"
            title="撤销上一步编辑（⌘Z / Ctrl+Z）"
            disabled={!state.canUndo}
            onClick={() => { store.undo() }}
            className="dsyn-btn is-icon"
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            aria-label="删除当前工程"
            title="删除当前工程"
            onClick={() => {
              if (window.confirm(`确定删除工程「${project.name}」吗？此操作无法撤销。`)) void run(() => store.removeProject())
            }}
            className="dsyn-btn is-icon"
          >
            <Icon name="trash" />
          </button>
          <Popover label="玩法与快捷键" trigger={<Icon name="help" />} icon>
            {() => (
              <div className="dsyn-help">
                <dl>
                  <dt>画音符</dt><dd>在格子上点击，或向右拖出长音；再点一次擦除</dd>
                  <dt>定位</dt><dd>点击顶部小节标尺跳到该位置</dd>
                  <dt><kbd>空格</kbd></dt><dd>播放 / 暂停（焦点在网格时）</dd>
                  <dt><kbd>A</kbd>–<kbd>L</kbd></dt><dd>用电脑键盘弹奏，<kbd>Z</kbd> <kbd>X</kbd> 切换八度</dd>
                  <dt><kbd>⌘Z</kbd></dt><dd>撤销上一步</dd>
                  <dt>后台播放</dt><dd>回到对话后音乐继续，侧栏底部可暂停和静音</dd>
                </dl>
              </div>
            )}
          </Popover>
        </div>
      </header>

      {state.error !== null ? (
        <div role="alert" className="dsyn-alert">
          <span>{errorText(state.error)}</span>
          <button type="button" aria-label="关闭提示" onClick={() => { store.setError(null) }} className="dsyn-btn is-small is-icon is-quiet">
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}

      <div className="dsyn-body">
        <aside aria-label="音轨" className="dsyn-tracks">
          {project.tracks.map((track) => {
            const active = track.id === selected.id
            return (
              <div
                key={track.id}
                onClick={() => { store.selectTrack(track.id) }}
                className={`dsyn-track${active ? ' is-selected' : ''}${track.mute ? ' is-muted' : ''}`}
                style={{ '--s-track': trackColor(track.instrumentId) } as React.CSSProperties}
              >
                <div className="dsyn-track-row">
                  <input
                    aria-label={`${track.name}名称`}
                    value={track.name}
                    onFocus={() => { store.selectTrack(track.id) }}
                    onChange={(event) => {
                      store.updateTrack(track.id, { name: event.target.value.slice(0, 64) || track.name })
                    }}
                    className="dsyn-field is-quiet dsyn-track-name"
                  />
                  <button
                    type="button"
                    aria-label={`静音${track.name}`}
                    aria-pressed={track.mute}
                    title={track.mute ? '取消静音' : '静音此音轨'}
                    onClick={(event) => {
                      event.stopPropagation()
                      store.updateTrack(track.id, { mute: !track.mute })
                    }}
                    className="dsyn-btn is-small is-icon is-danger"
                    style={{ fontFamily: 'var(--s-mono)' }}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    aria-label={`移除${track.name}`}
                    title="移除此音轨（可撤销）"
                    disabled={project.tracks.length <= 1}
                    onClick={(event) => {
                      event.stopPropagation()
                      store.removeTrack(track.id)
                    }}
                    className="dsyn-btn is-small is-icon is-quiet"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div className="dsyn-track-row">
                  <select
                    aria-label={`${track.name}音色`}
                    value={track.instrumentId}
                    onChange={(event) => { store.updateTrack(track.id, { instrumentId: event.target.value }) }}
                    className="dsyn-field is-quiet dsyn-track-inst"
                  >
                    {instruments.map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {(INSTRUMENT_LABELS[instrument.id] ?? instrument.id).split(' ')[0]}
                      </option>
                    ))}
                    {instruments.some((instrument) => instrument.id === track.instrumentId)
                      ? null
                      : <option value={track.instrumentId}>{track.instrumentId}</option>}
                  </select>
                  <input
                    aria-label={`${track.name}音量`}
                    title={`音量 ${Math.round(track.gain * 100)}%`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={track.gain}
                    onChange={(event) => { store.updateTrack(track.id, { gain: Number(event.target.value) }) }}
                    className="dsyn-range"
                  />
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="dsyn-btn is-quiet dsyn-add"
            disabled={project.tracks.length >= MAX_TRACKS}
            title={project.tracks.length >= MAX_TRACKS ? `最多 ${MAX_TRACKS} 条音轨` : undefined}
            onClick={() => { store.addTrack() }}
          >
            <Icon name="plus" />
            添加音轨
          </button>
        </aside>

        <PianoRoll track={selected} bars={project.bars} playing={state.playing} />
      </div>
    </div>
  )
}

/** Button with a dropdown that closes on outside click or Escape. */
function Popover({
  label,
  trigger,
  icon = false,
  children,
}: {
  label: string
  trigger: ReactNode
  icon?: boolean
  children: (close: () => void) => ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={root} className="dsyn-pop">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        title={icon ? label : undefined}
        onClick={() => { setOpen(!open) }}
        className={`dsyn-btn${icon ? ' is-icon' : ''}`}
      >
        {trigger}
      </button>
      {open ? <div className="dsyn-menu">{children(() => { setOpen(false) })}</div> : null}
    </div>
  )
}

function MenuItem({ label, detail, onSelect }: { label: string; detail?: string; onSelect: () => void }): JSX.Element {
  return (
    <button type="button" className="dsyn-menu-item" onClick={onSelect}>
      <span>{label}</span>
      {detail !== undefined ? <span>{detail}</span> : null}
    </button>
  )
}

/**
 * Number input that commits on blur or Enter. Committing per keystroke clamped
 * half-typed values, and for the bar count that clipped notes for good.
 */
function NumberField({
  ariaLabel,
  min,
  max,
  value,
  width,
  onCommit,
}: {
  ariaLabel: string
  min: number
  max: number
  value: number
  width: number
  onCommit: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    if (draft === null) return
    const next = Number(draft)
    setDraft(null)
    if (draft.trim() === '' || !Number.isFinite(next)) return
    const clamped = Math.max(min, Math.min(max, Math.round(next)))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <input
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft ?? value}
      onChange={(event) => { setDraft(event.target.value) }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(null)
      }}
      className="dsyn-field is-number"
      style={{ width }}
    />
  )
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    getProjectStore().setError(error instanceof Error ? error.message : 'save_failed')
  }
}
