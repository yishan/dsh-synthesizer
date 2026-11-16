import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, setLocaleSetting, t } from '../src/client/i18n.ts'
import { DRUM_KITS, drumKitLabel, drumPieceLabel, instrumentLabel } from '../src/client/instruments.ts'
import { presetLabel, presetsFor, SCALES, scaleName, SONG_PRESETS, songPresetTitle } from '../src/client/presets.ts'

describe('i18n', () => {
  afterEach(() => {
    setLocaleSetting('auto')
  })

  it('defaults to zh-CN in headless environment and switches to en', () => {
    expect(getLocale()).toBe('zh-CN')
    expect(t('panel.title')).toBe('合成器')

    setLocaleSetting('en')
    expect(getLocale()).toBe('en')
    expect(t('panel.title')).toBe('Synthesizer')
  })

  it('interpolates template variables in both locales', () => {
    setLocaleSetting('zh-CN')
    expect(t('project.barsUnit', { n: 4 })).toBe('4 小节')

    setLocaleSetting('en')
    expect(t('project.barsUnit', { n: 4 })).toBe('4 bars')
  })

  it('localizes instruments, drum kits, presets, scales, and demo songs', () => {
    setLocaleSetting('en')
    expect(instrumentLabel('lead')).toBe('Lead')
    expect(drumPieceLabel(36)).toBe('Kick')
    expect(drumKitLabel(DRUM_KITS[0]!)).toBe('Classic')
    expect(presetLabel(presetsFor('lead')[0]!)).toBe('Supersaw Lead')
    expect(scaleName(SCALES[0]!)).toBe('Natural Minor')
    expect(songPresetTitle(SONG_PRESETS[0]!)).toBe('Neon Drive')
  })
})
