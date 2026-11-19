# dsh-synthesizer

**English** | [简体中文](./README.zh-CN.md)

A multi-track Web Audio synthesizer and pocket groovebox for DeepSeek Harness. Sketch beats and melodies on a piano roll or 8-piece drum sequencer, sculpt sounds with a real-time subtractive synth engine, and keep your loop playing in the background while you chat—complete with sidebar quick transport controls, AI-assisted `/synth` composition, and WAV/MIDI export. Projects and synth patches are persisted in your active profile under `storages/dsh-synthesizer/projects/`.

## Interface & Workflow

The workspace has three regions: a top bar (transport, BPM, bars, `×2` bar doubler, swing, loop, project menu, undo, help, settings), a left track list (with exclusive Solo `S`, Mute `M`, instrument selector, gain, and stereo pan), and the piano-roll / drum-grid editor on the right. Below the grid, a three-tab drawer holds:

- **Sound**: Choose one of 8 melodic instruments (`lead`, `bass`, `pad`, `keys`, `acid`, `pluck`, `chip`, `bell`) and pick from 3–4 curated patches per instrument (plus macro knobs for brightness, bite, thickness, and space, or full ADSR/filter/unison/sub/drive/LFO/delay/reverb parameters). On drum tracks, switch between 4 drum kits (`classic`, `808`, `lofi`, `chip`) and audition all 8 drum pieces.
- **Compose**: Root & scale highlighting across 12 roots and 8 scales (`minor`, `major`, `dorian`, `mixolydian`, `phrygian`, `pentatonic`, `blues`, `chromatic`), chord brush (`single`, `triad`, `seventh`), instant pattern generators (5 drum patterns, 5 melodic patterns), Euclidean `E(5,16)` percussion, drum fills, scale snap, velocity humanization, octave shift, repeat first bar, and clear track.
- **Play**: Two-octave on-screen keyboard, QWERTY keyboard play (`A–L`, `Z/X` octave shift), Web MIDI input support, and record-arm (`R`) to quantize live-played notes onto the grid during playback.

All edits support undo (`⌘Z / Ctrl+Z`).

## AI Composition & `/synth` Command

`dsh-synthesizer` registers 4 host agent tools (`synthesizer_list_projects`, `synthesizer_get_project`, `synthesizer_save_project`, `synthesizer_update_track`), a `dsh-synthesizer:composition` system prompt section, and the `/synth` slash command:

- `/synth <style/tempo/instrument prompt> [--seed <seed>]` — Ask the model to compose a multi-track arrangement directly into the synthesizer. Each run automatically generates a random seed (or uses your `--seed`) to vary song form, rhythm feel, key/scale, chord progression, bassline, and melodic contour.
- `/synth groove [bpm] [--seed <seed>]` — Procedurally generate a seeded multi-track groove immediately without invoking the model.
- `/synth list` — List saved synthesizer projects.
- `/synth help` — Show command usage.

When an agent tool saves or updates a project, the browser editor syncs automatically (or shows a one-click banner if you have unsaved local edits).

## Projects, Settings & Export

- **Project Panel**: Open, search (when > 8 projects), rename, duplicate, export/import (`.dsh-synth.json`), or delete (with 10-second undo toast). Includes **8 curated song presets** (*Synthwave '84*, *Lo-Fi Chillhop*, *Acid 303 Warehouse*, *Chiptune Adventure*, *Ambient Drift*, *Midnight Disco*, *Tape Sunset*, *Future 808*) plus a random groove generator. Up to 32 projects (256 KB each), auto-saved 500 ms after edits.
- **Settings**: Switch UI language (`Auto` / `简体中文` / `English`), toggle the sidebar quick transport bar, toggle background playback when leaving the panel, adjust master volume and sidechain ducking (`Off` / `Normal` / `Strong`), toggle audition-on-draw, QWERTY piano, ghost notes, and oscilloscope, inspect connected MIDI devices, or reset settings.
- **Export**: Export multi-track MIDI (drums on channel 10, swing baked into note timing) or offline-rendered WAV matching the live mix graph (excluding muted tracks).

## Synthesis Engine

Each melodic track runs a real-time Web Audio subtractive synthesizer: oscillator waveform (`sawtooth`, `square`, `triangle`, `sine`), unison detune, octave-down sub oscillator, saturation drive, resonant lowpass filter with key-tracking and envelope modulation, ADSR amplitude envelope, legato pitch glide (`acid`, `bass`, `lead`), per-voice LFO (`pitch`, `filter`, `amp`), and tempo-synced ping-pong delay + algorithmic reverb sends feeding a sidechain ducking bus and master compressor. Drum tracks feature 8 synthesized pieces (`kick`, `rim`, `snare`, `clap`, `hat`, `tom`, `openHat`, `cymbal`) with open-hat choke.

Theme colors follow the host `--dsw-alias-*` CSS variables for light and dark modes.

## Installation

```bash
npm install
npm run build
dsh plugin --profile <profile> add /path/to/dsh-synthesizer
```

Host fetch routes use exact `GET` and `POST` paths: `GET /api/dsh-synthesizer/projects` (or `?id=<id>`), `POST /api/dsh-synthesizer/projects`, and `POST /api/dsh-synthesizer/projects/delete`.

## Development

```bash
npm run typecheck
npm test
npm run build
```

## License

MIT
