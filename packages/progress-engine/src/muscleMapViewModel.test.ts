import { describe, expect, it } from 'vitest';
import { buildMuscleMapViewModel, exercisePerformanceState } from './muscleMapViewModel';
import {
  daysBefore,
  exerciseTargeting,
  makePR,
  makeSession,
  planned,
} from './testFixtures';

const NOW = new Date('2026-09-24T12:00:00.000Z');

// Bench presses Upper AND Mid Chest (two muscles, one group) and assists Triceps + Front Delt.
const BENCH = exerciseTargeting('bench', ['chest.upper', 'chest.mid'], ['arms.triceps', 'shoulders.anterior']);
const CURL = exerciseTargeting('curl', ['arms.biceps'], ['arms.forearm_flexors']);
const SQUAT = exerciseTargeting('squat', ['quads.quadriceps', 'glutes.max'], ['back.erectors']);
const EXERCISES = new Map([BENCH, CURL, SQUAT].map((e) => [e.id, e]));

const benchSets = (n: number) =>
  Array.from({ length: n }, () => ({ exerciseId: 'bench', weight: 100, reps: 8 }));

function muscle(model: ReturnType<typeof buildMuscleMapViewModel>, id: string) {
  return model.muscles.find((m) => m.muscle_id === id);
}
function group(model: ReturnType<typeof buildMuscleMapViewModel>, id: string) {
  return model.groups.find((g) => g.group_id === id);
}

