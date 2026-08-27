import type { SyncMeta } from './sync';

/** Persistent personal setup info, e.g. "Seat position 6." Accumulates over time. */
export interface ExerciseNote extends SyncMeta {
  exercise_id: string;
  text: string;
}

/** Instructions relevant to the active program, e.g. "Maintain 1-2 RIR this block." */
export interface ProgramNote extends SyncMeta {
  program_id: string;
  text: string;
}
