/** One octave+ on the home row, plus the black keys above it. */

export const KEYBOARD_CODES = [
  'KeyA', // C  (+0) -> Drum 36 Kick
  'KeyW', // C# (+1) -> Drum 37 Rim
  'KeyS', // D  (+2) -> Drum 38 Snare
  'KeyE', // D# (+3) -> Drum 39 Clap
  'KeyD', // E  (+4)
  'KeyF', // F  (+5)
  'KeyT', // F# (+6) -> Drum 42 Hat
  'KeyG', // G  (+7)
  'KeyY', // G# (+8)
  'KeyH', // A  (+9) -> Drum 45 Low Tom
  'KeyU', // A# (+10) -> Drum 46 Open Hat
  'KeyJ', // B  (+11)
  'KeyK', // C  (+12)
  'KeyO', // C# (+13) -> Drum 49 Cymbal
  'KeyL', // D  (+14)
  'KeyP', // D# (+15)
] as const

export function auditionPitch(code: string, base: number): number | null {
  const index = KEYBOARD_CODES.indexOf(code as (typeof KEYBOARD_CODES)[number])
  if (index < 0) return null
  const pitch = base + index
  if (pitch < 0 || pitch > 127) return null
  return pitch
}

/** Drums start at C2 so A, W, S, E, T, H, U, O land on the 8-piece drum kit. */
export function auditionBase(instrumentId: string, octaveOffset = 0): number {
  if (instrumentId === 'drums') return 36
  if (instrumentId === 'bass' || instrumentId === 'acid') return Math.max(24, Math.min(84, 48 + octaveOffset * 12))
  return Math.max(24, Math.min(84, 60 + octaveOffset * 12))
}
