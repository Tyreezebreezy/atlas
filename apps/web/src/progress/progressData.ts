import type {
  Benchmark,
  BodyMeasurement,
  Exercise,
  Milestone,
  PersonalRecord,
  Program,
  TestProtocol,
  WorkoutOccurrence,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';

/** Everything the Progress sections read, loaded once by ProgressScreen. */
export interface ProgressData {
  sessions: WorkoutSession[];
  exercises: Map<string, Exercise>;
  prs: PersonalRecord[];
  milestones: Milestone[];
  benchmarks: Benchmark[];
  /** The test protocols benchmark definitions name -- the compatibility gate needs them. */
  testProtocols: TestProtocol[];
  bodyMeasurements: BodyMeasurement[];
  activeProgram: Program | null;
  templates: Map<string, WorkoutTemplate>;
  occurrences: WorkoutOccurrence[];
}

export type ProgressSegment =
  | 'overview'
  | 'strength'
  | 'muscles'
  | 'body'
  | 'history'
  | 'milestones';

export const PROGRESS_SEGMENTS: { key: ProgressSegment; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'strength', label: 'Strength' },
  { key: 'muscles', label: 'Muscles' },
  { key: 'body', label: 'Body' },
  { key: 'history', label: 'History' },
  { key: 'milestones', label: 'Milestones' },
];
