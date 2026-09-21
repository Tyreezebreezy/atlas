import Dexie, { type Table } from 'dexie';
import type {
  Benchmark,
  BodyMeasurement,
  Exercise,
  ExerciseNote,
  Milestone,
  PersonalRecord,
  Program,
  ProgramNote,
  TrainingLocation,
  WorkoutOccurrence,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';

export class AtlasDexie extends Dexie {
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  workoutTemplates!: Table<WorkoutTemplate, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  exerciseNotes!: Table<ExerciseNote, string>;
  programNotes!: Table<ProgramNote, string>;
  personalRecords!: Table<PersonalRecord, string>;
  milestones!: Table<Milestone, string>;
  benchmarks!: Table<Benchmark, string>;
  bodyMeasurements!: Table<BodyMeasurement, string>;
  workoutOccurrences!: Table<WorkoutOccurrence, string>;
  trainingLocations!: Table<TrainingLocation, string>;

  constructor(name: string) {
    super(name);
    // Dexie owns migrations natively via version().stores() — add version(2)
    // with only the changed stores when the schema next changes, never edit
    // version(1) in place.
    this.version(1).stores({
      exercises: 'id, name, is_custom, deleted_at',
      programs: 'id, is_active, deleted_at',
      workoutTemplates: 'id, is_quick_workout, deleted_at',
      workoutSessions: 'id, status, started_at, deleted_at',
      exerciseNotes: 'id, exercise_id, deleted_at',
      programNotes: 'id, program_id, deleted_at',
      personalRecords: 'id, exercise_id, kind, deleted_at',
      milestones: 'id, exercise_id, deleted_at',
      benchmarks: 'id, metric, deleted_at',
      bodyMeasurements: 'id, date, deleted_at',
    });
    // v0.2.0: only the new store needs declaring -- every table from
    // version(1) that isn't listed here carries over unchanged, per Dexie's
    // own versioning model.
    this.version(2).stores({
      workoutOccurrences: 'id, program_id, effective_date, original_date, deleted_at',
    });
    // v1.0.0: training locations (formerly device-local equipment profiles).
    this.version(3).stores({
      trainingLocations: 'id, name, deleted_at',
    });
  }
}
