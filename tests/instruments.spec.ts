import { describe, expect, it } from 'vitest'
import { DEFAULT_SYNTH_PATCHES, DRUM_KITS, drumPiece, getDrumKit, getInstrument, listInstruments } from '../src/client/instruments.ts'
import { createMixGraph } from '../src/client/mix.ts'
import { SYNTH_PATCH_PRESETS, isPreset, presetsFor } from '../src/client/presets.ts'
import { DRUM_PITCHES, synthPatchSchema } from '../src/schema.ts'
import { auditionBase, auditionPitch } from '../src/client/audition.ts'

interface FakeNode {
  kind: string
  type?: string
  frequency: FakeParam
  Q: FakeParam
  gain: FakeParam
  buffer: AudioBuffer | null
  connect: () => void
  start: () => void
  stop: () => void
}

interface FakeParam {
  values: Array<{ method: string; value: number; time: number }>
  setValueAtTime: (value: number, time: number) => void
  linearRampToValueAtTime: (value: number, time: number) => void
  exponentialRampToValueAtTime: (value: number, time: number) => void
  cancelScheduledValues: (time: number) => void
}

function param(): FakeParam {
  const values: Array<{ method: string; value: number; time: number }> = []
  return {
    values,
    setValueAtTime(value, time) { values.push({ method: 'set', value, time }) },
    linearRampToValueAtTime(value, time) { values.push({ method: 'linear', value, time }) },
    exponentialRampToValueAtTime(value, time) { values.push({ method: 'exp', value, time }) },
    cancelScheduledValues(time) { values.push({ method: 'cancel', value: 0, time }) },
  }
}

function fakeContext(): { ctx: AudioContext; created: FakeNode[] } {
  const created: FakeNode[] = []
  const make = (kind: string): FakeNode => {
    const node: FakeNode = {
      kind,
      type: kind === 'osc' ? 'sine' : undefined,
      frequency: param(),
      Q: param(),
      gain: param(),
      buffer: null,
      connect() {},
      start() {},
      stop() {},
    }
    created.push(node)
    return node
  }
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createOscillator: () => make('osc'),
    createGain: () => make('gain'),
    createBiquadFilter: () => make('filter'),
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    createBufferSource: () => make('source'),
  } as unknown as AudioContext
  return { ctx, created }
}

