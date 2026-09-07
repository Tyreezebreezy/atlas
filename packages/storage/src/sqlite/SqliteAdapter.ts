import Database from '@tauri-apps/plugin-sql';
import type {
  Benchmark,
  BodyMeasurement,
  Exercise,
  ExerciseNote,
  Milestone,
  PersonalRecord,
  Program,
  ProgramNote,
  WorkoutOccurrence,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';
import type { AtlasStorage } from '../types';
import { SqlRepository } from './SqlRepository';

export class SqliteAdapter implements AtlasStorage {
  readonly exercises: SqlRepository<Exercise>;
  readonly programs: SqlRepository<Program>;
  readonly workoutTemplates: SqlRepository<WorkoutTemplate>;
  readonly workoutSessions: SqlRepository<WorkoutSession>;
  readonly exerciseNotes: SqlRepository<ExerciseNote>;
  readonly programNotes: SqlRepository<ProgramNote>;
  readonly personalRecords: SqlRepository<PersonalRecord>;
  readonly milestones: SqlRepository<Milestone>;
  readonly benchmarks: SqlRepository<Benchmark>;
  readonly bodyMeasurements: SqlRepository<BodyMeasurement>;
  readonly workoutOccurrences: SqlRepository<WorkoutOccurrence>;

  private constructor(db: Database) {
    this.exercises = new SqlRepository(db, 'exercises');
    this.programs = new SqlRepository(db, 'programs');
    this.workoutTemplates = new SqlRepository(db, 'workout_templates');
    this.workoutSessions = new SqlRepository(db, 'workout_sessions');
    this.exerciseNotes = new SqlRepository(db, 'exercise_notes');
    this.programNotes = new SqlRepository(db, 'program_notes');
    this.personalRecords = new SqlRepository(db, 'personal_records');
    this.milestones = new SqlRepository(db, 'milestones');
    this.benchmarks = new SqlRepository(db, 'benchmarks');
    this.bodyMeasurements = new SqlRepository(db, 'body_measurements');
    this.workoutOccurrences = new SqlRepository(db, 'workout_occurrences');
  }

  static async connect(path = 'sqlite:atlas.db'): Promise<SqliteAdapter> {
    const db = await Database.load(path);
    return new SqliteAdapter(db);
  }
}
