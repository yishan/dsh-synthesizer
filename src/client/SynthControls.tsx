import { useEffect, useRef, useState } from 'react'
import { DRUM_PITCHES, type SynthPatch, type SynthWaveform, type Track } from '../model.ts'
import { getEngine } from './engine.ts'
import { DEFAULT_DRUM_KIT, DRUM_KITS, DRUM_LABELS, INSTRUMENT_LABELS, resolveSynthPatch } from './instruments.ts'
import { isPreset, presetsFor } from './presets.ts'
import { Icon } from './icons.tsx'
import { getProjectStore } from './project-store.ts'
import { rangeFill } from './styles.ts'

const WAVEFORMS: ReadonlyArray<{ id: SynthWaveform; label: string }> = [
  { id: 'sawtooth', label: '锯齿' },
  { id: 'square', label: '方波' },
  { id: 'triangle', label: '三角' },
  { id: 'sine', label: '正弦' },
]

const DRUM_KEY_HINTS: Record<number, string> = {
  36: 'A',
  37: 'W',
  38: 'S',
  39: 'E',
  42: 'T',
  45: 'H',
  46: 'U',
  49: 'O',
}

const LFO_CHOICES = [
  { id: 'off', label: '关', hint: '不使用 LFO' },
  { id: 'pitch', label: '音高', hint: '颤音' },
  { id: 'filter', label: '滤波', hint: '明暗来回扫动' },
  { id: 'amp', label: '音量', hint: '震音' },
] as const

const MELODIC_INSTRUMENTS = ['lead', 'bass', 'pad', 'keys', 'acid', 'pluck', 'chip', 'bell'] as const

/** Convert cutoff (80..12000Hz) to perceptual 0..100 Brightness macro. */
function cutoffToBrightness(cutoff: number): number {
  const ratio = Math.max(80, Math.min(12000, cutoff)) / 80
  return Math.round(Math.max(0, Math.min(100, (Math.log(ratio) / Math.log(12000 / 80)) * 100)))
}

function brightnessToCutoff(brightness: number): number {
  const norm = Math.max(0, Math.min(100, brightness)) / 100
  return Math.round(80 * (12000 / 80) ** norm)
}

