/**
 * One stylesheet for the whole plugin, scoped under `.dsyn`.
 *
 * Colours come from the host's `--dsw-alias-*` tokens so the panel follows the
 * light and dark themes. The fallbacks are the host's light values. The host
 * brand is neutral, so colour is reserved for track data and for state
 * (record, mute, error).
 */
const CSS = `
.dsyn {
  --s-fg: var(--dsw-alias-label-primary, rgb(15, 17, 21));
  --s-fg2: var(--dsw-alias-label-secondary, rgb(97, 102, 107));
  --s-fg3: var(--dsw-alias-label-tertiary, rgb(129, 133, 140));
  --s-bg: var(--dsw-alias-bg-base, #fff);
  --s-line: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  --s-line-soft: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
  --s-line-strong: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  --s-hover: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --s-active: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.1));
  --s-accent: var(--dsw-alias-button-primary-fill, rgb(15, 17, 21));
  --s-accent-hover: var(--dsw-alias-button-primary-hover, rgb(67, 69, 74));
  --s-accent-fg: var(--dsw-alias-label-primary-foreground, #fff);
  --s-danger: var(--dsw-alias-state-error-primary, rgb(236, 19, 19));
  --s-mono: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  --s-track: var(--s-fg2);
  color: var(--s-fg);
  font-family: var(--dsw-font-family, system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
}
.dsyn *, .dsyn *::before, .dsyn *::after { box-sizing: border-box; }
.dsyn :focus-visible { outline: 2px solid var(--s-fg); outline-offset: 1px; }
.dsyn kbd {
  font: 500 10px/1 var(--s-mono);
  padding: 2px 4px;
  border-radius: 3px;
  background: var(--s-active);
  color: var(--s-fg2);
}

/* Page skeleton: top bar, then tracks beside the editor. Only the grid scrolls. */
.dsyn-page { position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column; isolation: isolate; }
.dsyn-top {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: 8px 16px; padding: 8px 12px; border-bottom: 1px solid var(--s-line);
}
/* With the host sidebar collapsed, the window controls and the host's own
   sidebar and new-session buttons sit over the page's top-left corner. */
.dsyn-top { transition: padding-left 150ms ease-out; }
.dsyn-top.is-inset { padding-left: 156px; }
.dsyn-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsyn-sep { width: 1px; height: 16px; background: var(--s-line); margin: 0 4px; }
.dsyn-body { flex: 1; min-height: 0; display: flex; }
.dsyn-tracks {
  flex: 0 0 216px; display: flex; flex-direction: column; gap: 2px;
  padding: 8px; overflow-y: auto; border-right: 1px solid var(--s-line);
}
.dsyn-editor { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.dsyn-status { font-size: 11px; color: var(--s-fg3); min-width: 44px; text-align: right; }
.dsyn-label { font-size: 12px; color: var(--s-fg2); display: inline-flex; align-items: center; gap: 6px; }
.dsyn-caption { font-size: 11px; color: var(--s-fg3); }

/* Controls */
.dsyn-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 28px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--s-line); background: transparent; color: var(--s-fg);
  font: inherit; font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.dsyn-btn:hover:not(:disabled) { background: var(--s-hover); }
.dsyn-btn:active:not(:disabled) { background: var(--s-active); }
.dsyn-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dsyn-btn[aria-pressed="true"], .dsyn-btn[aria-expanded="true"] { background: var(--s-active); border-color: var(--s-line-strong); }
.dsyn-btn.is-quiet { border-color: transparent; color: var(--s-fg2); }
.dsyn-btn.is-quiet:hover:not(:disabled) { color: var(--s-fg); }
.dsyn-btn.is-icon { width: 28px; padding: 0; }
.dsyn-btn.is-small { height: 22px; padding: 0 6px; font-size: 11px; border-radius: 5px; }
.dsyn-btn.is-small.is-icon { width: 22px; padding: 0; }
.dsyn-btn.is-primary { background: var(--s-accent); border-color: var(--s-accent); color: var(--s-accent-fg); }
.dsyn-btn.is-primary:hover:not(:disabled) { background: var(--s-accent-hover); border-color: var(--s-accent-hover); }
.dsyn-btn.is-danger[aria-pressed="true"] {
  color: var(--s-danger);
  border-color: color-mix(in srgb, var(--s-danger) 45%, transparent);
  background: color-mix(in srgb, var(--s-danger) 10%, transparent);
}
.dsyn-btn.is-danger-hover:hover:not(:disabled) {
  color: var(--s-danger);
  border-color: color-mix(in srgb, var(--s-danger) 45%, transparent);
  background: color-mix(in srgb, var(--s-danger) 14%, transparent);
}
.dsyn-btn.is-solo[aria-pressed="true"] {
  color: #d97706;
  border-color: color-mix(in srgb, #f59e0b 45%, transparent);
  background: color-mix(in srgb, #f59e0b 14%, transparent);
}
.dsyn-field {
  height: 28px; padding: 0 8px; border-radius: 6px; min-width: 0;
  border: 1px solid var(--s-line); background: transparent; color: var(--s-fg);
  font: inherit; font-size: 12px;
}
.dsyn-field:hover { border-color: var(--s-line-strong); }
.dsyn-field.is-quiet { border-color: transparent; }
.dsyn-field.is-quiet:hover, .dsyn-field.is-quiet:focus { background: var(--s-hover); }
.dsyn-field.is-number { font-variant-numeric: tabular-nums; }
/* Slider: a hairline and a small dot at rest; both grow on hover, focus, or drag.
   The 18px box is the hit area throughout so growing the track/thumb never shifts layout. */
.dsyn-range {
  -webkit-appearance: none; appearance: none; min-width: 0; margin: 0; height: 18px;
  background: transparent; cursor: pointer; --fill: 50%;
}
.dsyn-track-row .dsyn-range { flex: 1; }
.dsyn-param .dsyn-range { flex: none; width: 100%; }
.dsyn-range::-webkit-slider-runnable-track {
  height: 2px; border-radius: 2px;
  background: linear-gradient(to right, var(--s-fg2) var(--fill), var(--s-line-strong) var(--fill));
  transition: height 120ms ease-out;
}
.dsyn-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 8px; height: 8px; margin-top: -3px; border-radius: 50%;
  background: var(--s-fg); border: 0;
  transition: width 120ms ease-out, height 120ms ease-out, margin-top 120ms ease-out;
}
.dsyn-range:hover::-webkit-slider-runnable-track,
.dsyn-range:active::-webkit-slider-runnable-track,
.dsyn-range:focus-visible::-webkit-slider-runnable-track,
.dsyn-param:hover .dsyn-range::-webkit-slider-runnable-track { height: 4px; }
.dsyn-range:hover::-webkit-slider-thumb,
.dsyn-range:active::-webkit-slider-thumb,
.dsyn-range:focus-visible::-webkit-slider-thumb,
.dsyn-param:hover .dsyn-range::-webkit-slider-thumb { width: 14px; height: 14px; margin-top: -5px; }
.dsyn-range:focus-visible { outline: none; }
.dsyn-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 2px var(--s-bg), 0 0 0 4px var(--s-fg); }
.dsyn-readout {
  font: 500 12px/1 var(--s-mono); font-variant-numeric: tabular-nums;
  color: var(--s-fg2); padding: 0 6px; min-width: 34px; text-align: center;
}
.dsyn-readout.is-live { color: var(--s-fg); }

/* Popover menu */
.dsyn-pop { position: relative; display: inline-flex; }
.dsyn-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 20; min-width: 220px;
  padding: 4px; border-radius: 10px; border: 1px solid var(--s-line);
  background: var(--dsw-alias-bg-layer-3, var(--s-bg));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}
.dsyn-menu-title { padding: 8px 8px 4px; font-size: 11px; color: var(--s-fg3); }
.dsyn-menu-item {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%;
  height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent;
  color: var(--s-fg); font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.dsyn-menu-item:hover { background: var(--s-hover); }
.dsyn-menu-item span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsyn-menu-item span + span { color: var(--s-fg3); font-variant-numeric: tabular-nums; }
.dsyn-menu-rule { height: 1px; margin: 4px 0; background: var(--s-line); }
.dsyn-help { width: 300px; padding: 12px; font-size: 12px; color: var(--s-fg2); }
.dsyn-help dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; align-items: baseline; }
.dsyn-help dt { white-space: nowrap; }
.dsyn-help dd { margin: 0; }

/* Project panel under the project name */
.dsyn-project-button { max-width: 260px; font-weight: 600; font-size: 13px; }
.dsyn-project-button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsyn-menu.is-panel { width: 380px; padding: 6px; }
.dsyn-projects { display: flex; flex-direction: column; }
.dsyn-project-list { max-height: 312px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.dsyn-project { display: flex; align-items: center; gap: 4px; padding-right: 4px; border-radius: 8px; min-height: 44px; }
.dsyn-project:hover, .dsyn-project:focus-within { background: var(--s-hover); }
.dsyn-project.is-current { background: var(--s-active); }
.dsyn-project-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding: 6px 8px;
  border: 0; background: transparent; color: var(--s-fg); font: inherit; text-align: left; cursor: pointer;
}
.dsyn-project-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsyn-project-meta { font-size: 11px; color: var(--s-fg3); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsyn-project-actions { display: flex; gap: 0; opacity: 0; }
.dsyn-project:hover .dsyn-project-actions, .dsyn-project:focus-within .dsyn-project-actions { opacity: 1; }
.dsyn-project-new { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 4px 6px; }

.dsyn-toast {
  position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 30;
  display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 10px;
  border: 1px solid var(--s-line); background: var(--dsw-alias-bg-layer-3, var(--s-bg));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16); font-size: 12px; white-space: nowrap;
}

.dsyn-alert {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 8px 12px 0; padding: 6px 6px 6px 10px; border-radius: 8px; font-size: 12px;
  border: 1px solid color-mix(in srgb, var(--s-danger) 40%, transparent);
  background: color-mix(in srgb, var(--s-danger) 8%, transparent);
}

/* Track list */
.dsyn-track {
  position: relative; display: flex; flex-direction: column; gap: 2px;
  padding: 6px 6px 6px 12px; border-radius: 8px; cursor: pointer;
}
.dsyn-track:hover { background: var(--s-hover); }
.dsyn-track.is-selected { background: var(--s-active); }
.dsyn-track::before {
  content: ''; position: absolute; left: 4px; top: 8px; bottom: 8px; width: 3px;
  border-radius: 2px; background: var(--s-track); opacity: 0.45;
}
.dsyn-track.is-selected::before { opacity: 1; }
.dsyn-track.is-muted .dsyn-track-name { color: var(--s-fg3); }
.dsyn-track-row { display: flex; align-items: center; gap: 4px; }
.dsyn-track-name { flex: 1; height: 24px; padding: 0 4px; font-weight: 500; font-size: 13px; }
.dsyn-track-inst { flex: 0 0 84px; height: 22px; padding: 0 2px; font-size: 11px; color: var(--s-fg2); }
.dsyn-track .dsyn-btn.is-quiet { opacity: 0; }
.dsyn-track:hover .dsyn-btn.is-quiet, .dsyn-track .dsyn-btn.is-quiet:focus-visible { opacity: 1; }
.dsyn-add { margin-top: 6px; justify-content: flex-start; color: var(--s-fg2); }

/* Grid */
.dsyn-roll { flex: 1; min-height: 0; overflow: auto; position: relative; user-select: none; isolation: isolate; outline-offset: -2px; }
.dsyn-ruler {
  display: flex; height: 24px; position: sticky; top: 0; z-index: 4;
  background: var(--s-bg); border-bottom: 1px solid var(--s-line); font-size: 11px; color: var(--s-fg3);
}
.dsyn-corner {
  position: sticky; left: 0; z-index: 5; display: flex; align-items: center; padding: 0 8px;
  background: var(--s-bg); border-right: 1px solid var(--s-line);
}
.dsyn-bars { position: relative; display: flex; cursor: pointer; }
.dsyn-bar {
  position: relative; display: flex; align-items: center; padding-left: 6px;
  border-left: 1px solid var(--s-line-strong); font-variant-numeric: tabular-nums;
}
.dsyn-bar:first-child { border-left: 0; }
.dsyn-bar b { font-weight: 600; color: var(--s-fg); }
.dsyn-bar span { position: absolute; }
.dsyn-playhead { position: absolute; left: 0; width: 1.5px; background: var(--s-fg); pointer-events: none; }
.dsyn-row { display: flex; }
.dsyn-key {
  position: sticky; left: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 4px;
  padding: 0 8px; font-size: 11px; color: var(--s-fg2); cursor: pointer;
  background: var(--s-bg); border-right: 1px solid var(--s-line); border-bottom: 1px solid var(--s-line-soft);
}
.dsyn-key.is-black { background: color-mix(in srgb, var(--s-fg) 9%, var(--s-bg)); }
.dsyn-key.is-root { color: var(--s-fg); font-weight: 600; }
.dsyn-key.is-c { color: var(--s-fg); }
.dsyn-key:hover { background: color-mix(in srgb, var(--s-fg) 14%, var(--s-bg)); }
.dsyn-key.is-active { background: var(--s-accent); color: var(--s-accent-fg); }
.dsyn-key i { width: 5px; height: 5px; border-radius: 50%; background: var(--s-fg); }
.dsyn-key.is-active i { background: var(--s-accent-fg); }
.dsyn-lane {
  position: relative; cursor: crosshair; border-bottom: 1px solid var(--s-line-soft);
  background-image:
    linear-gradient(to right, var(--s-line-strong) 1px, transparent 1px),
    linear-gradient(to right, var(--s-line) 1px, transparent 1px),
    linear-gradient(to right, var(--s-line-soft) 1px, transparent 1px);
}
.dsyn-lane.is-black { background-color: color-mix(in srgb, var(--s-fg) 3%, transparent); }
.dsyn-lane.is-off { background-color: color-mix(in srgb, var(--s-fg) 7%, transparent); }
.dsyn-lane.is-root { background-color: color-mix(in srgb, var(--s-track) 9%, transparent); }
.dsyn-note { position: absolute; top: 2px; bottom: 2px; border-radius: 3px; background: var(--s-track); pointer-events: none; }
.dsyn-note.is-ghost { top: 5px; bottom: 5px; background: var(--s-fg); opacity: 0.12; }
.dsyn-note.is-draft { opacity: 0.55; }

/* Velocity lane, pinned to the bottom of the grid */
.dsyn-velocity { display: flex; position: sticky; bottom: 0; z-index: 4; background: var(--s-bg); border-top: 1px solid var(--s-line); }
.dsyn-velocity .dsyn-key { border-bottom: 0; height: 100%; }
.dsyn-velocity .dsyn-key:hover { background: var(--s-bg); }
.dsyn-velocity-lane {
  position: relative; cursor: ns-resize;
  background-image:
    linear-gradient(to right, var(--s-line-strong) 1px, transparent 1px),
    linear-gradient(to right, var(--s-line) 1px, transparent 1px);
}
.dsyn-velocity-bar { position: absolute; bottom: 0; min-height: 2px; border-radius: 2px 2px 0 0; background: var(--s-track); pointer-events: none; }

/* Drawer under the grid */
.dsyn-drawer { border-top: 1px solid var(--s-line); display: flex; flex-direction: column; max-height: 46%; }
.dsyn-tabs { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; }
.dsyn-seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--s-hover); }
.dsyn-seg button {
  height: 24px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent;
  color: var(--s-fg2); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
}
.dsyn-seg button:hover { color: var(--s-fg); }
.dsyn-seg button[aria-selected="true"],
.dsyn-seg button[aria-pressed="true"] { background: var(--s-bg); color: var(--s-fg); box-shadow: 0 0 0 1px var(--s-line), 0 1px 2px rgba(0, 0, 0, 0.06); }
.dsyn-panel { padding: 4px 12px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.dsyn-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsyn-spread { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dsyn-macros { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 10px 20px; }
.dsyn-advanced { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px 24px; padding-top: 12px; border-top: 1px solid var(--s-line); }
.dsyn-module { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dsyn-module-title { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 600; color: var(--s-fg2); min-height: 24px; }
.dsyn-param { display: flex; flex-direction: column; gap: 4px; font-size: 12px; cursor: pointer; min-width: 0; }
.dsyn-param > div { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; min-height: 18px; }
.dsyn-param > div > span:first-child { white-space: nowrap; flex-shrink: 0; }
.dsyn-param > div > .dsyn-caption { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsyn-param output { font: 500 11px/1 var(--s-mono); font-variant-numeric: tabular-nums; color: var(--s-fg2); white-space: nowrap; flex-shrink: 0; text-align: right; }
.dsyn-param.is-macro > div > span:first-child { font-weight: 500; }
.dsyn-scope { flex: 0 0 auto; border-radius: 6px; border: 1px solid var(--s-line); pointer-events: none; color: var(--s-fg); }
.dsyn-keys { display: flex; gap: 2px; height: 52px; overflow-x: auto; }
.dsyn-pkey {
  flex: 1 0 34px; display: flex; flex-direction: column; justify-content: space-between; align-items: center;
  padding: 6px 2px; border-radius: 0 0 5px 5px; border: 1px solid var(--s-line); background: var(--s-bg);
  color: var(--s-fg3); font: inherit; font-size: 10px; cursor: pointer;
}
.dsyn-pkey.is-black { background: color-mix(in srgb, var(--s-fg) 82%, var(--s-bg)); color: var(--s-bg); border-color: transparent; }
.dsyn-pkey.is-off { opacity: 0.55; }
.dsyn-pkey.is-active { background: var(--s-track); color: #fff; border-color: transparent; opacity: 1; }
.dsyn-pkey b { font: 600 10px/1 var(--s-mono); }
.dsyn-rec-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

.dsyn-transport { display: flex; align-items: center; gap: 4px; }

/* Sidebar transport: one row with the footprint of the sidebar's own entries.
   The row is the hover target; its buttons are borderless until pointed at. */
.dsyn-side {
  display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; width: 100%;
  height: 36px; padding: 0 6px; border-radius: 8px;
  transition: background-color 120ms ease-out;
}
.dsyn-side:hover, .dsyn-side:focus-within { background: var(--s-hover); }
.dsyn-side .dsyn-btn.is-quiet { color: var(--s-fg2); }
.dsyn-side:hover .dsyn-btn.is-quiet, .dsyn-side.is-playing .dsyn-btn.is-quiet { color: var(--s-fg); }
.dsyn-side .dsyn-btn:hover:not(:disabled) { background: var(--s-active); }
.dsyn-side .dsyn-btn.is-danger[aria-pressed="true"] { color: var(--s-danger); border-color: transparent; }
.dsyn-side-name {
  flex: 1; min-width: 0; padding: 0 6px; font-size: 13px; color: var(--s-fg2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsyn-side:hover .dsyn-side-name, .dsyn-side.is-playing .dsyn-side-name { color: var(--s-fg); }
.dsyn-side .dsyn-readout { min-width: 0; padding: 0 4px; }
.dsyn-side.is-rail { flex-direction: column; justify-content: center; width: auto; height: auto; padding: 2px; gap: 2px; }
`

const STYLE_ID = 'dsh-synthesizer-styles'

/** Install the stylesheet once. Safe to call from every mount point. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    if (existing.textContent !== CSS) existing.textContent = CSS
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/** Muted per-instrument hues. They colour the track marker and its notes, nothing else. */
export const TRACK_COLORS: Record<string, string> = {
  drums: '#c8743c',
  bass: '#3f9c7d',
  acid: '#a8922e',
  pad: '#8271c9',
  keys: '#c0873a',
  lead: '#4f7fd1',
  pluck: '#3b98ad',
  chip: '#bf5f98',
  bell: '#3fa197',
}

/** Inline style that paints the filled part of a `.dsyn-range` up to its value. */
export function rangeFill(value: number, min: number, max: number): Record<string, string> {
  const ratio = max > min ? (value - min) / (max - min) : 0
  return { '--fill': `${Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10}%` }
}

export function trackColor(instrumentId: string): string {
  return TRACK_COLORS[instrumentId] ?? '#4f7fd1'
}
