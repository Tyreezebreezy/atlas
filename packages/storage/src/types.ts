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
  Program,
  ProgramNote,
  SyncMeta,
  TestProtocol,
  TrainingLocation,
  WorkoutOccurrence,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';

/**
 * Deliberately minimal: get/getAll/put/softDelete. Nothing today needs
 * filtering, pagination, or querying beyond "all non-deleted rows" — add it
 * when a screen actually needs it instead of guessing the shape now.
 */
export interface Repository<T extends SyncMeta> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(entity: T): Promise<void>;
  /** Bulk insert/update, e.g. for seeding the exercise library on first run. */
  putMany(entities: T[]): Promise<void>;
  softDelete(id: string): Promise<void>;
}

export interface AtlasStorage {
  exercises: Repository<Exercise>;
  programs: Repository<Program>;
  workoutTemplates: Repository<WorkoutTemplate>;
  workoutSessions: Repository<WorkoutSession>;
  exerciseNotes: Repository<ExerciseNote>;
  programNotes: Repository<ProgramNote>;
  personalRecords: Repository<PersonalRecord>;
  milestones: Repository<Milestone>;
  benchmarks: Repository<Benchmark>;
  bodyMeasurements: Repository<BodyMeasurement>;
  /** v0.2.0. See `WorkoutOccurrence`'s doc comment -- most days never get a row here. */
  workoutOccurrences: Repository<WorkoutOccurrence>;
  /** v1.0.0. Reusable training locations (formerly device-local equipment profiles). */
  trainingLocations: Repository<TrainingLocation>;
  /** vNext Handoff 01. See `ExerciseAlias`'s doc comment. */
  exerciseAliases: Repository<ExerciseAlias>;
  /** vNext Handoff 01. See `EquipmentDefinition`'s doc comment. */
  equipmentDefinitions: Repository<EquipmentDefinition>;
  /** vNext Handoff 01. See `GymEquipmentInstance`'s doc comment. */
  gymEquipment: Repository<GymEquipmentInstance>;
  /** vNext Handoff 01. See `ExerciseEquipmentContext`'s doc comment. */
  exerciseEquipmentContext: Repository<ExerciseEquipmentContext>;
  /** vNext Handoff 02. See `TestProtocol`'s doc comment. */
  testProtocols: Repository<TestProtocol>;
}
