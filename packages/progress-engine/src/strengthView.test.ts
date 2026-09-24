import { describe, expect, it } from 'vitest';
import { DEFAULT_E1RM_ESTIMATOR } from '@atlas/pr-engine';
import { buildStrengthView, recordIndices, trainedExercises } from './strengthView';
import { daysBefore, makeExercise, makeSession } from './testFixtures';

const NOW = new Date('2026-09-24T12:00:00.000Z');
const PRESS = makeExercise({ id: 'machine-press', name: 'Machine Chest Press' });

/** One working set per session, oldest first, `spacingDays` apart. */
function history(exerciseId: string, sets: { weight: number; reps: number }[], extra = {}) {
  return sets.map((set, i) =>
    makeSession(
      [{ exerciseId, weight: set.weight, reps: set.reps }],
      daysBefore(NOW, (sets.length - i) * 7),
      extra,
    ),
  );
}

const values = (series: { value: number }[]) => series.map((p) => p.value);

describe('recordIndices', () => {
  it('marks points that beat everything before them, never the baseline first point', () => {
    const series = [12, 14, 14, 13, 16, 18].map((value, i) => ({ date: `d${i}`, value, sessionId: `s${i}` }));
    expect(recordIndices(series)).toEqual([1, 4, 5]);
    expect(recordIndices([])).toEqual([]);
    expect(recordIndices(series.slice(0, 1))).toEqual([]);
  });
});

describe('buildStrengthView — estimated 1RM', () => {
  it('builds the supported series from sets of 1-10 reps with the same estimator PRs use', () => {
    const sessions = history('bench', [
      { weight: 100, reps: 8 },
      { weight: 105, reps: 5 },
    ]);
    const view = buildStrengthView(sessions, makeExercise());
    const e1rm = view.metrics.find((m) => m.key === 'e1rm');
    expect(values(e1rm?.series ?? [])).toEqual([
      DEFAULT_E1RM_ESTIMATOR.estimate(100, 8),
      DEFAULT_E1RM_ESTIMATOR.estimate(105, 5),
    ]);
    expect(e1rm?.note).toContain('1–10 reps');
    expect(view.default_key).toBe('e1rm');
  });

  it('never fabricates an e1RM for sets above the supported rep range', () => {
    const sessions = history('machine-press', [
      { weight: 170, reps: 12 },
      { weight: 170, reps: 14 },
      { weight: 170, reps: 16 },
      { weight: 170, reps: 18 },
    ]);
    const view = buildStrengthView(sessions, PRESS);
    const e1rm = view.metrics.find((m) => m.key === 'e1rm');
    expect(e1rm?.series).toEqual([]);
    expect(e1rm?.note).toContain('4 sessions with only higher-rep sets are not plotted');
    expect(e1rm?.note).toContain('above 10 reps');
  });

  it('plots only the sessions that had a supported set and says how many were left out', () => {
    const sessions = [
      makeSession([{ exerciseId: 'bench', weight: 100, reps: 8 }], daysBefore(NOW, 14)),
      makeSession([{ exerciseId: 'bench', weight: 60, reps: 20 }], daysBefore(NOW, 7)),
    ];
    const e1rm = buildStrengthView(sessions, makeExercise()).metrics.find((m) => m.key === 'e1rm');
    expect(e1rm?.series).toHaveLength(1);
    expect(e1rm?.note).toContain('1 session with only higher-rep sets is not plotted');
  });
});

describe('buildStrengthView — reps at load (equipment ceiling)', () => {
  const ceiling = () =>
    history('machine-press', [
      { weight: 170, reps: 12 },
      { weight: 170, reps: 14 },
      { weight: 170, reps: 16 },
      { weight: 170, reps: 18 },
    ]);

  it('shows fixed-load rep progress as the default, with a rep record marker on every gain', () => {
    const view = buildStrengthView(ceiling(), PRESS);
    expect(view.default_key).toBe('reps_at_load');
    expect(view.load_options).toEqual([170]);
    expect(view.selected_load).toBe(170);

    const metric = view.metrics[0];
    expect(metric).toMatchObject({ key: 'reps_at_load', kind: 'reps_at_load', load: 170, label: 'Reps @ 170 lb' });
    expect(values(metric?.series ?? [])).toEqual([12, 14, 16, 18]);
    expect(metric?.record_indices).toEqual([1, 2, 3]);
  });

  it('keeps e1RM and reps-at-load as separate metrics with different meanings', () => {
    const keys = buildStrengthView(ceiling(), PRESS).metrics.map((m) => m.key);
    expect(keys).toEqual(['reps_at_load', 'e1rm', 'max_load', 'volume']);
  });

  it('lets the caller pick another recurring load, falling back when the choice is not one', () => {
    const sessions = [
      ...history('machine-press', [
        { weight: 150, reps: 20 },
        { weight: 150, reps: 22 },
      ]),
      ...ceiling(),
    ];
    const view = buildStrengthView(sessions, PRESS, { load: 150 });
    expect(view.load_options.sort()).toEqual([150, 170]);
    expect(view.selected_load).toBe(150);
    expect(values(view.metrics[0]?.series ?? [])).toEqual([20, 22]);
    // A load that never recurred is not a valid selection.
    expect(buildStrengthView(sessions, PRESS, { load: 999 }).selected_load).not.toBe(999);
  });

  it('offers only loads used in at least two sessions', () => {
    const sessions = history('bench', [
      { weight: 100, reps: 5 },
      { weight: 105, reps: 5 },
      { weight: 110, reps: 5 },
    ]);
    const view = buildStrengthView(sessions, makeExercise());
    expect(view.load_options).toEqual([]);
    expect(view.selected_load).toBeNull();
    expect(view.metrics.some((m) => m.kind === 'reps_at_load')).toBe(false);
  });

  it('still leads with e1RM while the load is climbing', () => {
    const sessions = history('bench', [
      { weight: 100, reps: 5 },
      { weight: 105, reps: 5 },
      { weight: 110, reps: 5 },
    ]);
    expect(buildStrengthView(sessions, makeExercise()).default_key).toBe('e1rm');
  });

  it('falls back to best weight when there is a single session', () => {
    const view = buildStrengthView(history('bench', [{ weight: 100, reps: 5 }]), makeExercise());
    expect(view.default_key).toBe('max_load');
  });
});

