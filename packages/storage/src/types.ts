import type {
  Benchmark,
  BodyMeasurement,
  Exercise,
  ExerciseNote,
  Milestone,
  PersonalRecord,
  Program,
  ProgramNote,
  SyncMeta,
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
}
