import { useEffect, useState } from 'react'
import { isTrackAudible, MAX_BARS, MAX_SWING, MAX_TRACKS } from '../model.ts'
import { VERSION } from '../version.ts'
import { auditionBase, auditionPitch } from './audition.ts'
import { getEngine } from './engine.ts'
import {
  getLocaleSetting,
  resetLocaleCache,
  setLocaleSetting,
  t,
  useLocale,
  type LocaleSetting,
  type MessageKey,
} from './i18n.ts'
import { Icon } from './icons.tsx'
import { instrumentLabel, listInstruments } from './instruments.ts'
import { connectMidiInput } from './midi-input.ts'
import { PianoRoll } from './PianoRoll.tsx'
import { Popover } from './Popover.tsx'
import { ProjectPanel } from './ProjectPanel.tsx'
import type { SidechainStrength } from './local-state.ts'
import { getProjectStore } from './project-store.ts'
import { useSidebarWide } from './sidebar-state.ts'
import { ensureStyles, rangeFill, trackColor } from './styles.ts'
import { Transport } from './Transport.tsx'
import { useProject } from './use-project.ts'

const ERROR_KEYS: Record<string, MessageKey> = {
  invalid_project: 'err.invalid_project',
  invalid_id: 'err.invalid_id',
  invalid_json: 'err.invalid_json',
  not_found: 'err.not_found',
  project_too_large: 'err.project_too_large',
  too_many_projects: 'err.too_many_projects',
  profile_unavailable: 'err.profile_unavailable',
  load_failed: 'err.load_failed',
  save_failed: 'err.save_failed',
  invalid_import: 'err.invalid_import',
  render_unavailable: 'err.render_unavailable',
}

/** Turn a store error code or a raw fetch failure into a sentence the user can act on. */
function errorText(code: string): string {
  const knownKey = ERROR_KEYS[code]
  if (knownKey !== undefined) return t(knownKey)
  const status = /^HTTP (\d+)$/.exec(code)?.[1]
  if (status !== undefined) return t('err.hostHttp', { status })
  return t('err.hostUnreachable', { code })
}

/**
 * Three layers: the top bar (transport, tempo, project), the track list, and the
 * editor for the selected track. Playback continues after this page unmounts.
 */
