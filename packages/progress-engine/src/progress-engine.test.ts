import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { summarizeExercise } from './exerciseSummary';
import {
  bestWeightSeries,
  durationSeries,
  estimated1RMSeries,
  repsSeries,
  volumeSeries,
} from './chartSeries';
import { trainingDistribution } from './trainingDistribution';

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
  for (const s of sets) {
    session = addPerformedSet(session, { ...s, completed_at: completedAt });
  }
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt };
}

function exercise(overrides: Partial<Exercise> & { id: string }): Exercise {
  return {
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: 'Exercise',
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

describe('summarizeExercise', () => {
  it('reports empty summary for no history, without crashing', () => {
    expect(summarizeExercise([], 'bench')).toEqual({
      sessionCount: 0,
      firstPerformedAt: null,
      lastPerformedAt: null,
      lastSets: [],
      recentVolume: null,
    });
  });

  it('reports first/last/session-count across multiple sessions', () => {
    const s1 = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 135, reps: 10 })],
      '2026-08-01T10:00:00.000Z',
    );
    const s2 = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 185, reps: 5 })],
      '2026-08-15T10:00:00.000Z',
    );

    const summary = summarizeExercise([s1, s2], 'bench');
    expect(summary.sessionCount).toBe(2);
    expect(summary.firstPerformedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(summary.lastPerformedAt).toBe('2026-08-15T10:00:00.000Z');
    expect(summary.lastSets).toHaveLength(1);
    expect(summary.recentVolume).toBe(185 * 5);
  });

  it('handles a single session gracefully (first === last)', () => {
    const s1 = completedSession(
      'bench',
      [set({ exerciseId: 'bench', weight: 135, reps: 10 })],
      '2026-08-01T10:00:00.000Z',
    );
    const summary = summarizeExercise([s1], 'bench');
    expect(summary.sessionCount).toBe(1);
    expect(summary.firstPerformedAt).toBe(summary.lastPerformedAt);
  });

  it('recentVolume is null for a non-weighted (bodyweight) exercise', () => {
    const s1 = completedSession(
      'pushup',
      [set({ exerciseId: 'pushup', reps: 30 })],
      '2026-08-01T10:00:00.000Z',
    );
    const summary = summarizeExercise([s1], 'pushup');
    expect(summary.recentVolume).toBeNull();
  });
});

describe('chart series', () => {
  const s1 = completedSession(
    'bench',
    [
      set({ exerciseId: 'bench', weight: 135, reps: 10 }),
      set({ exerciseId: 'bench', weight: 155, reps: 5 }),
    ],
    '2026-08-01T10:00:00.000Z',
  );
  const s2 = completedSession(
    'bench',
    [set({ exerciseId: 'bench', weight: 185, reps: 5 })],
    '2026-08-15T10:00:00.000Z',
  );
  const sessions = [s1, s2];

  it('bestWeightSeries returns one point per session, ascending by date', () => {
    const series = bestWeightSeries(sessions, 'bench');
    expect(series).toEqual([
      { date: '2026-08-01T10:00:00.000Z', value: 155, sessionId: s1.id },
      { date: '2026-08-15T10:00:00.000Z', value: 185, sessionId: s2.id },
    ]);
  });

  it('volumeSeries sums per session rather than taking a best-of-set', () => {
    const series = volumeSeries(sessions, 'bench');
    expect(series[0]?.value).toBe(135 * 10 + 155 * 5);
    expect(series[1]?.value).toBe(185 * 5);
  });

  it('estimated1RMSeries picks the best e1RM per session, using the same default (Brzycki) estimator as pr-engine', () => {
    const series = estimated1RMSeries(sessions, 'bench');
    // session 1 best e1RM (Brzycki, weight*36/(37-reps)): 135x10 -> 135*36/27=180 vs 155x5 -> 155*36/32=174.375 -- 135x10 wins
    expect(series[0]?.value).toBeCloseTo(180, 2);
  });

  it('handles a single data point gracefully (no crash, one-item array)', () => {
    const series = bestWeightSeries([s1], 'bench');
    expect(series).toHaveLength(1);
  });

  it('handles no data gracefully (empty array, not an error)', () => {
    expect(bestWeightSeries([], 'bench')).toEqual([]);
    expect(volumeSeries([], 'bench')).toEqual([]);
  });

  it('repsSeries and durationSeries read from the right fields for non-weighted exercises', () => {
    const plankSession = completedSession(
      'plank',
      [set({ exerciseId: 'plank', durationSeconds: 90 })],
      '2026-08-01T10:00:00.000Z',
    );
    const pushupSession = completedSession(
      'pushup',
      [set({ exerciseId: 'pushup', reps: 40 })],
      '2026-08-01T10:00:00.000Z',
    );
    expect(durationSeries([plankSession], 'plank')[0]?.value).toBe(90);
    expect(repsSeries([pushupSession], 'pushup')[0]?.value).toBe(40);
  });
});

