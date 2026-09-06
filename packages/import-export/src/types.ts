import type {
  BodyMeasurement,
  Exercise,
  ExerciseNote,
  Milestone,
  PersonalRecord,
  Program,
  ProgramNote,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';

/** The one supported document format today. Any other value is rejected, not coerced. */
export const ATLAS_PLAN_FORMAT = 'atlas-plan-v1';

/** A single planned exercise, portable across installations: `exercise_id` is an
 * optional same-install hint, `exercise_name` is the fallback every importer can
 * rely on (see docs/IMPORT_FORMAT.md). */
export interface PlanExerciseTarget {
  order: number;
  exercise_id: string | null;
  exercise_name: string;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
  target_rpe: number | null;
  target_rir: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
  rest_seconds: number | null;
  notes: string | null;
  /** Which of `PlanWorkout.groups` (by `key`) this exercise belongs to, if
   * any -- an arbitrary caller-assigned string rather than an array index,
   * since a skipped/unresolved exercise is dropped entirely in
   * `applyImport` and an index would drift once that happens; a string key
   * survives that unaffected. Optional (not required-plus-null) because,
   * same reasoning as `Exercise.media`, nothing derives a fallback from its
   * absence and the overwhelming majority of exercises -- every existing
   * `atlas-plan-v1` document, paste-text, and most HTML rows -- have no
   * group at all. */
  group_key?: string | null;
}

/** A superset/circuit grouping for one workout's exercises, matching
 * `ExerciseGroup` (`@atlas/data-model`) in shape minus the real id (assigned
 * at `applyImport` time, once it's known which members actually survived
 * exercise-matching/resolution). See docs/IMPORT_FORMAT.md "Supersets." */
export interface PlanExerciseGroup {
  key: string;
  type: 'superset' | 'circuit';
  rounds: number;
  rest_after_seconds: number | null;
}

export interface PlanWorkout {
  name: string;
  is_quick_workout: boolean;
  exercises: PlanExerciseTarget[];
  groups?: PlanExerciseGroup[];
}

export interface PlanProgramDay {
  label: string;
  workout: PlanWorkout;
}

export interface PlanProgramWeek {
  label: string | null;
  days: PlanProgramDay[];
}

export interface PlanProgram {
  name: string;
  description: string | null;
  weeks: PlanProgramWeek[];
}

export interface AtlasWorkoutDocument {
  format: typeof ATLAS_PLAN_FORMAT;
  kind: 'workout';
  exported_at: string;
  workout: PlanWorkout;
}

export interface AtlasProgramDocument {
  format: typeof ATLAS_PLAN_FORMAT;
  kind: 'program';
  exported_at: string;
  program: PlanProgram;
}

/** Raw, ID-preserving full dump for restoring onto a clean install of the SAME
 * logical dataset (desktop -> phone). Unlike workout/program documents, this is
 * not meant to be semantically re-matched against a different exercise library. */
export interface AtlasBackupDocument {
  format: typeof ATLAS_PLAN_FORMAT;
  kind: 'backup';
  exported_at: string;
  device_id: string;
  entities: {
    exercises: Exercise[];
    programs: Program[];
    workout_templates: WorkoutTemplate[];
    workout_sessions: WorkoutSession[];
    exercise_notes: ExerciseNote[];
    program_notes: ProgramNote[];
    personal_records: PersonalRecord[];
    milestones: Milestone[];
    body_measurements: BodyMeasurement[];
  };
}

export type AtlasPlanDocument = AtlasWorkoutDocument | AtlasProgramDocument | AtlasBackupDocument;

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  { valid: true; value: T } | { valid: false; issues: ValidationIssue[] };

export type ExerciseMatchConfidence = 'exact' | 'normalized' | 'alias' | 'unresolved';

export interface ExerciseMatchResult {
  input_name: string;
  matched_exercise: Exercise | null;
  confidence: ExerciseMatchConfidence;
  /** Up to a handful of close candidates, best first. Populated mainly when unresolved. */
  candidates: Exercise[];
}

export interface ImportWarning {
  message: string;
  severity: 'info' | 'warning';
}

export interface ImportPreviewExercise {
  /** Globally unique within one preview (including across a program's days),
   * unlike `planned.order` which only means "position within its own
   * workout." Use this, not order, to key resolutions. */
  key: string;
  planned: PlanExerciseTarget;
  match: ExerciseMatchResult;
  warnings: ImportWarning[];
}

export interface ImportPreviewWorkout {
  name: string;
  is_quick_workout: boolean;
  exercises: ImportPreviewExercise[];
  warnings: ImportWarning[];
  groups?: PlanExerciseGroup[];
}

export interface ImportPreviewProgramDay {
  label: string;
  workout: ImportPreviewWorkout;
}

export interface ImportPreviewProgramWeek {
  label: string | null;
  days: ImportPreviewProgramDay[];
}

export interface ImportPreviewProgram {
  name: string;
  description: string | null;
  weeks: ImportPreviewProgramWeek[];
  warnings: ImportWarning[];
}

export type ImportPreview =
  | { kind: 'workout'; workout: ImportPreviewWorkout }
  | { kind: 'program'; program: ImportPreviewProgram };

/** How the user resolved each unresolved exercise before approval, keyed by
 * ImportPreviewExercise.key. Omitted entries default to "skip" (dropped from
 * the saved result rather than blocking the whole import). */
export type ImportResolution =
  { action: 'use_match'; exercise_id: string } | { action: 'create_custom' } | { action: 'skip' };

export type ImportResolutions = Record<string, ImportResolution>;
