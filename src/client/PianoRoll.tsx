import { useEffect, useRef, useState } from 'react'
import {
  BEATS_PER_BAR,
  DRUM_PITCHES,
  PITCH_MAX,
  PITCH_MIN,
  STEP_BEATS,
  type Note,
  type Track,
} from '../model.ts'
import { auditionBase } from './audition.ts'
import { getEngine } from './engine.ts'
import { Icon } from './icons.tsx'
import { DRUM_LABELS } from './instruments.ts'
import {
  addDrumFill,
  buildScaleChord,
  DRUM_PATTERN_LIST,
  generateDrumPattern,
  generateMelodicPattern,
  humanizeNotes,
  isPitchInScale,
  MELODIC_PATTERN_LIST,
  ROOT_NOTES,
  SCALES,
  transposeNotes,
  type ChordBrushMode,
} from './presets.ts'
import { getProjectStore } from './project-store.ts'
import { trackColor } from './styles.ts'
import { SynthControls } from './SynthControls.tsx'
import { useProject } from './use-project.ts'

const CELL = 20
const MELODIC_ROW = 22
const DRUM_ROW = 32
const KEY_LABEL_WIDTH = 72
const RULER_HEIGHT = 24
const VELOCITY_HEIGHT = 44
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10])
const DRUM_KEY_HINTS: Record<number, string> = { 36: 'A', 37: 'W', 38: 'S', 39: 'E', 42: 'T', 45: 'H', 46: 'U', 49: 'O' }
const QWERTY_HINT_LABELS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P']

export function pitchLabel(pitch: number, drums: boolean): string {
  if (drums) {
    const info = DRUM_LABELS[pitch]
    if (info !== undefined) return info.name.split(' ')[0] ?? info.name
  }
  const name = NAMES[pitch % 12] ?? 'C'
  return `${name}${Math.floor(pitch / 12) - 1}`
}

interface DragGesture {
  mode: 'draw' | 'erase'
  pitch: number
  startStep: number
  currentStep: number
}

type DrawerTab = 'sound' | 'arrange' | 'keys'

const TABS: ReadonlyArray<{ id: DrawerTab; label: string }> = [
  { id: 'sound', label: '音色' },
  { id: 'arrange', label: '编曲' },
  { id: 'keys', label: '弹奏' },
]

const BRUSH_MODES: ReadonlyArray<{ id: ChordBrushMode; label: string }> = [
  { id: 'single', label: '单音' },
  { id: 'triad', label: '三和弦' },
  { id: 'seventh', label: '七和弦' },
]

/**
 * Editor for the selected track: the note grid, with a drawer underneath for
 * everything that acts on the track (sound, pattern tools, live playing).
 * A drum track gets an 8-row step grid; other tracks get a piano roll with
 * drag-to-length notes, scale shading, and ghost notes from the other tracks.
 */
