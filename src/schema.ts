/** Zod schema for the project document. Unknown fields are rejected; notes stay on a sixteenth grid. */
import { z } from 'zod'
import {
  BEATS_PER_BAR,
  ID_PATTERN,
  KIT_PATTERN,
  LFO_TARGETS,
  MAX_SWING,
  MAX_BARS,
  MAX_LOOP_BEATS,
  MAX_NOTES_PER_TRACK,
  MAX_TRACKS,
  SYNTH_WAVEFORMS,
  isQuantized,
  type Project,
} from './model.ts'

export * from './model.ts'

export const synthWaveformSchema = z.enum(SYNTH_WAVEFORMS)
export const synthPatchSchema = z.strictObject({
  waveform: synthWaveformSchema,
  detune: z.number().min(0).max(50),
  subMix: z.number().min(0).max(1),
  cutoff: z.number().min(60).max(16000),
  resonance: z.number().min(0.5).max(20),
  envMod: z.number().min(0).max(1),
  attack: z.number().min(0.002).max(2),
  decay: z.number().min(0.01).max(2),
  sustain: z.number().min(0).max(1),
  release: z.number().min(0.01).max(3),
  delayMix: z.number().min(0).max(0.8),
  drive: z.number().min(0).max(1),
  reverbMix: z.number().min(0).max(0.8).optional(),
  lfoTarget: z.enum(LFO_TARGETS).optional(),
  lfoRate: z.number().min(0.1).max(20).optional(),
  lfoDepth: z.number().min(0).max(1).optional(),
})

export const noteSchema = z.strictObject({
  pitch: z.number().int().min(0).max(127),
  startBeat: z.number().min(0).max(MAX_LOOP_BEATS),
  durationBeats: z.number().positive().max(MAX_LOOP_BEATS),
  velocity: z.number().int().min(1).max(127),
}).superRefine((note, ctx) => {
  if (!isQuantized(note.startBeat) || !isQuantized(note.durationBeats)) ctx.addIssue('unquantized_note')
})

export const trackSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN),
  name: z.string().min(1).max(64),
  instrumentId: z.string().min(1).max(64),
  mute: z.boolean(),
  solo: z.boolean().optional(),
  gain: z.number().min(0).max(1),
  pan: z.number().min(-1).max(1).optional(),
  synth: synthPatchSchema.optional(),
  kit: z.string().regex(KIT_PATTERN).optional(),
  notes: z.array(noteSchema).max(MAX_NOTES_PER_TRACK),
})

export const projectSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().regex(ID_PATTERN),
  name: z.string().min(1).max(80),
  bpm: z.number().int().min(40).max(240),
  beatsPerBar: z.literal(BEATS_PER_BAR),
  bars: z.number().int().min(1).max(MAX_BARS),
  loop: z.boolean(),
  swing: z.number().min(0).max(MAX_SWING).optional(),
  scaleRoot: z.number().int().min(0).max(11).optional(),
  scaleId: z.string().min(1).max(32).optional(),
  tracks: z.array(trackSchema).min(1).max(MAX_TRACKS),
}).superRefine((project, ctx) => {
  const loopBeats = project.bars * project.beatsPerBar
  const ids = new Set<string>()
  for (const track of project.tracks) {
    if (ids.has(track.id)) ctx.addIssue('duplicate_track_id')
    ids.add(track.id)
    for (const note of track.notes) {
      if (note.startBeat >= loopBeats || note.startBeat + note.durationBeats > loopBeats + 1e-6) {
        ctx.addIssue('note_outside_loop')
      }
    }
  }
})

/** Compile-time check that the schema and the hand-written model types agree. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const schemaMatchesModel: Same<z.infer<typeof projectSchema>, Project> = true
void schemaMatchesModel