describe('instruments', () => {
  it('registers nine synth presets and maps the 8-piece drum kit', () => {
    expect(listInstruments().map((instrument) => `${instrument.id}:${instrument.kind}`)).toEqual([
      'lead:synth',
      'bass:synth',
      'pad:synth',
      'keys:synth',
      'drums:synth',
      'acid:synth',
      'pluck:synth',
      'chip:synth',
      'bell:synth',
    ])
    expect(() => getInstrument('missing')).toThrow(/unknown_instrument:missing/)
    expect(drumPiece(36)).toBe('kick')
    expect(drumPiece(37)).toBe('rim')
    expect(drumPiece(38)).toBe('snare')
    expect(drumPiece(39)).toBe('clap')
    expect(drumPiece(42)).toBe('hat')
    expect(drumPiece(45)).toBe('tom')
    expect(drumPiece(46)).toBe('openHat')
    expect(drumPiece(49)).toBe('cymbal')
    expect(drumPiece(40)).toBeNull()
  })

  it('builds a saw lead, a filtered bass, custom synth patches, and stays silent on unmapped drums', () => {
    const lead = fakeContext()
    getInstrument('lead').noteOn(lead.ctx, {} as AudioNode, 0, 60, 100).stop(0.2)
    expect(lead.created.find((node) => node.kind === 'osc')?.type).toBe('sawtooth')

    const bass = fakeContext()
    getInstrument('bass').noteOn(bass.ctx, {} as AudioNode, 0, 40, 100).stop(0.2)
    expect(bass.created.some((node) => node.kind === 'filter')).toBe(true)
    expect(bass.created.find((node) => node.kind === 'osc')?.type).toBe('square')

    const keys = fakeContext()
    getInstrument('keys').noteOn(keys.ctx, {} as AudioNode, 0, 60, 80).stop(0.125)
    expect(keys.created.find((node) => node.kind === 'osc')?.type).toBe('triangle')
    // Short 16th note (0.125s < attack+decay 0.355s) interpolates smoothly instead of jumping to sustainLevel
    const keysGain = keys.created.find((node) => node.kind === 'gain')
    const stopRamp = keysGain?.gain.values.find((v) => v.method === 'linear' && v.time === 0.125)
    expect(stopRamp?.value).toBeGreaterThan(0.05)

    const pad = fakeContext()
    getInstrument('pad').noteOn(pad.ctx, {} as AudioNode, 0, 60, 80).stop(0.4)
    expect(pad.created.filter((node) => node.kind === 'osc')).toHaveLength(2)

    const custom = fakeContext()
    getInstrument('acid').noteOn(custom.ctx, {} as AudioNode, 0, 48, 110, {
      ...DEFAULT_SYNTH_PATCHES.acid!,
      detune: 12,
      subMix: 0.5,
      cutoff: 450,
      resonance: 12,
    }).stop(0.25)
    // 2 unison oscillators + 1 sub oscillator = 3 oscillators
    expect(custom.created.filter((node) => node.kind === 'osc')).toHaveLength(3)
    expect(custom.created.some((node) => node.kind === 'filter')).toBe(true)

    const silent = fakeContext()
    getInstrument('drums').noteOn(silent.ctx, {} as AudioNode, 0, 40, 100).stop(0.1)
    expect(silent.created).toEqual([])

    for (const pitch of [36, 37, 38, 39, 42, 45, 46, 49]) {
      const hit = fakeContext()
      getInstrument('drums').noteOn(hit.ctx, {} as AudioNode, 0, pitch, 100).stop(0.2)
      expect(hit.created.length).toBeGreaterThan(0)
    }
  })

  it('maps keyboard octaves and drum triggers without writing notes', () => {
    expect(auditionPitch('KeyA', auditionBase('lead'))).toBe(60)
    expect(auditionPitch('KeyW', auditionBase('lead'))).toBe(61)
    expect(auditionPitch('KeyK', auditionBase('lead'))).toBe(72)
    expect(auditionPitch('KeyA', auditionBase('lead', -1))).toBe(48)
    expect(auditionPitch('KeyA', auditionBase('drums'))).toBe(36)
    expect(auditionPitch('KeyS', auditionBase('drums'))).toBe(38)
    expect(auditionPitch('KeyT', auditionBase('drums'))).toBe(42)
    expect(auditionPitch('KeyO', auditionBase('drums'))).toBe(49)
    expect(auditionPitch('Space', 60)).toBeNull()
  })

  it('lets a held note be released before its planned stop, but never extended', () => {
    const chip = fakeContext()
    const patch = DEFAULT_SYNTH_PATCHES.chip
    if (patch === undefined) throw new Error('chip patch missing')
    const voice = getInstrument('chip').noteOn(chip.ctx, {} as AudioNode, 0, 60, 100, patch)
    const envelope = chip.created.find((node) => node.kind === 'gain')?.gain.values ?? []
    const silentAt = (): number | undefined => envelope.filter((entry) => entry.method === 'linear' && entry.value === 0).at(-1)?.time

    voice.stop(8)
    expect(silentAt()).toBeCloseTo(8 + patch.release)
    voice.stop(1)
    expect(silentAt()).toBeCloseTo(1 + patch.release)
    const scheduled = envelope.length
    voice.stop(5)
    expect(envelope).toHaveLength(scheduled)
  })

  it('offers several valid sounds per melodic instrument, default first', () => {
    const ids = SYNTH_PATCH_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of SYNTH_PATCH_PRESETS) {
      expect(synthPatchSchema.safeParse(preset.patch).success, preset.id).toBe(true)
    }
    for (const instrumentId of ['lead', 'bass', 'pad', 'keys', 'acid', 'pluck', 'chip', 'bell']) {
      const presets = presetsFor(instrumentId)
      expect(presets.length, instrumentId).toBeGreaterThanOrEqual(3)
      const first = presets[0]
      const fallback = DEFAULT_SYNTH_PATCHES[instrumentId]
      if (first === undefined || fallback === undefined) throw new Error(`missing default for ${instrumentId}`)
      expect(isPreset(fallback, first)).toBe(true)
      expect(isPreset({ ...fallback, cutoff: fallback.cutoff + 1 }, first)).toBe(false)
      // No two sounds of one instrument are the same patch.
      for (const [index, preset] of presets.entries()) {
        expect(presets.findIndex((other) => isPreset(other.patch, preset)), preset.id).toBe(index)
      }
    }
  })

  it('voices every drum piece in every kit, and falls back to the default kit', () => {
    expect(DRUM_KITS.map((kit) => kit.id)).toEqual(['classic', '808', 'lofi', 'chip'])
    expect(getDrumKit('nope').id).toBe('classic')
    expect(getDrumKit(undefined).id).toBe('classic')
    for (const kit of DRUM_KITS) {
      for (const pitch of DRUM_PITCHES) {
        const fake = fakeContext()
        getInstrument('drums').noteOn(fake.ctx, {} as AudioNode, 0, pitch, 100, undefined, kit.id).stop(0.1)
        expect(fake.created.length, `${kit.id}:${pitch}`).toBeGreaterThan(0)
      }
    }
    const kickStart = (kitId?: string): number | undefined => {
      const fake = fakeContext()
      getInstrument('drums').noteOn(fake.ctx, {} as AudioNode, 0, 36, 100, undefined, kitId)
      return fake.created.find((node) => node.kind === 'osc')?.frequency.values[0]?.value
    }
    expect(kickStart()).toBe(155)
    expect(kickStart('808')).toBe(130)
    expect(kickStart('chip')).toBe(240)
  })

  it('lets a drum hit ring out instead of cutting it at note-off', () => {
    const fake = fakeContext()
    const stops: number[] = []
    const voice = getInstrument('drums').noteOn(fake.ctx, {} as AudioNode, 0, 36, 100, undefined, '808')
    for (const node of fake.created) node.stop = () => { stops.push(1) }
    voice.stop(0.1)
    expect(stops).toHaveLength(0)
  })

  it('adds one LFO oscillator per voice when the patch asks for it', () => {
    const base = DEFAULT_SYNTH_PATCHES.lead
    if (base === undefined) throw new Error('lead patch missing')
    const oscillators = (patch: typeof base): number => {
      const fake = fakeContext()
      getInstrument('lead').noteOn(fake.ctx, {} as AudioNode, 0, 60, 100, patch).stop(0.5)
      return fake.created.filter((node) => node.kind === 'osc').length
    }
    const dry = oscillators(base)
    for (const lfoTarget of ['pitch', 'filter', 'amp'] as const) {
      expect(oscillators({ ...base, lfoTarget, lfoRate: 5, lfoDepth: 0.5 }), lfoTarget).toBe(dry + 1)
    }
    expect(oscillators({ ...base, lfoTarget: 'pitch', lfoRate: 5, lfoDepth: 0 })).toBe(dry)
  })

  it('applies filter key tracking, velocity-to-filter modulation, and exponential filter decay', () => {
    const patch = {
      ...DEFAULT_SYNTH_PATCHES.acid!,
      cutoff: 800,
      envMod: 0.6,
      sustain: 0.25,
    }
    const low = fakeContext()
    getInstrument('acid').noteOn(low.ctx, {} as AudioNode, 0, 36, 40, patch).stop(0.3)
    const high = fakeContext()
    getInstrument('acid').noteOn(high.ctx, {} as AudioNode, 0, 84, 120, patch).stop(0.3)

    const lowFilter = low.created.find((node) => node.kind === 'filter')?.frequency.values ?? []
    const highFilter = high.created.find((node) => node.kind === 'filter')?.frequency.values ?? []

    const lowBase = lowFilter.find((entry) => entry.method === 'set')?.value ?? 0
    const highBase = highFilter.find((entry) => entry.method === 'set')?.value ?? 0
    const lowPeak = lowFilter.find((entry) => entry.method === 'linear')?.value ?? 0
    const highPeak = highFilter.find((entry) => entry.method === 'linear')?.value ?? 0

    expect(highBase).toBeCloseTo(800 * 2, 1)
    expect(lowBase).toBeCloseTo(800 * 0.5, 1)
    expect(highPeak).toBeGreaterThan(lowPeak)
    expect(highFilter.some((entry) => entry.method === 'exp')).toBe(true)
  })

  it('spawns a 3-oscillator center-anchored unison when detune >= 16', () => {
    const patch = DEFAULT_SYNTH_PATCHES.pad
    if (patch === undefined) throw new Error('pad patch missing')
    expect(patch.detune).toBeGreaterThanOrEqual(16)

    const fake = fakeContext()
    getInstrument('pad').noteOn(fake.ctx, {} as AudioNode, 0, 60, 100, patch).stop(0.4)
    const oscs = fake.created.filter((node) => node.kind === 'osc')
    // 3 unison oscillators (-16, 0, +16 cents) + 1 sub oscillator (subMix: 0.18)
    expect(oscs).toHaveLength(4)
    const unisonFreqs = oscs.slice(0, 3).map((osc) => osc.frequency.values[0]?.value ?? 0)
    expect(unisonFreqs[1]).toBeCloseTo(261.63, 1)
    expect(unisonFreqs[0]).toBeLessThan(unisonFreqs[1]!)
    expect(unisonFreqs[2]).toBeGreaterThan(unisonFreqs[1]!)
  })

  it('chokes a ringing open hi-hat when a closed hi-hat triggers on the same context', () => {
    const fake = fakeContext()
    getInstrument('drums').noteOn(fake.ctx, {} as AudioNode, 0, 46, 100).stop(0.05)
    const openHatGain = fake.created.find((node) => node.kind === 'gain')
    expect(openHatGain).toBeDefined()

    getInstrument('drums').noteOn(fake.ctx, {} as AudioNode, 0.05, 42, 95).stop(0.1)
    expect(openHatGain?.gain.values).toContainEqual({ method: 'cancel', value: 0, time: 0.05 })
    const chokeRamp = openHatGain?.gain.values.find(
      (entry) => entry.method === 'linear' && Math.abs(entry.value - 0.0001) < 1e-6,
    )
    expect(chokeRamp?.time).toBeCloseTo(0.062, 5)
  })

  it('updates filter cutoff, resonance, waveform, detune, and LFO on an active voice via updatePatch', () => {
    const fake = fakeContext()
    const initial = {
      ...DEFAULT_SYNTH_PATCHES.lead!,
      cutoff: 1200,
      resonance: 2,
      detune: 14,
      lfoTarget: 'filter' as const,
      lfoRate: 4,
      lfoDepth: 0.4,
    }
    const voice = getInstrument('lead').noteOn(fake.ctx, {} as AudioNode, 0, 72, 100, initial)
    voice.updatePatch?.({
      ...initial,
      waveform: 'square',
      cutoff: 2400,
      resonance: 7.5,
      detune: 25,
      lfoRate: 8,
      lfoDepth: 0.75,
    }, 0.1)

    const filter = fake.created.find((node) => node.kind === 'filter')
    const oscs = fake.created.filter((node) => node.kind === 'osc')
    const primaryOscs = oscs.slice(0, 2)
    const lfoOsc = oscs.at(-1)

    expect(filter?.frequency.values).toContainEqual({ method: 'cancel', value: 0, time: 0.1 })
    // pitch 72 is +1 octave from 60 -> 50% key tracking scales 2400 * 2^0.5
    expect(filter?.frequency.values.find((e) => e.method === 'set' && e.time === 0.1)?.value).toBeCloseTo(2400 * Math.SQRT2, 1)
    expect(filter?.Q.values.find((e) => e.time === 0.1)?.value).toBe(7.5)
    expect(primaryOscs.every((osc) => osc.type === 'square')).toBe(true)
    expect(primaryOscs[0]?.frequency.values.find((e) => e.time === 0.1)?.value).not.toBeCloseTo(
      primaryOscs[0]?.frequency.values[0]?.value ?? 0,
      1,
    )
    expect(lfoOsc?.frequency.values.find((e) => e.time === 0.1)?.value).toBe(8)
  })

  it('glides oscillator and sub frequencies on legato noteOn when glideFromPitch is provided', () => {
    const fake = fakeContext()
    const patch = { ...DEFAULT_SYNTH_PATCHES.acid!, subMix: 0.4 }
    // Glide from C3 (48, 130.81Hz) to C4 (60, 261.63Hz)
    getInstrument('acid').noteOn(fake.ctx, {} as AudioNode, 0.2, 60, 100, patch, undefined, 48).stop(0.6)
    const oscs = fake.created.filter((node) => node.kind === 'osc')
    expect(oscs).toHaveLength(2) // main + sub

    const [mainOsc, subOsc] = oscs
    expect(mainOsc?.frequency.values[0]).toEqual({ method: 'set', value: expect.any(Number), time: 0.2 })
    expect(mainOsc?.frequency.values[0]?.value).toBeCloseTo(130.81, 1)
    expect(mainOsc?.frequency.values[1]?.method).toBe('exp')
    expect(mainOsc?.frequency.values[1]?.value).toBeCloseTo(261.63, 1)
    expect(mainOsc?.frequency.values[1]?.time).toBeCloseTo(0.245, 5)

    // Sub oscillator glides one octave below: C2 (36, 65.41Hz) -> C3 (48, 130.81Hz)
    expect(subOsc?.frequency.values[0]?.value).toBeCloseTo(65.41, 1)
    expect(subOsc?.frequency.values[1]?.method).toBe('exp')
    expect(subOsc?.frequency.values[1]?.value).toBeCloseTo(130.81, 1)
  })

  it('routes melodic tracks through a sidechain duckBus and builds stereo ping-pong delay when supported', () => {
    const created: Array<{ kind: string; connections: unknown[]; gain: FakeParam; pan?: FakeParam; delayTime?: FakeParam }> = []
    const makeNode = (kind: string) => {
      const node = {
        kind,
        connections: [] as unknown[],
        gain: param(),
        pan: param(),
        delayTime: param(),
        frequency: param(),
        Q: param(),
        type: 'lowpass',
        connect(target: unknown) { node.connections.push(target); return target },
      }
      created.push(node)
      return node
    }
    const ctx = {
      currentTime: 0,
      sampleRate: 44100,
      createGain: () => makeNode('gain'),
      createStereoPanner: () => makeNode('panner'),
      createDelay: () => makeNode('delay'),
      createBiquadFilter: () => makeNode('filter'),
    } as unknown as BaseAudioContext

    const mix = createMixGraph(ctx, {} as AudioNode)
    const delays = created.filter((n) => n.kind === 'delay')
    const panners = created.filter((n) => n.kind === 'panner')
    // Stereo ping-pong delay creates 2 delay nodes and 2 opposite panners (-0.55 / +0.55)
    expect(delays).toHaveLength(2)
    expect(panners.some((p) => p.pan?.values.some((v) => v.value === -0.55))).toBe(true)
    expect(panners.some((p) => p.pan?.values.some((v) => v.value === 0.55))).toBe(true)

    mix.input('bass-1', 0.8, DEFAULT_SYNTH_PATCHES.bass, 0, 'bass')
    mix.input('drums-1', 0.9, undefined, 0, 'drums')
    mix.triggerSidechain?.(1.0, 127)

    // duckBus is the 2nd gain node created after master
    const duckBus = created.filter((n) => n.kind === 'gain')[1]
    expect(duckBus?.gain.values).toContainEqual({ method: 'cancel', value: 0, time: 1.0 })
    const dip = duckBus?.gain.values.find((v) => v.method === 'linear' && v.time === 1.008)
    const recover = duckBus?.gain.values.find((v) => v.method === 'exp' && v.time === 1.16)
    expect(dip?.value).toBeCloseTo(0.52, 2)
    expect(recover?.value).toBe(1)
  })
})
