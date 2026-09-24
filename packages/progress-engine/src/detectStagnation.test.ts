import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { detectAllStagnation, detectStagnation } from './detectStagnation';

function set(input: Partial<LogSetInput> & { exerciseId: string }) {
  return createPerformedSet({
    setIndex: 0,
    setType: 'normal',
    weight: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    notes: null,
    ...input,
  });
}

function completedSession(
  exerciseId: string,
  sets: ReturnType<typeof set>[],
  completedAt: string,
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  for (const s of sets) session = addPerformedSet(session, { ...s, completed_at: completedAt });
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'bench',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Bench Press',
    aliases: [],
    category: null,
    equipment: [],
    target_muscle: null,
    secondary_muscles: [],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    ...overrides,
  };
}

function pr(overrides: Partial<PersonalRecord> & { source_session_id: string }): PersonalRecord {
  return {
    id: `pr-${overrides.source_session_id}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    exercise_id: 'bench',
    kind: 'max_load',
    value: 100,
    reps: 5,
    achieved_at: '2026-08-01T10:00:00.000Z',
    source_set_id: 'set-1',
    training_location_id: null,
    ...overrides,
  };
}

describe('detectStagnation', () => {
  const bench = exercise();

  it('never flags with fewer than the default 3 comparable exposures', () => {
    const sessions = [
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-01T10:00:00.000Z'),
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-08T10:00:00.000Z'),
    ];
    expect(detectStagnation(sessions, bench, [])).toEqual([]);
  });

  it('flags after 3 comparable exposures with no PR in any of them', () => {
    const sessions = [
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-01T10:00:00.000Z'),
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-08T10:00:00.000Z'),
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-15T10:00:00.000Z'),
    ];
    // No PRs passed in at all -- nothing improved.
    const signals = detectStagnation(sessions, bench, []);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.comparable_exposures).toBe(3);
    expect(signals[0]?.reason_code).toBe('PROGRESS_STALLED');
  });

  it('a PR recorded in one of the recent exposures clears the signal', () => {
    const s1 = completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-01T10:00:00.000Z');
    const s2 = completedSession('bench', [set({ exerciseId: 'bench', weight: 105, reps: 8 })], '2026-08-08T10:00:00.000Z');
    const s3 = completedSession('bench', [set({ exerciseId: 'bench', weight: 105, reps: 8 })], '2026-08-15T10:00:00.000Z');
    const personalRecords = [pr({ source_session_id: s2.id })];
    expect(detectStagnation([s1, s2, s3], bench, personalRecords)).toEqual([]);
  });

  it('honors a caller-configured stronger threshold (e.g. 5 exposures)', () => {
    const sessions = Array.from({ length: 4 }, (_, i) =>
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], `2026-08-0${i + 1}T10:00:00.000Z`),
    );
    expect(detectStagnation(sessions, bench, [], { minComparableExposures: 5 })).toEqual([]);
  });

  it('keeps two training locations independent -- stalling at one gym does not flag the other', () => {
    const gymA: WorkoutSession[] = [1, 2, 3].map((i) => ({
      ...completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], `2026-08-0${i}T10:00:00.000Z`),
      training_location_id: 'gym-a',
    }));
    const gymB1: WorkoutSession = {
      ...completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], '2026-08-04T10:00:00.000Z'),
      training_location_id: 'gym-b',
    };
    const gymB2: WorkoutSession = {
      ...completedSession('bench', [set({ exerciseId: 'bench', weight: 110, reps: 8 })], '2026-08-05T10:00:00.000Z'),
      training_location_id: 'gym-b',
    };
    const gymB3: WorkoutSession = {
      ...completedSession('bench', [set({ exerciseId: 'bench', weight: 110, reps: 8 })], '2026-08-06T10:00:00.000Z'),
      training_location_id: 'gym-b',
    };
    const personalRecords = [pr({ source_session_id: gymB2.id, training_location_id: 'gym-b' })];

    const signals = detectStagnation([...gymA, gymB1, gymB2, gymB3], bench, personalRecords);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.training_location_id).toBe('gym-a');
  });

  it('returns [] for an exercise with no history at all', () => {
    expect(detectStagnation([], bench, [])).toEqual([]);
  });
});

describe('detectAllStagnation', () => {
  it('sweeps every trained exercise in the lookup and skips ones it does not know', () => {
    const stalledBench = [1, 2, 3].map((i) =>
      completedSession('bench', [set({ exerciseId: 'bench', weight: 100, reps: 8 })], `2026-08-0${i}T10:00:00.000Z`),
    );
    const improvingCurl = [1, 2, 3].map((i) =>
      completedSession('curl', [set({ exerciseId: 'curl', weight: 20 + i, reps: 10 })], `2026-08-0${i}T12:00:00.000Z`),
    );
    const orphan = [1, 2, 3].map((i) =>
      completedSession('ghost', [set({ exerciseId: 'ghost', weight: 10, reps: 10 })], `2026-08-0${i}T14:00:00.000Z`),
    );
    const lookup = new Map([
      ['bench', exercise({ id: 'bench' })],
      ['curl', exercise({ id: 'curl', name: 'Curl' })],
    ]);
    const prs = [pr({ exercise_id: 'curl', source_session_id: improvingCurl[2]!.id })];
    const signals = detectAllStagnation([...stalledBench, ...improvingCurl, ...orphan], lookup, prs);
    expect(signals.map((s) => s.exercise_id)).toEqual(['bench']);
  });
});