describe('buildMuscleMapViewModel — trained / volume', () => {
  it('counts primary-target working sets per muscle and keeps secondary separate', () => {
    const sessions = [makeSession(benchSets(4), daysBefore(NOW, 2))];
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions,
      exercises: EXERCISES,
      now: NOW,
    });

    expect(muscle(model, 'chest.mid')).toMatchObject({ primary_set_count: 4, secondary_set_count: 0 });
    expect(muscle(model, 'chest.upper')).toMatchObject({ primary_set_count: 4 });
    // Assisting muscles get their own count and NO primary credit -- and no fractions.
    expect(muscle(model, 'arms.triceps')).toMatchObject({ primary_set_count: 0, secondary_set_count: 4 });
    expect(muscle(model, 'shoulders.anterior')).toMatchObject({ primary_set_count: 0, secondary_set_count: 4 });
    for (const m of model.muscles) {
      expect(Number.isInteger(m.primary_set_count)).toBe(true);
      expect(Number.isInteger(m.secondary_set_count)).toBe(true);
    }
  });

  it('counts a set once per GROUP even when its exercise hits two muscles of that group', () => {
    const sessions = [makeSession(benchSets(4), daysBefore(NOW, 2))];
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions,
      exercises: EXERCISES,
      now: NOW,
    });
    // 4 sets of bench = 4 sets of chest work, not 8, though two chest muscles each got 4.
    expect(group(model, 'chest')).toMatchObject({ primary_set_count: 4, secondary_set_count: 0 });
    expect(model.totals).toEqual({ working_sets: 4, workouts: 1 });
    expect(group(model, 'triceps')).toMatchObject({ primary_set_count: 0, secondary_set_count: 4 });
  });

  it('never counts a muscle as secondary for an exercise that also targets it as primary', () => {
    const odd = exerciseTargeting('odd', ['chest.mid'], ['chest.mid', 'arms.triceps']);
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions: [makeSession([{ exerciseId: 'odd', weight: 50, reps: 10 }], daysBefore(NOW, 1))],
      exercises: new Map([[odd.id, odd]]),
      now: NOW,
    });
    expect(muscle(model, 'chest.mid')).toMatchObject({ primary_set_count: 1, secondary_set_count: 0 });
  });

  it('only counts sets inside the selected period', () => {
    const sessions = [
      makeSession(benchSets(3), daysBefore(NOW, 3)),
      makeSession(benchSets(5), daysBefore(NOW, 20)),
      makeSession(benchSets(7), daysBefore(NOW, 60)),
    ];
    const at = (periodDays: number) =>
      muscle(
        buildMuscleMapViewModel({ mode: 'volume', periodDays, sessions, exercises: EXERCISES, now: NOW }),
        'chest.mid',
      )?.primary_set_count;
    expect(at(7)).toBe(3);
    expect(at(30)).toBe(8);
    expect(at(90)).toBe(15);
  });

  it('ignores warm-up sets, unfinished sessions, and future-dated sets', () => {
    const finished = makeSession(
      [
        { exerciseId: 'bench', weight: 45, reps: 10, phase: 'warmup' },
        { exerciseId: 'bench', weight: 100, reps: 8 },
      ],
      daysBefore(NOW, 1),
    );
    const discarded = makeSession(benchSets(6), daysBefore(NOW, 1), { status: 'discarded' });
    const future = makeSession(benchSets(6), daysBefore(NOW, -2));
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions: [finished, discarded, future],
      exercises: EXERCISES,
      now: NOW,
    });
    expect(muscle(model, 'chest.mid')?.primary_set_count).toBe(1);
    expect(model.totals.working_sets).toBe(1);
  });

  it('normalizes visual intensity to the busiest muscle and ranks by primary sets', () => {
    const sessions = [makeSession([...benchSets(4), { exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 1))];
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions,
      exercises: EXERCISES,
      now: NOW,
    });
    expect(muscle(model, 'chest.mid')?.normalized_visual_intensity).toBe(1);
    expect(muscle(model, 'arms.biceps')?.normalized_visual_intensity).toBeCloseTo(0.25);
    // A muscle that only assisted has no heat -- the map shows it as "secondary" instead.
    expect(muscle(model, 'arms.forearm_flexors')?.normalized_visual_intensity).toBe(0);
    const ranked = model.groups.map((g) => g.group_id);
    expect(ranked.indexOf('chest')).toBeLessThan(ranked.indexOf('biceps'));
  });

  it('trained mode measures how often (workouts), not how many sets', () => {
    const sessions = [
      makeSession(benchSets(10), daysBefore(NOW, 6)), // one long chest day
      makeSession([{ exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 5)),
      makeSession([{ exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 3)),
      makeSession([{ exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 1)),
    ];
    const model = buildMuscleMapViewModel({
      mode: 'trained',
      periodDays: 30,
      sessions,
      exercises: EXERCISES,
      now: NOW,
    });
    expect(muscle(model, 'arms.biceps')).toMatchObject({ workout_count: 3, primary_set_count: 3 });
    expect(muscle(model, 'chest.mid')).toMatchObject({ workout_count: 1, primary_set_count: 10 });
    expect(muscle(model, 'arms.biceps')?.normalized_visual_intensity).toBe(1);
    expect(muscle(model, 'chest.mid')?.normalized_visual_intensity).toBeCloseTo(1 / 3);
    expect(muscle(model, 'arms.biceps')?.last_trained_at).toBe(daysBefore(NOW, 1));
    expect(model.groups[0]?.group_id).toBe('biceps');
  });

  it('lists the exercises behind each muscle and group, most sets first', () => {
    const pushdown = exerciseTargeting('pushdown', ['arms.triceps']);
    const sessions = [
      makeSession(
        [...benchSets(3), { exerciseId: 'pushdown', weight: 50, reps: 12 }],
        daysBefore(NOW, 2),
      ),
      makeSession([{ exerciseId: 'pushdown', weight: 50, reps: 12 }, { exerciseId: 'pushdown', weight: 50, reps: 12 }], daysBefore(NOW, 1)),
    ];
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions,
      exercises: new Map([...EXERCISES, [pushdown.id, pushdown]]),
      now: NOW,
    });
    expect(muscle(model, 'arms.triceps')?.exercises).toEqual([{ exercise_id: 'pushdown', sets: 3 }]);
    expect(muscle(model, 'chest.mid')?.exercises).toEqual([{ exercise_id: 'bench', sets: 3 }]);
    // Assisting exercises are not listed as targeting the muscle.
    expect(muscle(model, 'shoulders.anterior')?.exercises).toEqual([]);
    expect(group(model, 'chest')?.exercises).toEqual([{ exercise_id: 'bench', sets: 3 }]);
  });

  it('reports an explicit empty state instead of an all-zero map', () => {
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 7,
      sessions: [makeSession(benchSets(3), daysBefore(NOW, 40))],
      exercises: EXERCISES,
      now: NOW,
    });
    expect(model.empty_reason).toBe('no_training_in_period');
    expect(model.muscles).toEqual([]);
    expect(model.groups).toEqual([]);
    expect(model.period.days).toBe(7);
  });

  it('counts an exercise with no muscle mapping in the totals but invents no muscles for it', () => {
    const mystery = exerciseTargeting('mystery', []);
    const model = buildMuscleMapViewModel({
      mode: 'volume',
      periodDays: 30,
      sessions: [makeSession([{ exerciseId: 'mystery', weight: 10, reps: 10 }], daysBefore(NOW, 1))],
      exercises: new Map([[mystery.id, mystery]]),
      now: NOW,
    });
    expect(model.totals.working_sets).toBe(1);
    expect(model.muscles).toEqual([]);
  });
});