export function Editor(): JSX.Element {
  useLocale()
  const state = useProject()
  const store = getProjectStore()
  const engine = getEngine()
  const sidebarWide = useSidebarWide()
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => {
    ensureStyles()
    void store.hydrate()
    const stopPolling = store.startSyncPolling()
    const onFocusOrVisible = (): void => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        void store.checkForExternalUpdates()
      }
    }
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      stopPolling()
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
      if (!store.getState().backgroundPlayback && store.getState().playing) {
        engine.togglePlay()
      }
    }
  }, [engine, store])
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
      if (event.code.startsWith('Digit')) {
        const idx = Number(event.code.slice(5)) - 1
        const targetTrack = current.project.tracks[idx]
        if (idx >= 0 && idx < 8 && targetTrack !== undefined) {
          event.preventDefault()
          store.selectTrack(targetTrack.id)
          return
        }
      }
      if (!current.qwertyPianoEnabled) return
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
              <div style={{ fontWeight: 600 }}>{t('editor.loadFailed')}</div>
              <div className="dsyn-caption" style={{ marginTop: 4 }}>{errorText(state.error ?? 'load_failed')}</div>
            </div>
            <button type="button" className="dsyn-btn is-primary" onClick={() => { void store.hydrate() }}>
              {t('editor.retry')}
            </button>
          </>
        ) : t('editor.loading')}
      </div>
    )
  }

  const project = state.project
  const selected = project.tracks.find((track) => track.id === state.selectedTrackId) ?? project.tracks[0]
  if (selected === undefined) return <div className="dsyn dsyn-page" style={{ padding: 16 }}>{t('editor.noTracks')}</div>
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
            {t('editor.bpm')}
            <NumberField ariaLabel="BPM" min={40} max={240} value={project.bpm} width={56} onCommit={(value) => { store.setBpm(value) }} />
          </label>
          <label className="dsyn-label">
            {t('editor.bars')}
            <NumberField ariaLabel={t('editor.barsAria')} min={1} max={MAX_BARS} value={project.bars} width={48} onCommit={(value) => { store.setBars(value) }} />
          </label>
          <button
            type="button"
            aria-label={t('editor.doubleBarsAria')}
            title={t('editor.doubleBarsTitle')}
            disabled={project.bars * 2 > MAX_BARS}
            onClick={() => { store.duplicateBars() }}
            className="dsyn-btn is-small"
            style={{ fontFamily: 'var(--s-mono)' }}
          >
            ×2
          </button>
          <label className="dsyn-label" title={t('editor.swingTitle')}>
            {t('editor.swing')}
            <NumberField
              ariaLabel={t('editor.swing')}
              min={0}
              max={Math.round(MAX_SWING * 100)}
              value={Math.round((project.swing ?? 0) * 100)}
              width={48}
              onCommit={(value) => { store.setSwing(value / 100) }}
            />
          </label>
          <button
            type="button"
            aria-label={t('editor.loopAria')}
            aria-pressed={project.loop}
            title={project.loop ? t('editor.loopOn') : t('editor.loopOff')}
            onClick={() => { store.setLoop(!project.loop) }}
            className="dsyn-btn is-icon"
          >
            <Icon name="loop" />
          </button>
        </div>

        <div className="dsyn-group">
          {state.pendingToolProject !== null ? (
            <button
              type="button"
              className="dsyn-btn is-small is-active"
              title={t('editor.pendingTitle')}
              onClick={() => { void store.acceptPendingToolProject() }}
            >
              {t('editor.pendingOpen', { name: state.pendingToolProject.name })}
            </button>
          ) : null}
          {state.saveFailed && !state.saving ? (
            <button
              type="button"
              className="dsyn-btn is-small is-danger"
              aria-pressed="true"
              title={t('editor.unsavedTitle')}
              onClick={() => { void store.flush() }}
            >
              {t('editor.unsavedRetry')}
            </button>
          ) : (
            <span className="dsyn-status" aria-live="polite">{state.saving ? t('editor.saving') : t('editor.saved')}</span>
          )}
          <Popover
            label={t('editor.projectButton', { name: project.name })}
            buttonClassName="dsyn-project-button"
            menuClassName="is-panel"
            trigger={<><span>{project.name}</span><Icon name="chevronDown" size={12} /></>}
          >
            {(close) => <ProjectPanel state={state} close={close} run={run} />}
          </Popover>
          <span className="dsyn-sep" aria-hidden="true" />
          <button
            type="button"
            aria-label={t('editor.undoAria')}
            title={t('editor.undoTitle')}
            disabled={!state.canUndo}
            onClick={() => { store.undo() }}
            className="dsyn-btn is-icon"
          >
            <Icon name="undo" />
          </button>
          <Popover label={t('editor.helpLabel')} trigger={<Icon name="help" />} icon>
            {() => (
              <div className="dsyn-help">
                <dl>
                  <dt>{t('editor.helpDrawKey')}</dt><dd>{t('editor.helpDrawDesc')}</dd>
                  <dt>{t('editor.helpSeekKey')}</dt><dd>{t('editor.helpSeekDesc')}</dd>
                  <dt><kbd>{t('editor.helpSpaceKey')}</kbd></dt><dd>{t('editor.helpSpaceDesc')}</dd>
                  <dt><kbd>A</kbd>–<kbd>P</kbd></dt><dd>{t('editor.helpKeysDesc', { z: 'Z', x: 'X' })}</dd>
                  <dt><kbd>1</kbd>–<kbd>8</kbd> / <kbd>R</kbd></dt><dd>{t('editor.helpTracksDesc')}</dd>
                  <dt><kbd>⌘Z</kbd></dt><dd>{t('editor.helpUndoDesc')}</dd>
                  <dt>{t('editor.helpProjectKey')}</dt><dd>{t('editor.helpProjectDesc')}</dd>
                  <dt>{t('editor.helpBgKey')}</dt><dd>{t('editor.helpBgDesc')}</dd>
                </dl>
              </div>
            )}
          </Popover>
          <Popover
            label={t('editor.settingsLabel')}
            trigger={<Icon name="settings" />}
            icon
            menuClassName="is-panel"
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          >
            {() => <SettingsPanel state={state} />}
          </Popover>
        </div>
      </header>

      {state.showSidebarTip ? (
        <div role="status" className="dsyn-tip">
          <span>
            {t('editor.onboardingText')}
          </span>
          <div className="dsyn-group" style={{ flexShrink: 0 }}>
            <button
              type="button"
              className="dsyn-btn is-small is-primary"
              onClick={() => {
                store.dismissSidebarTip()
                setSettingsOpen(true)
              }}
            >
              {t('editor.openSettings')}
            </button>
            <button
              type="button"
              className="dsyn-btn is-small is-quiet"
              onClick={() => { store.dismissSidebarTip() }}
            >
              {t('editor.gotIt')}
            </button>
          </div>
        </div>
      ) : null}

      {state.error !== null ? (
        <div role="alert" className="dsyn-alert">
          <span>{errorText(state.error)}</span>
          <button type="button" aria-label={t('editor.dismissAlert')} onClick={() => { store.setError(null) }} className="dsyn-btn is-small is-icon is-quiet">
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}

      <div className="dsyn-body">
        <aside aria-label={t('editor.tracksAria')} className="dsyn-tracks">
          {project.tracks.map((track) => {
            const active = track.id === selected.id
            const dimmed = !isTrackAudible(track, project.tracks)
            const anySolo = project.tracks.some((t) => t.solo === true)
            const effectiveMuted = track.mute || (anySolo && track.solo !== true)
            return (
              <div
                key={track.id}
                onClick={() => { store.selectTrack(track.id) }}
                className={`dsyn-track${active ? ' is-selected' : ''}${dimmed ? ' is-muted' : ''}`}
                style={{ '--s-track': trackColor(track.instrumentId) } as React.CSSProperties}
              >
                <div className="dsyn-track-row">
                  <input
                    aria-label={t('editor.trackNameAria', { name: track.name })}
                    value={track.name}
                    onFocus={() => { store.selectTrack(track.id) }}
                    onChange={(event) => {
                      store.updateTrack(track.id, { name: event.target.value.slice(0, 64) || track.name })
                    }}
                    className="dsyn-field is-quiet dsyn-track-name"
                  />
                  <button
                    type="button"
                    aria-label={t('editor.soloAria', { name: track.name })}
                    aria-pressed={track.solo === true}
                    title={track.solo ? t('editor.unsoloTitle') : t('editor.soloTitle')}
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
                    aria-label={t('editor.muteAria', { name: track.name })}
                    aria-pressed={effectiveMuted}
                    title={track.mute ? t('editor.unmuteTitle') : effectiveMuted ? t('editor.mutedBySoloTitle') : t('editor.muteTitle')}
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
                    aria-label={t('editor.removeAria', { name: track.name })}
                    title={t('editor.removeTitle')}
                    disabled={project.tracks.length <= 1}
                    onClick={(event) => {
                      event.stopPropagation()
                      store.removeTrack(track.id)
                    }}
                    className="dsyn-btn is-small is-icon is-quiet is-danger-hover"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div className="dsyn-track-row">
                  <select
                    aria-label={t('editor.trackPatchAria', { name: track.name })}
                    value={track.instrumentId}
                    onChange={(event) => { store.updateTrack(track.id, { instrumentId: event.target.value }) }}
                    className="dsyn-field is-quiet dsyn-track-inst"
                  >
                    {instruments.map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrumentLabel(instrument.id).split(' ')[0]}
                      </option>
                    ))}
                    {instruments.some((instrument) => instrument.id === track.instrumentId)
                      ? null
                      : <option value={track.instrumentId}>{track.instrumentId}</option>}
                  </select>
                  <input
                    aria-label={t('editor.trackGainAria', { name: track.name })}
                    title={t('editor.trackGainTitle', { percent: Math.round(track.gain * 100) })}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={track.gain}
                    onChange={(event) => { store.updateTrack(track.id, { gain: Number(event.target.value) }) }}
                    className="dsyn-range"
                    style={rangeFill(track.gain, 0, 1)}
                  />
                  <input
                    aria-label={t('editor.trackPanAria', { name: track.name })}
                    title={
                      Math.abs(track.pan ?? 0) < 0.01
                        ? t('editor.trackPanCenterTitle')
                        : (track.pan ?? 0) < 0
                          ? t('editor.trackPanLeftTitle', { percent: Math.round(Math.abs(track.pan ?? 0) * 100) })
                          : t('editor.trackPanRightTitle', { percent: Math.round((track.pan ?? 0) * 100) })
                    }
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={track.pan ?? 0}
                    onChange={(event) => { store.updateTrack(track.id, { pan: Number(event.target.value) }) }}
                    onDoubleClick={() => { store.updateTrack(track.id, { pan: 0 }) }}
                    className="dsyn-range"
                    style={{ ...rangeFill(track.pan ?? 0, -1, 1), width: 52, flex: 'none' }}
                  />
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="dsyn-btn is-quiet dsyn-add"
            disabled={project.tracks.length >= MAX_TRACKS}
            title={project.tracks.length >= MAX_TRACKS ? t('editor.maxTracksTitle', { max: MAX_TRACKS }) : undefined}
            onClick={() => { store.addTrack() }}
          >
            <Icon name="plus" />
            {t('editor.addTrack')}
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
      <span>{t('editor.deletedToast', { name })}</span>
      <button type="button" className="dsyn-btn is-small" onClick={onUndo}>{t('editor.undo')}</button>
      <button type="button" aria-label={t('editor.close')} className="dsyn-btn is-small is-icon is-quiet" onClick={onDismiss}>
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

const SIDECHAIN_OPTIONS: ReadonlyArray<{ id: SidechainStrength; labelKey: MessageKey }> = [
  { id: 'off', labelKey: 'settings.sidechainOff' },
  { id: 'normal', labelKey: 'settings.sidechainNormal' },
  { id: 'strong', labelKey: 'settings.sidechainStrong' },
]

const LOCALE_OPTIONS: ReadonlyArray<{ id: LocaleSetting; labelKey: MessageKey }> = [
  { id: 'auto', labelKey: 'settings.langAuto' },
  { id: 'zh-CN', labelKey: 'settings.langZh' },
  { id: 'en', labelKey: 'settings.langEn' },
]

function SettingSwitchRow({
  name,
  description,
  checked,
  onToggle,
}: {
  name: string
  description: string
  checked: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <div className="dsyn-setting-row">
      <div className="dsyn-setting-copy">
        <div className="dsyn-setting-name">{name}</div>
        <div className="dsyn-caption">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={name}
        onClick={onToggle}
        className={`dsyn-switch${checked ? ' is-on' : ''}`}
      >
        <span className="dsyn-switch-thumb" />
      </button>
    </div>
  )
}

function SettingsPanel({ state }: { state: ReturnType<typeof useProject> }): JSX.Element {
  useLocale()
  const store = getProjectStore()
  const localeSetting = getLocaleSetting()
  const volumePercent = Math.round(state.masterVolume * 100)

  return (
    <div className="dsyn-settings">
      <div className="dsyn-settings-title">{t('settings.languageTitle')}</div>
      <div className="dsyn-setting-row is-stack">
        <div className="dsyn-setting-head">
          <span className="dsyn-setting-name">{t('settings.languageName')}</span>
          <div className="dsyn-seg" role="tablist" aria-label={t('settings.languageName')}>
            {LOCALE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={localeSetting === option.id}
                onClick={() => { setLocaleSetting(option.id) }}
                style={{ height: 22, padding: '0 8px', fontSize: 11 }}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="dsyn-caption">{t('settings.languageDesc')}</div>
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-settings-title">{t('settings.audioTitle')}</div>
      <SettingSwitchRow
        name={t('settings.sidebarTransportName')}
        description={t('settings.sidebarTransportDesc')}
        checked={state.showSidebarTransport}
        onToggle={() => { store.setShowSidebarTransport(!state.showSidebarTransport) }}
      />
      <SettingSwitchRow
        name={t('settings.bgPlayName')}
        description={t('settings.bgPlayDesc')}
        checked={state.backgroundPlayback}
        onToggle={() => { store.setBackgroundPlayback(!state.backgroundPlayback) }}
      />
      <div className="dsyn-setting-row is-stack">
        <div className="dsyn-setting-head">
          <span className="dsyn-setting-name">{t('settings.masterVolName')}</span>
          <output className="dsyn-setting-val">{volumePercent}%</output>
        </div>
        <input
          aria-label={t('settings.masterVolName')}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.masterVolume}
          onChange={(event) => { store.setMasterVolume(Number(event.target.value)) }}
          className="dsyn-range"
          style={rangeFill(state.masterVolume, 0, 1)}
        />
      </div>
      <div className="dsyn-setting-row is-stack">
        <div className="dsyn-setting-head">
          <span className="dsyn-setting-name">{t('settings.sidechainName')}</span>
          <div className="dsyn-seg" role="tablist" aria-label={t('settings.sidechainName')}>
            {SIDECHAIN_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={state.sidechainStrength === option.id}
                onClick={() => { store.setSidechainStrength(option.id) }}
                style={{ height: 22, padding: '0 8px', fontSize: 11 }}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="dsyn-caption">{t('settings.sidechainDesc')}</div>
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-settings-title">{t('settings.prefTitle')}</div>
      <SettingSwitchRow
        name={t('settings.auditionName')}
        description={t('settings.auditionDesc')}
        checked={state.auditionOnDraw}
        onToggle={() => { store.setAuditionOnDraw(!state.auditionOnDraw) }}
      />
      <SettingSwitchRow
        name={t('settings.qwertyName')}
        description={t('settings.qwertyDesc')}
        checked={state.qwertyPianoEnabled}
        onToggle={() => { store.setQwertyPianoEnabled(!state.qwertyPianoEnabled) }}
      />
      <SettingSwitchRow
        name={t('settings.ghostName')}
        description={t('settings.ghostDesc')}
        checked={state.showGhostNotes}
        onToggle={() => { store.setShowGhostNotes(!state.showGhostNotes) }}
      />
      <SettingSwitchRow
        name={t('settings.scopeName')}
        description={t('settings.scopeDesc')}
        checked={state.showOscilloscope}
        onToggle={() => { store.setShowOscilloscope(!state.showOscilloscope) }}
      />

      <div className="dsyn-menu-rule" />
      <div className="dsyn-settings-title">{t('settings.devicesTitle')}</div>
      <div className="dsyn-setting-row is-stack">
        <div className="dsyn-setting-head">
          <span className="dsyn-setting-name">{t('settings.midiName')}</span>
          <span className="dsyn-setting-badge">
            {state.midiDevices.length > 0 ? t('settings.midiConnected', { count: state.midiDevices.length }) : t('settings.midiDisconnected')}
          </span>
        </div>
        <div className="dsyn-caption">
          {state.midiDevices.length > 0
            ? state.midiDevices.join(', ')
            : t('settings.midiNoneDesc')}
        </div>
      </div>
      <div className="dsyn-setting-actions">
        <button
          type="button"
          className="dsyn-btn is-small"
          onClick={() => {
            store.resetSettings()
            resetLocaleCache()
          }}
        >
          {t('settings.reset')}
        </button>
      </div>

      <div className="dsyn-menu-rule" />
      <div className="dsyn-settings-title">{t('settings.aboutTitle')}</div>
      <div className="dsyn-about">
        <div className="dsyn-about-head">
          <strong>{t('settings.aboutName')}</strong>
          <span className="dsyn-version">v{VERSION}</span>
        </div>
        <p className="dsyn-caption" style={{ margin: 0 }}>
          {t('settings.aboutDesc')}
        </p>
        <dl className="dsyn-about-meta">
          <dt>{t('settings.aboutLicense')}</dt><dd>MIT License</dd>
          <dt>{t('settings.aboutCopyright')}</dt><dd>© 2026 Yishan. All rights reserved.</dd>
          <dt>{t('settings.aboutRepo')}</dt>
          <dd>
            <a
              href="https://github.com/yishan/dsh-synthesizer"
              target="_blank"
              rel="noreferrer"
            >
              github.com/yishan/dsh-synthesizer
            </a>
          </dd>
        </dl>
      </div>
    </div>
  )
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    getProjectStore().setError(error instanceof Error ? error.message : 'save_failed')
  }
}
