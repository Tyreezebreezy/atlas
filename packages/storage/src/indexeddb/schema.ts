import Dexie, { type Table } from 'dexie';
import type {
  Benchmark,
  BodyMeasurement,
  EquipmentDefinition,
  Exercise,
  ExerciseAlias,
  ExerciseEquipmentContext,
  ExerciseNote,
  GymEquipmentInstance,
  Milestone,
  PersonalRecord,
  PersonalRecordEvent,
  Program,
  ProgramNote,
  TestProtocol,
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
  exerciseAliases!: Table<ExerciseAlias, string>;
  equipmentDefinitions!: Table<EquipmentDefinition, string>;
  gymEquipment!: Table<GymEquipmentInstance, string>;
  exerciseEquipmentContext!: Table<ExerciseEquipmentContext, string>;
  testProtocols!: Table<TestProtocol, string>;
  personalRecordEvents!: Table<PersonalRecordEvent, string>;

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
    // vNext Handoff 01: canonical exercise aliases + equipment-aware
    // progression foundations. All four are new, independent stores --
    // nothing from version(1-3) changes shape.
    this.version(4).stores({
      exerciseAliases: 'id, exercise_id, normalized_alias, deleted_at',
      equipmentDefinitions: 'id, type, deleted_at',
      gymEquipment: 'id, training_location_id, equipment_definition_id, deleted_at',
      exerciseEquipmentContext: 'id, exercise_id, gym_equipment_id, deleted_at',
    });
    // vNext Handoff 02: performance-intelligence foundations. The only
    // genuinely new store this handoff needs -- PersonalRecord/Milestone/
    // Benchmark/WorkoutSession/PerformedSet all grow new fields on their
    // existing whole-document rows instead, which Dexie doesn't need a
    // schema version for (only declared index columns matter here, and none
    // of those new fields are indexed).
    this.version(5).stores({
      testProtocols: 'id, measurement_type, deleted_at',
    });
    // vNext Handoff 04A.1: the PR event history. Only the new store is
    // declared -- every existing store, and every existing row in it, is
    // untouched (no upgrade function, no rewrite). A database that already
    // holds history simply starts with an empty store, which the app's
    // startup reconcile fills from that history.
    this.version(6).stores({
      personalRecordEvents: 'id, session_id, exercise_id, achieved_at, deleted_at',
    });
  }
}