describe('buildStrengthView — equipment contexts', () => {
  const gymA = history('machine-press', [
    { weight: 170, reps: 12 },
    { weight: 170, reps: 14 },
  ], { training_location_id: 'gym-a' });
  const gymB = history('machine-press', [
    { weight: 170, reps: 20 },
    { weight: 170, reps: 22 },
  ], { training_location_id: 'gym-b' });
  const legacy = history('machine-press', [{ weight: 170, reps: 8 }]);

  it('reports which contexts the exercise has been done in', () => {
    const view = buildStrengthView([...gymA, ...gymB, ...legacy], PRESS);
    expect(new Set(view.contexts)).toEqual(new Set(['gym-a', 'gym-b', null]));
  });

  it('builds a scoped series without mixing another gym\'s machine into it', () => {
    const all = [...gymA, ...gymB, ...legacy];
    const a = buildStrengthView(all, PRESS, { trainingLocationId: 'gym-a' });
    expect(values(a.metrics[0]?.series ?? [])).toEqual([12, 14]);
    const b = buildStrengthView(all, PRESS, { trainingLocationId: 'gym-b' });
    expect(values(b.metrics[0]?.series ?? [])).toEqual([20, 22]);
    const unscoped = buildStrengthView(all, PRESS, { trainingLocationId: null });
    expect(unscoped.load_options).toEqual([]); // one legacy session: nothing to trend yet
  });
});

describe('buildStrengthView — other measurement types', () => {
  it('offers reps for bodyweight, duration for timed, both for distance_time', () => {
    const bw = makeExercise({ id: 'pushup', measurement_type: 'reps_bodyweight' });
    const timed = makeExercise({ id: 'plank', measurement_type: 'time' });
    const both = makeExercise({ id: 'row', measurement_type: 'distance_time' });
    const s = (id: string, extra: object) => [makeSession([{ exerciseId: id, ...extra }], daysBefore(NOW, 3))];
    expect(buildStrengthView(s('pushup', { reps: 20 }), bw).metrics.map((m) => m.key)).toEqual(['reps']);
    expect(buildStrengthView(s('plank', { durationSeconds: 60 }), timed).metrics.map((m) => m.key)).toEqual([
      'duration',
    ]);
    expect(
      buildStrengthView(s('row', { durationSeconds: 60, distanceMeters: 500 }), both).metrics.map((m) => m.key),
    ).toEqual(['duration', 'distance']);
  });

  it('has no metrics or default for an exercise with no history shape', () => {
    const view = buildStrengthView([], makeExercise({ measurement_type: 'reps_weight' }));
    expect(view.metrics.every((m) => m.series.length === 0)).toBe(true);
    expect(view.load_options).toEqual([]);
  });
});

describe('trainedExercises', () => {
  it('lists exercises with completed work, most recent first, ignoring warm-ups and unfinished sessions', () => {
    const sessions = [
      makeSession([{ exerciseId: 'bench', weight: 100, reps: 5 }], daysBefore(NOW, 10)),
      makeSession([{ exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 2)),
      makeSession([{ exerciseId: 'bench', weight: 105, reps: 5 }], daysBefore(NOW, 5)),
      makeSession([{ exerciseId: 'squat', weight: 45, reps: 10, phase: 'warmup' }], daysBefore(NOW, 1)),
      makeSession([{ exerciseId: 'row', weight: 80, reps: 8 }], daysBefore(NOW, 1), { status: 'discarded' }),
    ];
    expect(trainedExercises(sessions).map((e) => [e.exercise_id, e.session_count])).toEqual([
      ['curl', 1],
      ['bench', 2],
    ]);
  });
});