export function PianoRoll({ track, bars, playing }: { track: Track; bars: number; playing: boolean }): JSX.Element {
  const state = useProject()
  const store = getProjectStore()
  const engine = getEngine()
  const scroller = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const rulerPlayheadRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragGesture | null>(null)
  const [activeKeyPitch, setActiveKeyPitch] = useState<number | null>(null)
  const [tab, setTab] = useState<DrawerTab>('sound')
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [velocityDrag, setVelocityDrag] = useState(false)
  const [brushMode, setBrushMode] = useState<ChordBrushMode>('single')

  const drums = track.instrumentId === 'drums'
  const hasFirstBarNotes = track.notes.some((n) => n.startBeat < BEATS_PER_BAR)
  const rowHeight = drums ? DRUM_ROW : MELODIC_ROW
  const steps = bars * 16
  const pitches: number[] = []
  if (drums) {
    for (const p of DRUM_PITCHES) pitches.push(p)
  } else {
    for (let pitch = PITCH_MAX; pitch >= PITCH_MIN; pitch -= 1) pitches.push(pitch)
  }

  // Centre the roll around C4 when switching to a melodic track.
  useEffect(() => {
    const node = scroller.current
    if (node === null) return
    node.scrollTop = drums ? 0 : Math.max(0, (PITCH_MAX - 68) * MELODIC_ROW - 30)
  }, [drums, track.id])

  // Playhead follows the audio clock without re-rendering React.
  useEffect(() => {
    let raf = 0
    const updatePlayhead = (): void => {
      const x = KEY_LABEL_WIDTH + engine.getCurrentBeat() * 4 * CELL
      if (playheadRef.current !== null) playheadRef.current.style.transform = `translateX(${x}px)`
      if (rulerPlayheadRef.current !== null) rulerPlayheadRef.current.style.transform = `translateX(${x}px)`
      if (state.playing) raf = requestAnimationFrame(updatePlayhead)
    }
    updatePlayhead()
    return () => { if (raf !== 0) cancelAnimationFrame(raf) }
  }, [engine, state.playing, state.project.bpm, bars])

  // Finish a drag on mouseup anywhere in the window.
  useEffect(() => {
    if (drag === null) return
    const onWindowUp = (): void => {
      if (drag.mode === 'draw') {
        const minStep = Math.min(drag.startStep, drag.currentStep)
        const maxStep = Math.max(drag.startStep, drag.currentStep)
        const startBeat = minStep * STEP_BEATS
        const durationBeats = drums ? STEP_BEATS : Math.max(STEP_BEATS, (maxStep - minStep + 1) * STEP_BEATS)
        if (!drums && brushMode !== 'single') {
          const chordPitches = buildScaleChord(drag.pitch, state.scaleRoot, state.scaleId, brushMode)
          store.upsertTrackNotes(
            track.id,
            chordPitches.map((pitch) => ({ pitch, startBeat, durationBeats, velocity: 96 })),
          )
        } else {
          store.upsertTrackNote(track.id, {
            pitch: drag.pitch,
            startBeat,
            durationBeats,
            velocity: 104,
          })
        }
      }
      engine.previewUp(drag.pitch)
      setDrag(null)
    }
    window.addEventListener('mouseup', onWindowUp)
    return () => { window.removeEventListener('mouseup', onWindowUp) }
  }, [brushMode, drag, drums, engine, state.scaleId, state.scaleRoot, store, track.id])

  // Velocity lane: one bar per step that has notes; a chord shares its bar.
  const stepVelocity = new Map<number, number>()
  for (const note of track.notes) {
    const step = Math.round(note.startBeat / STEP_BEATS)
    stepVelocity.set(step, Math.max(stepVelocity.get(step) ?? 0, note.velocity))
  }
  const editVelocity = (event: React.MouseEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const step = Math.floor((event.clientX - bounds.left) / CELL)
    if (!stepVelocity.has(step)) return
    const level = 1 - (event.clientY - bounds.top) / bounds.height
    store.setStepVelocity(track.id, step * STEP_BEATS, Math.round(level * 127))
  }
  useEffect(() => {
    if (!velocityDrag) return
    const stop = (): void => { setVelocityDrag(false) }
    window.addEventListener('mouseup', stop)
    return () => { window.removeEventListener('mouseup', stop) }
  }, [velocityDrag])

  const ghostNotes: Note[] = (!drums && state.showGhostNotes)
    ? state.project.tracks
        .filter((t) => t.id !== track.id && !t.mute && t.instrumentId !== 'drums')
        .flatMap((t) => t.notes)
    : []

  const basePitch = auditionBase(track.instrumentId, state.octaveOffset)

  const handleLaneMouseDown = (event: React.MouseEvent<HTMLDivElement>, pitch: number): void => {
    if (event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const step = Math.floor((event.clientX - bounds.left) / CELL)
    if (step < 0 || step >= steps) return
    const beat = step * STEP_BEATS

    const existing = track.notes.find(
      (n) => n.pitch === pitch && n.startBeat <= beat + 1e-9 && n.startBeat + n.durationBeats > beat + 1e-9,
    )
    if (existing !== undefined) {
      store.removeTrackNote(track.id, pitch, beat)
      setDrag({ mode: 'erase', pitch, startStep: step, currentStep: step })
      return
    }
    if (drums) {
      store.toggleNote(track.id, pitch, beat)
      engine.previewDown(track.instrumentId, pitch, track.synth)
      setTimeout(() => { engine.previewUp(pitch) }, 120)
      return
    }
    engine.previewDown(track.instrumentId, pitch, track.synth)
    setDrag({ mode: 'draw', pitch, startStep: step, currentStep: step })
  }

  const handleLaneMouseMove = (event: React.MouseEvent<HTMLDivElement>, pitch: number): void => {
    if (drag === null) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const step = Math.max(0, Math.min(steps - 1, Math.floor((event.clientX - bounds.left) / CELL)))
    if (drag.mode === 'erase') {
      if (pitch === drag.pitch) store.removeTrackNote(track.id, pitch, step * STEP_BEATS)
      return
    }
    if (step !== drag.currentStep) setDrag({ ...drag, currentStep: step })
  }

  const noteBox = (startBeat: number, durationBeats: number): React.CSSProperties => ({
    left: startBeat * 4 * CELL + 1,
    width: Math.max(6, durationBeats * 4 * CELL - 2),
  })
  const laneGrid: React.CSSProperties = {
    width: steps * CELL,
    height: rowHeight,
    backgroundSize: `${CELL * 16}px 100%, ${CELL * 4}px 100%, ${CELL}px 100%`,
  }

  return (
    <div className="dsyn-editor" style={{ '--s-track': trackColor(track.instrumentId) } as React.CSSProperties}>
      <div
        ref={scroller}
        tabIndex={0}
        role="application"
        aria-label={drums ? `${track.name} 鼓机步进器` : `${track.name} 钢琴卷帘`}
        data-piano-roll="dsh-synthesizer"
        className="dsyn-roll"
      >
        <div style={{ width: KEY_LABEL_WIDTH + steps * CELL, position: 'relative' }}>
          <div className="dsyn-ruler">
            <div className="dsyn-corner" style={{ width: KEY_LABEL_WIDTH, flex: `0 0 ${KEY_LABEL_WIDTH}px` }}>
              小节
            </div>
            <div
              role="slider"
              aria-label="播放位置"
              aria-valuemin={0}
              aria-valuemax={bars * 4}
              aria-valuenow={0}
              tabIndex={-1}
              title="点击跳到该位置"
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect()
                const step = Math.max(0, Math.min(steps - 1, Math.floor((event.clientX - bounds.left) / CELL)))
                engine.seekBeat(step * STEP_BEATS)
              }}
              className="dsyn-bars"
              style={{ width: steps * CELL }}
            >
              {Array.from({ length: bars }, (_, barIdx) => (
                <div key={barIdx} className="dsyn-bar" style={{ width: 16 * CELL, flex: `0 0 ${16 * CELL}px` }}>
                  <b>{barIdx + 1}</b>
                  {[1, 2, 3].map((beatOffset) => (
                    <span key={beatOffset} style={{ left: beatOffset * 4 * CELL + 6 }}>
                      {barIdx + 1}.{beatOffset + 1}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div ref={rulerPlayheadRef} className="dsyn-playhead" style={{ top: 0, height: RULER_HEIGHT, zIndex: 6 }} />
          </div>

          <div ref={playheadRef} className="dsyn-playhead" style={{ top: RULER_HEIGHT, bottom: 0, zIndex: 3 }} />

          {pitches.map((pitch) => {
            const semitone = pitch % 12
            const isBlack = !drums && BLACK_SEMITONES.has(semitone)
            const isRoot = !drums && semitone === state.scaleRoot % 12
            const inScale = drums || isPitchInScale(pitch, state.scaleRoot, state.scaleId)
            const rowNotes = track.notes.filter((note) => note.pitch === pitch)
            const rowGhosts = ghostNotes.filter((note) => note.pitch === pitch)
            const label = pitchLabel(pitch, drums)
            const keyClass = `dsyn-key${isBlack ? ' is-black' : ''}${isRoot ? ' is-root' : ''}${!drums && semitone === 0 ? ' is-c' : ''}${activeKeyPitch === pitch ? ' is-active' : ''}`
            const laneClass = `dsyn-lane${isRoot ? ' is-root' : !inScale ? ' is-off' : isBlack ? ' is-black' : ''}`
            const draft = drag !== null && drag.mode === 'draw' && drag.pitch === pitch
              ? noteBox(
                  Math.min(drag.startStep, drag.currentStep) * STEP_BEATS,
                  (Math.abs(drag.currentStep - drag.startStep) + 1) * STEP_BEATS,
                )
              : null

            return (
              <div key={pitch} className="dsyn-row" style={{ height: rowHeight }}>
                <div
                  role="button"
                  tabIndex={-1}
                  aria-label={`试听 ${label}`}
                  title={isRoot ? `${label}（调式主音）` : undefined}
                  onMouseDown={() => {
                    engine.previewDown(track.instrumentId, pitch, track.synth)
                    setActiveKeyPitch(pitch)
                  }}
                  onMouseUp={() => {
                    engine.previewUp(pitch)
                    setActiveKeyPitch(null)
                  }}
                  onMouseLeave={() => {
                    engine.previewUp(pitch)
                    if (activeKeyPitch === pitch) setActiveKeyPitch(null)
                  }}
                  className={keyClass}
                  style={{ width: KEY_LABEL_WIDTH, flex: `0 0 ${KEY_LABEL_WIDTH}px`, height: rowHeight }}
                >
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</span>
                  {drums ? <kbd>{DRUM_KEY_HINTS[pitch] ?? ''}</kbd> : isRoot ? <i aria-hidden="true" /> : null}
                </div>

                <div
                  role="button"
                  aria-label={label}
                  data-pitch={pitch}
                  className={laneClass}
                  style={laneGrid}
                  onMouseDown={(event) => { handleLaneMouseDown(event, pitch) }}
                  onMouseMove={(event) => { handleLaneMouseMove(event, pitch) }}
                >
                  {rowGhosts.map((ghost, idx) => (
                    <div
                      key={`ghost:${idx}:${ghost.startBeat}`}
                      className="dsyn-note is-ghost"
                      style={noteBox(ghost.startBeat, ghost.durationBeats)}
                    />
                  ))}
                  {rowNotes.map((note) => (
                    <div
                      key={`${note.startBeat}:${note.durationBeats}`}
                      className="dsyn-note"
                      style={{ ...noteBox(note.startBeat, note.durationBeats), opacity: 0.4 + 0.6 * (note.velocity / 127) }}
                    />
                  ))}
                  {draft !== null ? <div className="dsyn-note is-draft" style={draft} /> : null}
                </div>
              </div>
            )
          })}

          <div className="dsyn-velocity" style={{ height: VELOCITY_HEIGHT }}>
            <div className="dsyn-key" style={{ width: KEY_LABEL_WIDTH, flex: `0 0 ${KEY_LABEL_WIDTH}px`, cursor: 'default' }}>
              力度
            </div>
            <div
              role="group"
              aria-label="力度"
              title="上下拖动调整这一步的力度"
              className="dsyn-velocity-lane"
              style={{ width: steps * CELL, backgroundSize: `${CELL * 16}px 100%, ${CELL * 4}px 100%` }}
              onMouseDown={(event) => {
                if (event.button !== 0) return
                setVelocityDrag(true)
                editVelocity(event)
              }}
              onMouseMove={(event) => { if (velocityDrag) editVelocity(event) }}
            >
              {[...stepVelocity].map(([step, velocity]) => (
                <div
                  key={step}
                  className="dsyn-velocity-bar"
                  title={`力度 ${velocity}`}
                  style={{ left: step * CELL + 3, width: CELL - 6, height: `${(velocity / 127) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="dsyn-drawer" aria-label={`${track.name} 工具`}>
        <div className="dsyn-tabs">
          <div className="dsyn-line">
            <div className="dsyn-seg" role="tablist">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={drawerOpen && tab === item.id}
                  onClick={() => {
                    setDrawerOpen(!(drawerOpen && tab === item.id))
                    setTab(item.id)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {drums ? null : (
              <div className="dsyn-seg" role="group" aria-label="落笔模式" title="点击网格时画单音，或自动按当前调式生成顺阶三和弦 / 七和弦">
                {BRUSH_MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={brushMode === item.id}
                    onClick={() => { setBrushMode(item.id) }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="dsyn-line">
            <button
              type="button"
              aria-pressed={state.recordArm}
              title="开启后，播放时弹奏的音会记入当前音轨"
              onClick={() => { store.setRecordArm(!state.recordArm) }}
              className="dsyn-btn is-danger"
            >
              <span className="dsyn-rec-dot" aria-hidden="true" />
              {state.recordArm ? '录制中' : '边弹边录'}
            </button>
            <button
              type="button"
              aria-label={drawerOpen ? '收起工具栏' : '展开工具栏'}
              aria-expanded={drawerOpen}
              onClick={() => { setDrawerOpen(!drawerOpen) }}
              className="dsyn-btn is-icon is-quiet"
            >
              <Icon name={drawerOpen ? 'chevronDown' : 'chevronUp'} />
            </button>
          </div>
        </div>

        {drawerOpen ? (
          <div className="dsyn-panel" role="tabpanel">
            {tab === 'sound' ? <SynthControls track={track} playing={playing} /> : null}

            {tab === 'arrange' ? (
              <>
                {drums ? null : (
                  <div className="dsyn-line">
                    <span className="dsyn-label">调式</span>
                    <select
                      aria-label="根音"
                      value={state.scaleRoot}
                      onChange={(event) => { store.setScale(Number(event.target.value), state.scaleId) }}
                      className="dsyn-field"
                    >
                      {ROOT_NOTES.map((root) => <option key={root.semitone} value={root.semitone}>{root.name}</option>)}
                    </select>
                    <select
                      aria-label="音阶"
                      value={state.scaleId}
                      onChange={(event) => { store.setScale(state.scaleRoot, event.target.value) }}
                      className="dsyn-field"
                    >
                      {SCALES.map((scale) => <option key={scale.id} value={scale.id}>{scale.name.split(' ')[0]}</option>)}
                    </select>
                    <span className="dsyn-caption">调外的音在网格里显示为深色行</span>
                  </div>
                )}
                <div className="dsyn-spread">
                  <div className="dsyn-line">
                    <span className="dsyn-label">{drums ? '填入节奏' : '生成乐句'}</span>
                    {drums
                      ? DRUM_PATTERN_LIST.map((pattern) => (
                          <button
                            key={pattern.id}
                            type="button"
                            title="替换本轨全部音符（可撤销）"
                            onClick={() => { store.setTrackNotes(track.id, generateDrumPattern(pattern.id, bars)) }}
                            className="dsyn-btn"
                          >
                            {pattern.label}
                          </button>
                        ))
                      : MELODIC_PATTERN_LIST.map((pattern) => (
                          <button
                            key={pattern.id}
                            type="button"
                            title="替换本轨全部音符（可撤销）"
                            onClick={() => {
                              store.setTrackNotes(
                                track.id,
                                generateMelodicPattern(pattern.id, bars, state.scaleRoot, state.scaleId),
                              )
                            }}
                            className="dsyn-btn"
                          >
                            {pattern.label}
                          </button>
                        ))}
                  </div>
                  <div className="dsyn-line">
                    {drums ? null : (
                      <>
                        <button
                          type="button"
                          onClick={() => { store.setTrackNotes(track.id, transposeNotes(track.notes, -12)) }}
                          className="dsyn-btn"
                        >
                          降八度
                        </button>
                        <button
                          type="button"
                          onClick={() => { store.setTrackNotes(track.id, transposeNotes(track.notes, 12)) }}
                          className="dsyn-btn"
                        >
                          升八度
                        </button>
                        <button
                          type="button"
                          aria-pressed={state.showGhostNotes}
                          title="在网格里淡显其它音轨的音符"
                          onClick={() => { store.setShowGhostNotes(!state.showGhostNotes) }}
                          className="dsyn-btn"
                        >
                          显示其它轨
                        </button>
                      </>
                    )}
                    {drums ? (
                      <button
                        type="button"
                        title="在最后一小节末尾半拍生成军鼓/通鼓加花过渡（可撤销）"
                        onClick={() => { store.setTrackNotes(track.id, addDrumFill(track.notes, bars)) }}
                        className="dsyn-btn"
                      >
                        末尾加花
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title="给当前音轨音符施加轻微随机力度起伏，增强律动质感（可撤销）"
                      disabled={track.notes.length === 0}
                      onClick={() => { store.setTrackNotes(track.id, humanizeNotes(track.notes)) }}
                      className="dsyn-btn"
                    >
                      人性化力度
                    </button>
                    <button
                      type="button"
                      title="把第 1 小节的音符平铺复制到后面所有小节（可撤销）"
                      disabled={bars <= 1 || !hasFirstBarNotes}
                      onClick={() => { store.repeatFirstBar(track.id) }}
                      className="dsyn-btn"
                    >
                      铺满全曲
                    </button>
                    <button
                      type="button"
                      title="删除本轨全部音符（可撤销）"
                      disabled={track.notes.length === 0}
                      onClick={() => { store.setTrackNotes(track.id, []) }}
                      className="dsyn-btn"
                    >
                      清空本轨
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {tab === 'keys' ? (
              drums ? (
                <span className="dsyn-caption">
                  直接按键盘 A W S E T H U O 敲击对应鼓件{state.midiDevices.length > 0 ? ` · 已连 MIDI: ${state.midiDevices[0]}` : ''}
                </span>
              ) : (
                <>
                  <div className="dsyn-spread">
                    <div className="dsyn-line">
                      <button
                        type="button"
                        aria-label="降低八度"
                        onClick={() => { store.setOctaveOffset(state.octaveOffset - 1) }}
                        className="dsyn-btn"
                      >
                        低八度 <kbd>Z</kbd>
                      </button>
                      <span className="dsyn-readout">{pitchLabel(basePitch, false)}</span>
                      <button
                        type="button"
                        aria-label="升高八度"
                        onClick={() => { store.setOctaveOffset(state.octaveOffset + 1) }}
                        className="dsyn-btn"
                      >
                        高八度 <kbd>X</kbd>
                      </button>
                    </div>
                    <span className="dsyn-caption">
                      {state.midiDevices.length > 0
                        ? `已接入 MIDI：${state.midiDevices.join('、')}`
                        : '直接用电脑键盘弹奏，或接入 USB MIDI 键盘'}
                    </span>
                  </div>
                  <div className="dsyn-keys">
                    {Array.from({ length: 16 }, (_, idx) => {
                      const pitch = basePitch + idx
                      const isBlack = BLACK_SEMITONES.has(pitch % 12)
                      const inScale = isPitchInScale(pitch, state.scaleRoot, state.scaleId)
                      const isActive = activeKeyPitch === pitch || state.activePreviewPitch === pitch
                      return (
                        <button
                          key={pitch}
                          type="button"
                          aria-label={`琴键 ${pitchLabel(pitch, false)}`}
                          onMouseDown={() => {
                            engine.previewDown(track.instrumentId, pitch, track.synth)
                            setActiveKeyPitch(pitch)
                          }}
                          onMouseUp={() => {
                            engine.previewUp(pitch)
                            setActiveKeyPitch(null)
                          }}
                          onMouseLeave={() => {
                            engine.previewUp(pitch)
                            if (activeKeyPitch === pitch) setActiveKeyPitch(null)
                          }}
                          className={`dsyn-pkey${isBlack ? ' is-black' : ''}${inScale ? '' : ' is-off'}${isActive ? ' is-active' : ''}`}
                        >
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pitchLabel(pitch, false)}</span>
                          <b>{QWERTY_HINT_LABELS[idx] ?? ''}</b>
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
