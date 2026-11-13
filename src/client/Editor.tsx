import { useEffect, useState } from 'react'
import { isTrackAudible, MAX_BARS, MAX_SWING, MAX_TRACKS } from '../model.ts'
import { auditionBase, auditionPitch } from './audition.ts'
import { getEngine } from './engine.ts'
import { Icon } from './icons.tsx'
import { INSTRUMENT_LABELS, listInstruments } from './instruments.ts'
import { connectMidiInput } from './midi-input.ts'
import { PianoRoll } from './PianoRoll.tsx'
import { Popover } from './Popover.tsx'
import { ProjectPanel } from './ProjectPanel.tsx'
import { getProjectStore } from './project-store.ts'
import { useSidebarWide } from './sidebar-state.ts'
import { ensureStyles, rangeFill, trackColor } from './styles.ts'
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
  invalid_import: '这个文件不是合成器工程，无法导入',
  render_unavailable: '当前环境不支持离线渲染音频',
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
  const sidebarWide = useSidebarWide()
  useEffect(() => {
    ensureStyles()
    void store.hydrate()
  }, [store])
  useEffect(() => {
    const heldKeys = new Map<string, number>()
    const isTextField = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      if (target.closest('textarea, select') !== null) return true
      const input = target.closest('input')
      return input !== null && input.type !== 'range' && input.type !== 'button' && input.type !== 'checkbox'
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'KeyZ' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        if (isTextField(event.target)) return
        event.preventDefault()
        store.undo()
        return
      }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTextField(event.target)) return

      const current = store.getState()
      const track = current.project.tracks.find((t) => t.id === current.selectedTrackId) ?? current.project.tracks[0]

      if (event.code === 'Space') {
        event.preventDefault()
        engine.togglePlay()
        return
      }
      if (event.code === 'KeyZ') {
        event.preventDefault()
        store.setOctaveOffset(current.octaveOffset - 1)
        return
      }
      if (event.code === 'KeyX') {
        event.preventDefault()
        store.setOctaveOffset(current.octaveOffset + 1)
        return
      }
      if (event.code === 'KeyR') {
        event.preventDefault()
        store.setRecordArm(!current.recordArm)
        return
      }
      if (event.code.startsWith('Digit')) {
        const idx = Number(event.code.slice(5)) - 1
        const targetTrack = current.project.tracks[idx]
        if (idx >= 0 && idx < 8 && targetTrack !== undefined) {
          event.preventDefault()
          store.selectTrack(targetTrack.id)
          return
        }
      }
      if (track === undefined) return
      const pitch = auditionPitch(event.code, auditionBase(track.instrumentId, current.octaveOffset))
      if (pitch === null) return
      event.preventDefault()
      heldKeys.set(event.code, pitch)
      store.setActivePreviewPitch(pitch)
      engine.previewDown(track.instrumentId, pitch, track.synth)
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      const pitch = heldKeys.get(event.code)
      if (pitch === undefined) return
      heldKeys.delete(event.code)
      engine.previewUp(pitch)
      if (store.getState().activePreviewPitch === pitch) {
        store.setActivePreviewPitch(null)
      }
    }

    const releaseAll = (): void => {
      for (const pitch of heldKeys.values()) engine.previewUp(pitch)
      heldKeys.clear()
      store.setActivePreviewPitch(null)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      releaseAll()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [engine, store])

  useEffect(() => {
    return connectMidiInput(
      (msg) => {
        const current = store.getState()
        const track = current.project.tracks.find((t) => t.id === current.selectedTrackId) ?? current.project.tracks[0]
        if (msg.type === 'noteOn' && track !== undefined) {
          store.setActivePreviewPitch(msg.pitch)
          engine.previewDown(track.instrumentId, msg.pitch, track.synth, msg.velocity)
        } else if (msg.type === 'noteOff') {
          engine.previewUp(msg.pitch)
          if (store.getState().activePreviewPitch === msg.pitch) {
            store.setActivePreviewPitch(null)
          }
        }
      },
      (names) => { store.setMidiDevices(names) },
    )
  }, [engine, store])

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
      <header className={`dsyn-top${sidebarWide ? '' : ' is-inset'}`}>
        <div className="dsyn-group">
          <Transport variant="page" />
          <span className="dsyn-sep" aria-hidden="true" />
          <label className="dsyn-label">
            速度
            <NumberField ariaLabel="BPM" min={40} max={240} value={project.bpm} width={56} onCommit={(value) => { store.setBpm(value) }} />
          </label>
          <label className="dsyn-label">
            小节
            <NumberField ariaLabel="小节数" min={1} max={MAX_BARS} value={project.bars} width={48} onCommit={(value) => { store.setBars(value) }} />
          </label>
          <button
            type="button"
            aria-label="小节翻倍"
            title="将小节数和全部音轨内容翻倍（可撤销）"
            disabled={project.bars * 2 > MAX_BARS}
            onClick={() => { store.duplicateBars() }}
            className="dsyn-btn is-small"
            style={{ fontFamily: 'var(--s-mono)' }}
          >
            ×2
          </button>
          <label className="dsyn-label" title="把每拍里第二、第四个十六分音符往后推。33 是三连音的摇摆感">
            摇摆
            <NumberField
              ariaLabel="摇摆"
              min={0}
              max={Math.round(MAX_SWING * 100)}
              value={Math.round((project.swing ?? 0) * 100)}
              width={48}
              onCommit={(value) => { store.setSwing(value / 100) }}
            />
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
          {state.saveFailed && !state.saving ? (
            <button
              type="button"
              className="dsyn-btn is-small is-danger"
              aria-pressed="true"
              title="最近的改动还没有保存到 DSH，点击重试"
              onClick={() => { void store.flush() }}
            >
              未保存 · 重试
            </button>
          ) : (
            <span className="dsyn-status" aria-live="polite">{state.saving ? '保存中…' : '已保存'}</span>
          )}
          <Popover
            label={`工程：${project.name}`}
            buttonClassName="dsyn-project-button"
            menuClassName="is-panel"
            trigger={<><span>{project.name}</span><Icon name="chevronDown" size={12} /></>}
          >
            {(close) => <ProjectPanel state={state} close={close} run={run} />}
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
          <Popover label="玩法与快捷键" trigger={<Icon name="help" />} icon>
            {() => (
              <div className="dsyn-help">
                <dl>
                  <dt>画音符</dt><dd>在格子上点击，或向右拖出长音；再点一次擦除</dd>
                  <dt>定位</dt><dd>点击顶部小节标尺跳到该位置</dd>
                  <dt><kbd>空格</kbd></dt><dd>随时播放 / 暂停</dd>
                  <dt><kbd>A</kbd>–<kbd>P</kbd></dt><dd>随时用电脑键盘弹奏，<kbd>Z</kbd> <kbd>X</kbd> 切换八度，支持 USB MIDI 键盘</dd>
                  <dt><kbd>1</kbd>–<kbd>8</kbd> / <kbd>R</kbd></dt><dd>快速切换音轨 / 开关「边弹边录」</dd>
                  <dt><kbd>⌘Z</kbd></dt><dd>撤销上一步</dd>
                  <dt>工程</dt><dd>点击工程名可切换、复制、导出、导入；改动会自动保存</dd>
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
            const dimmed = !isTrackAudible(track, project.tracks)
            return (
              <div
                key={track.id}
                onClick={() => { store.selectTrack(track.id) }}
                className={`dsyn-track${active ? ' is-selected' : ''}${dimmed ? ' is-muted' : ''}`}
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
                    aria-label={`独奏${track.name}`}
                    aria-pressed={track.solo === true}
                    title={track.solo ? '取消独奏' : '独奏此音轨'}
                    onClick={(event) => {
                      event.stopPropagation()
                      store.updateTrack(track.id, { solo: track.solo ? undefined : true })
                    }}
                    className="dsyn-btn is-small is-icon is-solo"
                    style={{ fontFamily: 'var(--s-mono)' }}
                  >
                    S
                  </button>
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
                    style={rangeFill(track.gain, 0, 1)}
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

      {state.lastDeleted !== null ? (
        <DeletedToast
          key={state.lastDeleted.id}
          name={state.lastDeleted.name}
          onUndo={() => { void run(() => store.restoreDeleted()) }}
          onDismiss={() => { store.dismissDeleted() }}
        />
      ) : null}
    </div>
  )
}

const UNDO_DELETE_MS = 10_000

/** Shown after a delete. The project can be restored until this goes away. */
function DeletedToast({
  name,
  onUndo,
  onDismiss,
}: {
  name: string
  onUndo: () => void
  onDismiss: () => void
}): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, UNDO_DELETE_MS)
    return () => { clearTimeout(timer) }
    // The toast is keyed by project id, so one timer per deletion is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div role="status" className="dsyn-toast">
      <span>已删除「{name}」</span>
      <button type="button" className="dsyn-btn is-small" onClick={onUndo}>撤销</button>
      <button type="button" aria-label="关闭" className="dsyn-btn is-small is-icon is-quiet" onClick={onDismiss}>
        <Icon name="close" size={14} />
      </button>
    </div>
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