describe('trainingDistribution', () => {
  // 'row' has no enrichment -- representative of the ~97% of the 1,324-exercise
  // library that isn't hand-curated (see curatedEnrichment.ts).
  const exercises = new Map<string, Exercise>([
    [
      'bench',
      exercise({
        id: 'bench',
        category: 'chest',
        enrichment: {
          movement_pattern: 'horizontal_push',
          movement_family: 'press',
          is_unilateral: false,
          is_axial_loading: false,
          purpose: 'primary_compound',
          difficulty: 'intermediate',
          known_substitute_ids: [],
          avoid_if: [],
        },
      }),
    ],
    ['row', exercise({ id: 'row', category: 'back' })],
  ]);

  it('tallies working sets by muscle group (category), sorted descending', () => {
    const s1 = completedSession(
      'bench',
      [set({ exerciseId: 'bench' }), set({ exerciseId: 'bench' })],
      '2026-08-01T10:00:00.000Z',
    );
    const s2 = completedSession('row', [set({ exerciseId: 'row' })], '2026-08-01T10:00:00.000Z');
    const dist = trainingDistribution([s1, s2], exercises, 365);
    expect(dist.byMuscleGroup).toEqual([
      { label: 'chest', workingSets: 2 },
      { label: 'back', workingSets: 1 },
    ]);
  });

  it('tallies working sets by movement family only for curated exercises, bucketing the rest as uncategorized', () => {
    const s1 = completedSession(
      'bench',
      [set({ exerciseId: 'bench' })],
      '2026-08-01T10:00:00.000Z',
    );
    const s2 = completedSession('row', [set({ exerciseId: 'row' })], '2026-08-01T10:00:00.000Z');
    const dist = trainingDistribution([s1, s2], exercises, 365);
    expect(dist.byMovementFamily).toEqual([{ label: 'press', workingSets: 1 }]);
    expect(dist.uncategorizedMovementFamilySets).toBe(1);
  });

  it('excludes warmup sets from every bucket, same rule as PR eligibility', () => {
    const s1 = completedSession(
      'bench',
      [set({ exerciseId: 'bench', phase: 'warmup' }), set({ exerciseId: 'bench' })],
      '2026-08-01T10:00:00.000Z',
    );
    const dist = trainingDistribution([s1], exercises, 365);
    expect(dist.byMuscleGroup).toEqual([{ label: 'chest', workingSets: 1 }]);
  });

  it('excludes sets logged before the requested window', () => {
    const old = completedSession(
      'bench',
      [set({ exerciseId: 'bench' })],
      '2020-01-01T00:00:00.000Z',
    );
    const dist = trainingDistribution([old], exercises, 7);
    expect(dist.byMuscleGroup).toEqual([]);
    expect(dist.byMovementFamily).toEqual([]);
  });

  it('falls back to Uncategorized for a set whose exercise is missing from the map', () => {
    const s1 = completedSession(
      'ghost',
      [set({ exerciseId: 'ghost' })],
      '2026-08-01T10:00:00.000Z',
    );
    const dist = trainingDistribution([s1], exercises, 365);
    expect(dist.byMuscleGroup).toEqual([{ label: 'Uncategorized', workingSets: 1 }]);
  });

  it('handles no sessions gracefully and reports the window it used', () => {
    expect(trainingDistribution([], exercises)).toEqual({
      windowDays: 7,
      byMuscleGroup: [],
      byMovementFamily: [],
      uncategorizedMovementFamilySets: 0,
    });
  });
});
