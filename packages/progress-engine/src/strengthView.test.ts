import { describe, expect, it } from 'vitest';
import { DEFAULT_E1RM_ESTIMATOR, performanceContextKey } from '@atlas/pr-engine';
import { buildStrengthView, recordIndices, sessionsInContext, strengthContexts, trainedExercises } from './strengthView';
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
  const onMachine = (location: string | null, machine: string | null) => ({
    training_location_id: location,
    ...(machine ? { exercise_equipment: [{ exercise_id: 'machine-press', gym_equipment_id: machine }] } : {}),
  });
  const key = (location: string | null, machine: string | null) =>
    performanceContextKey({ training_location_id: location, gym_equipment_id: machine });

  const gymA = history('machine-press', [
    { weight: 170, reps: 12 },
    { weight: 170, reps: 14 },
  ], onMachine('gym-a', 'press-1'));
  const gymB = history('machine-press', [
    { weight: 170, reps: 20 },
    { weight: 170, reps: 22 },
  ], onMachine('gym-b', 'press-9'));
  const legacy = history('machine-press', [{ weight: 170, reps: 8 }]);

  it('reports the contexts the exercise has actually been done in -- location AND machine', () => {
    const view = buildStrengthView([...gymA, ...gymB, ...legacy], PRESS);
    expect(new Set(view.contexts.map((c) => c.key))).toEqual(
      new Set([key('gym-a', 'press-1'), key('gym-b', 'press-9'), key(null, null)]),
    );
    const a = view.contexts.find((c) => c.key === key('gym-a', 'press-1'));
    expect(a).toMatchObject({ training_location_id: 'gym-a', gym_equipment_id: 'press-1', session_count: 2 });
  });

  it('lists the most recently used context first, so a view opens where the owner last trained', () => {
    const set = [{ exerciseId: 'machine-press', weight: 170, reps: 12 }];
    const oldest = makeSession(set, daysBefore(NOW, 40));
    const middle = makeSession(set, daysBefore(NOW, 20), onMachine('gym-a', 'press-1'));
    const newest = makeSession(set, daysBefore(NOW, 2), onMachine('gym-b', 'press-9'));
    const view = buildStrengthView([middle, oldest, newest], PRESS);
    expect(view.contexts.map((c) => c.key)).toEqual([key('gym-b', 'press-9'), key('gym-a', 'press-1'), key(null, null)]);
  });

  it('builds a scoped series without mixing in the machine at another gym', () => {
    const all = [...gymA, ...gymB, ...legacy];
    const a = buildStrengthView(all, PRESS, { contextKey: key('gym-a', 'press-1') });
    expect(values(a.metrics[0]?.series ?? [])).toEqual([12, 14]);
    const b = buildStrengthView(all, PRESS, { contextKey: key('gym-b', 'press-9') });
    expect(values(b.metrics[0]?.series ?? [])).toEqual([20, 22]);
    const unscoped = buildStrengthView(all, PRESS, { contextKey: key(null, null) });
    expect(unscoped.load_options).toEqual([]); // one legacy session: nothing to trend yet
  });

  it('two machines at the SAME gym are two contexts with separate series', () => {
    const one = history('machine-press', [{ weight: 170, reps: 12 }, { weight: 170, reps: 14 }], onMachine('gym-a', 'press-1'));
    const two = history('machine-press', [{ weight: 120, reps: 10 }, { weight: 130, reps: 10 }], onMachine('gym-a', 'press-2'));
    const all = [...one, ...two];
    const view = buildStrengthView(all, PRESS);
    expect(view.contexts).toHaveLength(2);
    expect(new Set(view.contexts.map((c) => c.training_location_id))).toEqual(new Set(['gym-a']));
    const first = buildStrengthView(all, PRESS, { contextKey: key('gym-a', 'press-1') });
    const second = buildStrengthView(all, PRESS, { contextKey: key('gym-a', 'press-2') });
    expect(values(first.metrics.find((m) => m.key === 'max_load')?.series ?? [])).toEqual([170, 170]);
    expect(values(second.metrics.find((m) => m.key === 'max_load')?.series ?? [])).toEqual([120, 130]);
  });

  it('the same gym with no machine recorded is its own context beside the same gym on a recorded machine', () => {
    const bare = history('machine-press', [{ weight: 100, reps: 10 }], onMachine('gym-a', null));
    const known = history('machine-press', [{ weight: 140, reps: 10 }], onMachine('gym-a', 'press-1'));
    const view = buildStrengthView([...bare, ...known], PRESS);
    expect(view.contexts.map((c) => c.gym_equipment_id).sort()).toEqual([null, 'press-1']);
  });

  it('a single context means there is nothing to pick between', () => {
    expect(buildStrengthView(gymA, PRESS).contexts).toHaveLength(1);
    expect(buildStrengthView(legacy, PRESS).contexts).toHaveLength(1);
    expect(buildStrengthView([], PRESS).contexts).toEqual([]);
  });

  it('strengthContexts and sessionsInContext agree on what belongs to a context', () => {
    const all = [...gymA, ...gymB, ...legacy];
    for (const context of strengthContexts(all, PRESS)) {
      expect(sessionsInContext(all, PRESS.id, context.key)).toHaveLength(context.session_count);
    }
    expect(sessionsInContext(all, PRESS.id, undefined)).toBe(all);
  });

  it('a machine used by a different exercise in the same workout does not change this exercise context', () => {
    const [session] = history('machine-press', [{ weight: 100, reps: 10 }], {
      training_location_id: 'gym-a',
      exercise_equipment: [{ exercise_id: 'some-other-lift', gym_equipment_id: 'cable-1' }],
    });
    expect(buildStrengthView([session!], PRESS).contexts[0]).toMatchObject({ gym_equipment_id: null });
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