describe('buildMuscleMapViewModel — focus', () => {
  it("summarizes the program week's planned sets, with each muscle's share of the week", () => {
    const model = buildMuscleMapViewModel({
      mode: 'focus',
      periodDays: 30,
      sessions: [],
      exercises: EXERCISES,
      plannedSessions: [
        [planned('bench', 4), planned('curl', 2)], // Monday
        [planned('squat', 6)], // Wednesday
        [planned('bench', 4)], // Friday
      ],
      now: NOW,
    });

    expect(model.totals).toEqual({ working_sets: 16, workouts: 3 });
    expect(model.period).toEqual({ days: null, start: null, end: null });
    expect(muscle(model, 'chest.mid')).toMatchObject({ primary_set_count: 8, workout_count: 2 });
    expect(muscle(model, 'chest.mid')?.focus_score).toBeCloseTo(8 / 16);
    expect(muscle(model, 'quads.quadriceps')).toMatchObject({ primary_set_count: 6, workout_count: 1 });
    expect(muscle(model, 'arms.forearm_flexors')).toMatchObject({ primary_set_count: 0, secondary_set_count: 2 });
    // Group total counts each planned set once (8 bench sets = 8 chest sets).
    expect(group(model, 'chest')).toMatchObject({ primary_set_count: 8, workout_count: 2 });
    expect(model.groups[0]?.group_id).toBe('chest');
    expect(muscle(model, 'chest.mid')?.normalized_visual_intensity).toBe(1);
    expect(model.empty_reason).toBeNull();
  });

  it('treats a planned exercise with no target set count as one set', () => {
    const model = buildMuscleMapViewModel({
      mode: 'focus',
      periodDays: 30,
      sessions: [],
      exercises: EXERCISES,
      plannedSessions: [[planned('curl', null)]],
    });
    expect(muscle(model, 'arms.biceps')?.primary_set_count).toBe(1);
  });

  it('has an explicit empty state when there is nothing planned', () => {
    const none = buildMuscleMapViewModel({ mode: 'focus', periodDays: 30, sessions: [], exercises: EXERCISES });
    expect(none.empty_reason).toBe('no_program');
    const restOnly = buildMuscleMapViewModel({
      mode: 'focus',
      periodDays: 30,
      sessions: [],
      exercises: EXERCISES,
      plannedSessions: [[]],
    });
    expect(restOnly.empty_reason).toBe('no_program');
    expect(restOnly.totals.workouts).toBe(0);
  });
});

