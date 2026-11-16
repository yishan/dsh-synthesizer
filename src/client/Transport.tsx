import { useEffect, useState } from 'react'
import { getEngine } from './engine.ts'
import { t, useLocale } from './i18n.ts'
import { Icon } from './icons.tsx'
import { setSidebarWide } from './sidebar-state.ts'
import { ensureStyles } from './styles.ts'
import { useProject } from './use-project.ts'

/**
 * Play, stop/rewind, mute, and the bar.beat position.
 *
 * `page` is the editor's own transport. `sidebar` stays mounted while the
 * editor is closed: one row shaped like the sidebar's own entries, with the
 * project name between the controls. `wide` is false when the sidebar is
 * collapsed, where only play and mute remain.
 */
export function Transport({
  variant = 'sidebar',
  wide = true,
}: {
  variant?: 'page' | 'sidebar'
  wide?: boolean
}): JSX.Element | null {
  useLocale()
  const state = useProject()
  const engine = getEngine()
  const [beatLabel, setBeatLabel] = useState('1.1')
  const page = variant === 'page'
  useEffect(() => { ensureStyles() }, [])
  useEffect(() => {
    if (!page) setSidebarWide(wide)
  }, [page, wide])

  useEffect(() => {
    let raf = 0
    const update = (): void => {
      const beat = engine.getCurrentBeat()
      setBeatLabel(`${Math.floor(beat / 4) + 1}.${(Math.floor(beat) % 4) + 1}`)
      if (state.playing) raf = requestAnimationFrame(update)
    }
    update()
    return () => { if (raf !== 0) cancelAnimationFrame(raf) }
  }, [engine, state.playing, state.project.bpm, state.project.bars])

  const playLabel = state.playing ? t('transport.pause') : t('transport.play')
  const muteLabel = state.muted ? t('transport.unmute') : t('transport.mute')
  const quiet = page ? '' : ' is-quiet'

  const play = (
    <button
      type="button"
      aria-label={playLabel}
      title={page ? t('transport.playShortcut', { label: playLabel }) : t('transport.sidebarPlay', { label: playLabel })}
      data-play={state.playing ? 'playing' : 'stopped'}
      onClick={() => { engine.togglePlay() }}
      className={`dsyn-btn is-icon${page ? ' is-primary' : ' is-quiet'}`}
    >
      <Icon name={state.playing ? 'pause' : 'play'} />
    </button>
  )
  const stop = (
    <button
      type="button"
      aria-label={t('transport.stopAria')}
      title={t('transport.stopTitle')}
      onClick={() => { engine.stopAndRewind() }}
      className={`dsyn-btn is-icon${quiet}`}
    >
      <Icon name="stop" />
    </button>
  )
  const mute = (
    <button
      type="button"
      aria-label={muteLabel}
      aria-pressed={state.muted}
      title={muteLabel}
      data-muted={state.muted ? 'true' : 'false'}
      onClick={() => { engine.toggleMute() }}
      className={`dsyn-btn is-icon is-danger${quiet}`}
    >
      <Icon name={state.muted ? 'muted' : 'volume'} />
    </button>
  )
  const position = (
    <span
      aria-label={t('transport.positionAria')}
      title={t('transport.positionTitle')}
      className={`dsyn-readout${state.playing ? ' is-live' : ''}`}
    >
      {beatLabel}
    </span>
  )

  if (page) {
    return (
      <div data-transport="dsh-synthesizer" className="dsyn dsyn-transport">
        {play}{stop}{mute}{position}
      </div>
    )
  }
  if (!state.showSidebarTransport) {
    return null
  }
  if (!wide) {
    return (
      <div data-transport="dsh-synthesizer" className="dsyn dsyn-side is-rail">
        {play}{mute}
      </div>
    )
  }
  return (
    <div
      data-transport="dsh-synthesizer"
      role="group"
      aria-label={t('transport.groupAria')}
      className={`dsyn dsyn-side${state.playing ? ' is-playing' : ''}`}
    >
      {play}
      {stop}
      <span className="dsyn-side-name" title={state.project.name}>{state.project.name}</span>
      {position}
      {mute}
    </div>
  )
}