/** Sound tab of the editor drawer: drum pads for a drum track, patch controls otherwise. */
export function SynthControls({ track, playing }: { track: Track; playing: boolean }): JSX.Element {
  const store = getProjectStore()
  const engine = getEngine()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isDrums = track.instrumentId === 'drums'
  const patch = resolveSynthPatch(track.instrumentId, track.synth)

  if (isDrums) {
    const activeKit = track.kit ?? DEFAULT_DRUM_KIT
    return (
      <>
        <div className="dsyn-spread">
          <div className="dsyn-line" role="group" aria-label="鼓组">
            <span className="dsyn-label">鼓组</span>
            {DRUM_KITS.map((kit) => (
              <button
                key={kit.id}
                type="button"
                title={kit.description}
                aria-pressed={activeKit === kit.id}
                onClick={() => {
                  store.setTrackKit(track.id, kit.id)
                  // Let the new kit reach the engine's view of the track before auditioning it.
                  setTimeout(() => {
                    engine.previewDown('drums', 36)
                    setTimeout(() => { engine.previewDown('drums', 38) }, 180)
                  }, 0)
                }}
                className="dsyn-btn"
              >
                {kit.label}
              </button>
            ))}
          </div>
          <Oscilloscope patch={patch} playing={playing} isDrums />
        </div>
        <div className="dsyn-line" aria-label="鼓组试听">
          <span className="dsyn-label">试听</span>
          {[...DRUM_PITCHES].reverse().map((pitch) => {
            const info = DRUM_LABELS[pitch]
            if (info === undefined) return null
            return (
              <button
                key={pitch}
                type="button"
                title={`试听${info.name}`}
                onMouseDown={() => { engine.previewDown('drums', pitch) }}
                onMouseUp={() => { engine.previewUp(pitch) }}
                onMouseLeave={() => { engine.previewUp(pitch) }}
                className="dsyn-btn"
              >
                {info.name.split(' ')[0]}
                <kbd>{DRUM_KEY_HINTS[pitch] ?? ''}</kbd>
              </button>
            )
          })}
        </div>
      </>
    )
  }

  const setPatch = (partial: Partial<SynthPatch>): void => {
    store.updateTrackSynth(track.id, partial)
  }
  const auditionPitch = track.instrumentId === 'bass' || track.instrumentId === 'acid' ? 45 : 60

  const presets = presetsFor(track.instrumentId)
  const lfoTarget = patch.lfoTarget !== undefined && (patch.lfoDepth ?? 0) > 0 ? patch.lfoTarget : 'off'

  // Four macro values (0..100) derived from the patch.
  const brightness = cutoffToBrightness(patch.cutoff)
  const character = Math.round(Math.min(100, ((patch.resonance - 0.5) / 15) * 60 + patch.envMod * 40))
  const richness = Math.round(Math.min(100, (patch.detune / 30) * 45 + patch.subMix * 35 + patch.drive * 20))
  const space = Math.round(Math.min(100, (patch.delayMix / 0.65) * 65 + Math.min(1, patch.release / 0.8) * 35))

  return (
    <>
      <div className="dsyn-spread">
        <div className="dsyn-line" role="group" aria-label="乐器">
          <span className="dsyn-label">乐器</span>
          <div className="dsyn-seg" role="tablist">
            {MELODIC_INSTRUMENTS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={track.instrumentId === id}
                onClick={() => {
                  if (track.instrumentId === id) return
                  store.updateTrack(track.id, { instrumentId: id })
                  const base = id === 'bass' || id === 'acid' ? 45 : 60
                  engine.previewDown(id, base, resolveSynthPatch(id))
                  setTimeout(() => { engine.previewUp(base) }, 200)
                }}
              >
                {(INSTRUMENT_LABELS[id] ?? id).split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="dsyn-line">
          <button
            type="button"
            title="按住试听当前音色"
            onMouseDown={() => { engine.previewDown(track.instrumentId, auditionPitch, patch) }}
            onMouseUp={() => { engine.previewUp(auditionPitch) }}
            onMouseLeave={() => { engine.previewUp(auditionPitch) }}
            className="dsyn-btn"
          >
            <Icon name="speaker" />
            试听
          </button>
          <Oscilloscope patch={patch} playing={playing} isDrums={false} />
        </div>
      </div>

      <div className="dsyn-line" role="group" aria-label="音色预设">
        <span className="dsyn-label">音色</span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.description}
            aria-pressed={isPreset(patch, preset)}
            onClick={() => {
              store.applySynthPreset(track.id, preset)
              engine.previewDown(preset.instrumentId, auditionPitch, preset.patch)
              setTimeout(() => { engine.previewUp(auditionPitch) }, 200)
            }}
            className="dsyn-btn"
          >
            {/* The original eight carry an English suffix ("超级锯齿 Lead"); the rest are already short. */}
            {preset.badge !== undefined ? preset.label.split(' ')[0] : preset.label}
          </button>
        ))}
        {presets.some((preset) => isPreset(patch, preset)) ? null : <span className="dsyn-caption">已调整</span>}
      </div>

      <div className="dsyn-macros">
        <Param macro label="明亮度" hint="闷 ↔ 清脆" value={brightness} min={0} max={100} step={1} unit="%"
          onChange={(v) => { setPatch({ cutoff: brightnessToCutoff(v) }) }} />
        <Param macro label="咬字" hint="柔顺 ↔ 酸" value={character} min={0} max={100} step={1} unit="%"
          onChange={(v) => {
            const norm = v / 100
            setPatch({
              resonance: Number((0.8 + norm * 14).toFixed(1)),
              envMod: Number(Math.min(1, 0.1 + norm * 0.85).toFixed(2)),
            })
          }} />
        <Param macro label="厚度" hint="单薄 ↔ 宽厚" value={richness} min={0} max={100} step={1} unit="%"
          onChange={(v) => {
            const norm = v / 100
            setPatch({
              detune: Math.round(norm * 28),
              subMix: Number((norm * 0.6).toFixed(2)),
              drive: Number((norm * 0.4).toFixed(2)),
            })
          }} />
        <Param macro label="空间" hint="干 ↔ 回响" value={space} min={0} max={100} step={1} unit="%"
          onChange={(v) => {
            const norm = v / 100
            setPatch({
              delayMix: Number((norm * 0.6).toFixed(2)),
              release: Number((0.04 + norm * 0.75).toFixed(2)),
            })
          }} />
      </div>

      <div>
        <button
          type="button"
          aria-expanded={showAdvanced}
          onClick={() => { setShowAdvanced(!showAdvanced) }}
          className="dsyn-btn is-small is-quiet"
          style={{ marginLeft: -6 }}
        >
          <Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={12} />
          全部参数
        </button>
      </div>

      {showAdvanced ? (
        <div className="dsyn-advanced">
          <div className="dsyn-module">
            <div className="dsyn-module-title">
              <span>振荡器</span>
              <div className="dsyn-seg" role="tablist" aria-label="波形">
                {WAVEFORMS.map((wf) => (
                  <button
                    key={wf.id}
                    type="button"
                    role="tab"
                    aria-selected={patch.waveform === wf.id}
                    onClick={() => { setPatch({ waveform: wf.id }) }}
                    style={{ height: 20, padding: '0 8px', fontSize: 11 }}
                  >
                    {wf.label}
                  </button>
                ))}
              </div>
            </div>
            <Param label="失谐" value={Math.round(patch.detune)} min={0} max={50} step={1} unit=" ct" onChange={(v) => { setPatch({ detune: v }) }} />
            <Param label="低八度" value={Math.round(patch.subMix * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => { setPatch({ subMix: v / 100 }) }} />
            <Param label="过载" value={Math.round(patch.drive * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => { setPatch({ drive: v / 100 }) }} />
          </div>
          <div className="dsyn-module">
            <div className="dsyn-module-title"><span>滤波器</span></div>
            <Param label="截止频率" value={Math.round(patch.cutoff)} min={80} max={12000} step={20} unit=" Hz" onChange={(v) => { setPatch({ cutoff: v }) }} />
            <Param label="共鸣" value={Number(patch.resonance.toFixed(1))} min={0.5} max={18} step={0.5} unit="" onChange={(v) => { setPatch({ resonance: v }) }} />
            <Param label="包络扫频" value={Math.round(patch.envMod * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => { setPatch({ envMod: v / 100 }) }} />
          </div>
          <div className="dsyn-module">
            <div className="dsyn-module-title"><span>包络</span></div>
            <Param label="起音" value={Number(patch.attack.toFixed(2))} min={0.005} max={0.8} step={0.01} unit=" s" onChange={(v) => { setPatch({ attack: v }) }} />
            <Param label="衰减" value={Number(patch.decay.toFixed(2))} min={0.02} max={1.2} step={0.02} unit=" s" onChange={(v) => { setPatch({ decay: v }) }} />
            <Param label="延音" value={Math.round(patch.sustain * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => { setPatch({ sustain: v / 100 }) }} />
            <Param label="释音" value={Number(patch.release.toFixed(2))} min={0.02} max={1.5} step={0.02} unit=" s" onChange={(v) => { setPatch({ release: v }) }} />
          </div>
          <div className="dsyn-module">
            <div className="dsyn-module-title">
              <span>LFO</span>
              <div className="dsyn-seg" role="tablist" aria-label="LFO 作用对象">
                {LFO_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="tab"
                    aria-selected={lfoTarget === choice.id}
                    title={choice.hint}
                    onClick={() => {
                      setPatch(choice.id === 'off'
                        ? { lfoTarget: undefined, lfoRate: undefined, lfoDepth: undefined }
                        : { lfoTarget: choice.id, lfoRate: patch.lfoRate ?? 5, lfoDepth: patch.lfoDepth ?? 0.3 })
                    }}
                    style={{ height: 20, padding: '0 8px', fontSize: 11 }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            {lfoTarget === 'off' ? (
              <span className="dsyn-caption">选择音高、滤波或音量，让它周期性地变化</span>
            ) : (
              <>
                <Param label="速率" value={Number((patch.lfoRate ?? 5).toFixed(1))} min={0.1} max={12} step={0.1} unit=" Hz" onChange={(v) => { setPatch({ lfoRate: v }) }} />
                <Param label="深度" value={Math.round((patch.lfoDepth ?? 0) * 100)} min={1} max={100} step={1} unit="%" onChange={(v) => { setPatch({ lfoDepth: v / 100 }) }} />
              </>
            )}
          </div>
          <div className="dsyn-module">
            <div className="dsyn-module-title"><span>效果</span></div>
            <Param label="回声" value={Math.round((patch.delayMix / 0.8) * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => { setPatch({ delayMix: Number(((v / 100) * 0.8).toFixed(2)) }) }} />
            <Param label="混响" value={Math.round(((patch.reverbMix ?? 0) / 0.8) * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => { setPatch({ reverbMix: Number(((v / 100) * 0.8).toFixed(2)) }) }} />
          </div>
        </div>
      ) : null}
    </>
  )
}

function Param({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  macro = false,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  macro?: boolean
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <label className={`dsyn-param${macro ? ' is-macro' : ''}`}>
      <div>
        <span>{label}</span>
        {hint !== undefined ? <span className="dsyn-caption" style={{ marginRight: 'auto' }}>{hint}</span> : null}
        <output>{value}{unit}</output>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => { onChange(Number(event.target.value)) }}
        className="dsyn-range"
        style={{ width: '100%', ...rangeFill(value, min, max) }}
      />
    </label>
  )
}

function Oscilloscope({
  patch,
  playing,
  isDrums,
}: {
  patch: SynthPatch
  playing: boolean
  isDrums: boolean
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    const engine = getEngine()
    const buffer = new Uint8Array(new ArrayBuffer(128))
    let raf = 0

    const draw = (): void => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const ink = getComputedStyle(canvas).color
      ctx.globalAlpha = 0.15
      ctx.strokeStyle = ink
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()

      const hasLive = engine.readWaveform(buffer)
      ctx.globalAlpha = 1
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.5
      ctx.beginPath()

      if (hasLive) {
        for (let i = 0; i < buffer.length; i += 1) {
          const x = (i / (buffer.length - 1)) * w
          const v = ((buffer[i] ?? 128) - 128) / 128
          const y = h / 2 - v * (h * 0.42)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
      } else {
        const cycles = 2.5
        const cutoffNorm = Math.min(1, Math.log10(Math.max(80, patch.cutoff) / 60) / 2.35)
        const resoBoost = (patch.resonance / 20) * 0.35
        for (let x = 0; x < w; x += 1) {
          const phase = (x / w) * cycles * Math.PI * 2
          let raw = 0
          if (isDrums) {
            raw = Math.sin(phase * (1 + (1 - x / w) * 2)) * Math.exp((-x / w) * 3)
          } else if (patch.waveform === 'sine') {
            raw = Math.sin(phase)
          } else if (patch.waveform === 'triangle') {
            raw = (2 / Math.PI) * Math.asin(Math.sin(phase))
          } else if (patch.waveform === 'square') {
            raw = Math.tanh(Math.sin(phase) * (2 + cutoffNorm * 10))
          } else {
            raw = (Math.sin(phase) - 0.5 * cutoffNorm * Math.sin(2 * phase) + 0.25 * cutoffNorm * Math.sin(3 * phase)) * 0.75
          }
          if (!isDrums && patch.detune > 0) {
            raw = raw * 0.7 + Math.sin(phase * 1.02 + 0.6) * 0.3
          }
          if (!isDrums && resoBoost > 0.05) {
            raw += Math.sin(phase * 4) * resoBoost * (1 - x / w)
          }
          const env = x < w * 0.15 ? x / (w * 0.15) : 1 - (1 - patch.sustain) * ((x - w * 0.15) / (w * 0.85)) * 0.5
          const y = h / 2 - Math.max(-0.95, Math.min(0.95, raw * env)) * (h * 0.38)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
      }
      ctx.stroke()

      if (playing) {
        raf = requestAnimationFrame(draw)
      }
    }

    draw()
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [patch, playing, isDrums])

  return (
    <canvas
      ref={canvasRef}
      width={128}
      height={30}
      aria-label="示波器"
      className="dsyn-scope"
      style={{ width: 128, height: 30 }}
    />
  )
}
