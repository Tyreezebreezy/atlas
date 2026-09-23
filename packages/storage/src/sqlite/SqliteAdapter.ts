import Database from '@tauri-apps/plugin-sql';
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
  TestProtocol,
  TrainingLocation,
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
  readonly trainingLocations: SqlRepository<TrainingLocation>;
  readonly exerciseAliases: SqlRepository<ExerciseAlias>;
  readonly equipmentDefinitions: SqlRepository<EquipmentDefinition>;
  readonly gymEquipment: SqlRepository<GymEquipmentInstance>;
  readonly exerciseEquipmentContext: SqlRepository<ExerciseEquipmentContext>;
  readonly testProtocols: SqlRepository<TestProtocol>;

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
    this.trainingLocations = new SqlRepository(db, 'training_locations');
    this.exerciseAliases = new SqlRepository(db, 'exercise_aliases');
    this.equipmentDefinitions = new SqlRepository(db, 'equipment_definitions');
    this.gymEquipment = new SqlRepository(db, 'gym_equipment');
    this.exerciseEquipmentContext = new SqlRepository(db, 'exercise_equipment_context');
    this.testProtocols = new SqlRepository(db, 'test_protocols');
  }

  static async connect(path = 'sqlite:atlas.db'): Promise<SqliteAdapter> {
    const db = await Database.load(path);
    return new SqliteAdapter(db);
  }
}