describe('exercisePerformanceState / buildMuscleMapViewModel — performance', () => {
  const window = { start: NOW.getTime() - 30 * 86_400_000, end: NOW.getTime() };
  const bench = BENCH;

  it('is insufficient_data until there are two exposures to compare', () => {
    const s1 = makeSession(benchSets(3), daysBefore(NOW, 3));
    expect(exercisePerformanceState([s1], bench, [makePR({ source_session_id: s1.id })], window)).toBe(
      'insufficient_data',
    );
  });

  it('is progressing when a current PR was set inside the window by a non-baseline session', () => {
    const s1 = makeSession([{ exerciseId: 'bench', weight: 100, reps: 8 }], daysBefore(NOW, 10));
    const s2 = makeSession([{ exerciseId: 'bench', weight: 105, reps: 8 }], daysBefore(NOW, 3));
    const prs = [makePR({ source_session_id: s2.id, achieved_at: daysBefore(NOW, 3) })];
    expect(exercisePerformanceState([s1, s2], bench, prs, window)).toBe('progressing');
  });

  it('does not count baseline-session PRs as progress', () => {
    const s1 = makeSession([{ exerciseId: 'bench', weight: 120, reps: 8 }], daysBefore(NOW, 10));
    const s2 = makeSession([{ exerciseId: 'bench', weight: 100, reps: 8 }], daysBefore(NOW, 3));
    // The current best is still the first-ever session's number.
    const prs = [makePR({ source_session_id: s1.id, achieved_at: daysBefore(NOW, 10) })];
    expect(exercisePerformanceState([s1, s2], bench, prs, window)).toBe('stable');
  });

  it('ignores progress that happened before the window', () => {
    const s1 = makeSession([{ exerciseId: 'bench', weight: 100, reps: 8 }], daysBefore(NOW, 90));
    const s2 = makeSession([{ exerciseId: 'bench', weight: 105, reps: 8 }], daysBefore(NOW, 80));
    const s3 = makeSession([{ exerciseId: 'bench', weight: 105, reps: 8 }], daysBefore(NOW, 3));
    const prs = [makePR({ source_session_id: s2.id, achieved_at: daysBefore(NOW, 80) })];
    expect(exercisePerformanceState([s1, s2, s3], bench, prs, window)).toBe('stable');
  });

  it('is stalled when detectStagnation flags it (three comparable exposures, no PR among them)', () => {
    const sessions = [20, 12, 4].map((d) => makeSession(benchSets(3), daysBefore(NOW, d)));
    expect(exercisePerformanceState(sessions, bench, [], window)).toBe('stalled');
  });

  it('keeps equipment contexts apart: one exposure at each of two gyms is not comparable', () => {
    const a = makeSession(benchSets(3), daysBefore(NOW, 10), { training_location_id: 'gym-a' });
    const b = makeSession(benchSets(3), daysBefore(NOW, 3), { training_location_id: 'gym-b' });
    expect(exercisePerformanceState([a, b], bench, [], window)).toBe('insufficient_data');
  });

  it('rolls exercises up to a muscle with stalled > progressing > stable > insufficient, exposing the mix', () => {
    const press = exerciseTargeting('press', ['chest.mid']);
    const fly = exerciseTargeting('fly', ['chest.mid']);
    const pressS = [
      makeSession([{ exerciseId: 'press', weight: 100, reps: 8 }], daysBefore(NOW, 10)),
      makeSession([{ exerciseId: 'press', weight: 105, reps: 8 }], daysBefore(NOW, 3)),
    ];
    const flySessions = [20, 12, 4].map((d) =>
      makeSession([{ exerciseId: 'fly', weight: 30, reps: 12 }], daysBefore(NOW, d)),
    );
    const prs = [makePR({ exercise_id: 'press', source_session_id: pressS[1]!.id, achieved_at: daysBefore(NOW, 3) })];

    const model = buildMuscleMapViewModel({
      mode: 'performance',
      periodDays: 30,
      sessions: [...pressS, ...flySessions],
      exercises: new Map([press, fly].map((e) => [e.id, e])),
      personalRecords: prs,
      now: NOW,
    });

    const chest = muscle(model, 'chest.mid');
    expect(chest?.performance_state).toBe('stalled');
    expect(chest?.performance_counts).toEqual({ progressing: 1, stable: 0, stalled: 1, insufficient_data: 0 });
    expect(group(model, 'chest')?.performance_state).toBe('stalled');
    // The mix stays visible per exercise, alongside the real set counts in the window.
    expect(chest?.exercises).toEqual([
      { exercise_id: 'fly', sets: 3, performance_state: 'stalled' },
      { exercise_id: 'press', sets: 2, performance_state: 'progressing' },
    ]);
    expect(chest?.primary_set_count).toBe(5);
  });

  it('reports insufficient_data for a muscle whose only exercise has too little history', () => {
    const model = buildMuscleMapViewModel({
      mode: 'performance',
      periodDays: 30,
      sessions: [makeSession([{ exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 2))],
      exercises: EXERCISES,
      personalRecords: [],
      now: NOW,
    });
    expect(muscle(model, 'arms.biceps')?.performance_state).toBe('insufficient_data');
    expect(muscle(model, 'arms.biceps')?.normalized_visual_intensity).toBe(0);
    expect(model.empty_reason).toBeNull();
  });

  it('leaves out muscles that only assisted -- they have no associated exercise to judge', () => {
    const model = buildMuscleMapViewModel({
      mode: 'performance',
      periodDays: 30,
      sessions: [makeSession([{ exerciseId: 'curl', weight: 30, reps: 10 }], daysBefore(NOW, 2))],
      exercises: EXERCISES,
      personalRecords: [],
      now: NOW,
    });
    expect(muscle(model, 'arms.forearm_flexors')).toBeUndefined();
  });

  it('is empty when nothing was trained in the period', () => {
    const model = buildMuscleMapViewModel({
      mode: 'performance',
      periodDays: 7,
      sessions: [],
      exercises: EXERCISES,
      personalRecords: [],
      now: NOW,
    });
    expect(model.empty_reason).toBe('no_training_in_period');
  });
});
