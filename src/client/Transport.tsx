import { useEffect, useState } from 'react'
import { getEngine } from './engine.ts'
import { Icon } from './icons.tsx'
import { ensureStyles } from './styles.ts'
import { useProject } from './use-project.ts'

/**
 * Play, stop/rewind, mute, and the bar.beat position.
 * `page` is the editor's own transport. `sidebar` is the compact one that stays
 * mounted while the editor is closed; `wide` is false when the sidebar is collapsed.
 */
export function Transport({
  variant = 'sidebar',
  wide = true,
}: {
  variant?: 'page' | 'sidebar'
  wide?: boolean
}): JSX.Element {
  const state = useProject()
  const engine = getEngine()
  const [beatLabel, setBeatLabel] = useState('1.1')
  useEffect(() => { ensureStyles() }, [])

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

  const page = variant === 'page'
  const playLabel = state.playing ? '暂停' : '播放'
  const muteLabel = state.muted ? '取消静音' : '静音'
  return (
    <div
      data-transport="dsh-synthesizer"
      className={`dsyn dsyn-transport${!page && !wide ? ' is-stacked' : ''}`}
    >
      <button
        type="button"
        aria-label={playLabel}
        title={page ? `${playLabel}（空格）` : `合成器：${playLabel}`}
        data-play={state.playing ? 'playing' : 'stopped'}
        onClick={() => { engine.togglePlay() }}
        className={`dsyn-btn is-icon${page ? ' is-primary' : ''}`}
      >
        <Icon name={state.playing ? 'pause' : 'play'} />
      </button>
      {page || wide ? (
        <button
          type="button"
          aria-label="停止并回到开头"
          title="停止并回到第一拍"
          onClick={() => { engine.stopAndRewind() }}
          className="dsyn-btn is-icon"
        >
          <Icon name="stop" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={muteLabel}
        aria-pressed={state.muted}
        title={muteLabel}
        data-muted={state.muted ? 'true' : 'false'}
        onClick={() => { engine.toggleMute() }}
        className="dsyn-btn is-icon is-danger"
      >
        <Icon name={state.muted ? 'muted' : 'volume'} />
      </button>
      {page || wide ? (
        <span
          aria-label="播放位置"
          title="播放位置：小节.拍"
          className={`dsyn-readout${state.playing ? ' is-live' : ''}`}
        >
          {beatLabel}
        </span>
      ) : null}
    </div>
  )
}
