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
import type { AtlasStorage } from '../types';
import { AtlasDexie } from './schema';
import { DexieRepository } from './DexieRepository';

export class IndexedDbAdapter implements AtlasStorage {
  private readonly db: AtlasDexie;

  readonly exercises: DexieRepository<Exercise>;
  readonly programs: DexieRepository<Program>;
  readonly workoutTemplates: DexieRepository<WorkoutTemplate>;
  readonly workoutSessions: DexieRepository<WorkoutSession>;
  readonly exerciseNotes: DexieRepository<ExerciseNote>;
  readonly programNotes: DexieRepository<ProgramNote>;
  readonly personalRecords: DexieRepository<PersonalRecord>;
  readonly milestones: DexieRepository<Milestone>;
  readonly benchmarks: DexieRepository<Benchmark>;
  readonly bodyMeasurements: DexieRepository<BodyMeasurement>;
  readonly workoutOccurrences: DexieRepository<WorkoutOccurrence>;
  readonly trainingLocations: DexieRepository<TrainingLocation>;
  readonly exerciseAliases: DexieRepository<ExerciseAlias>;
  readonly equipmentDefinitions: DexieRepository<EquipmentDefinition>;
  readonly gymEquipment: DexieRepository<GymEquipmentInstance>;
  readonly exerciseEquipmentContext: DexieRepository<ExerciseEquipmentContext>;
  readonly testProtocols: DexieRepository<TestProtocol>;
  readonly personalRecordEvents: DexieRepository<PersonalRecordEvent>;

  constructor(dbName = 'atlas') {
    this.db = new AtlasDexie(dbName);
    this.exercises = new DexieRepository(this.db.exercises);
    this.programs = new DexieRepository(this.db.programs);
    this.workoutTemplates = new DexieRepository(this.db.workoutTemplates);
    this.workoutSessions = new DexieRepository(this.db.workoutSessions);
    this.exerciseNotes = new DexieRepository(this.db.exerciseNotes);
    this.programNotes = new DexieRepository(this.db.programNotes);
    this.personalRecords = new DexieRepository(this.db.personalRecords);
    this.milestones = new DexieRepository(this.db.milestones);
    this.benchmarks = new DexieRepository(this.db.benchmarks);
    this.bodyMeasurements = new DexieRepository(this.db.bodyMeasurements);
    this.workoutOccurrences = new DexieRepository(this.db.workoutOccurrences);
    this.trainingLocations = new DexieRepository(this.db.trainingLocations);
    this.exerciseAliases = new DexieRepository(this.db.exerciseAliases);
    this.equipmentDefinitions = new DexieRepository(this.db.equipmentDefinitions);
    this.gymEquipment = new DexieRepository(this.db.gymEquipment);
    this.exerciseEquipmentContext = new DexieRepository(this.db.exerciseEquipmentContext);
    this.testProtocols = new DexieRepository(this.db.testProtocols);
    this.personalRecordEvents = new DexieRepository(this.db.personalRecordEvents);
    // Dexie opens lazily on first query otherwise — open eagerly so a schema
    // problem surfaces at boot, not on whatever screen happens to query first.
    void this.db.open();
  }
}
