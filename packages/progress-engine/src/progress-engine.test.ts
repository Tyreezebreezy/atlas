import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { WorkoutSession } from '@atlas/data-model';
import { summarizeExercise } from './exerciseSummary';
import {
  bestWeightSeries,
  durationSeries,
  estimated1RMSeries,
  repsSeries,
  volumeSeries,
} from './chartSeries';

function set(input: Partial<LogSetInput> & { exerciseId: string }) {
  return createPerformedSet({
    setIndex: 0,
    setType: 'working',
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

  it('estimated1RMSeries picks the best e1RM per session', () => {
    const series = estimated1RMSeries(sessions, 'bench');
    // session 1 best e1RM: 155*(1+5/30)=180.83 vs 135*(1+10/30)=180 -- 155x5 wins
    expect(series[0]?.value).toBeCloseTo(180.833, 2);
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
