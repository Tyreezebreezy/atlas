import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  discardWorkoutSession,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { calculatePRs } from './calculatePRs';
import { newPRsFromSession } from './detectNewPRs';

let exerciseCounter = 0;
function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  exerciseCounter += 1;
  return {
    id: overrides.id ?? `ex-${exerciseCounter}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: `Exercise ${exerciseCounter}`,
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

/** Builds one completed session at the given completed_at timestamp with the given sets already attached. */
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

describe('calculatePRs: weighted exercise (bench press style history)', () => {
  const bench = makeExercise({ id: 'bench', measurement_type: 'reps_weight' });

  // Matches the v0.0.6 handoff's own worked example exactly, so this test
  // and the later manual browser smoke test should agree.
  const session1 = completedSession(
    bench.id,
    [
      set({ exerciseId: bench.id, weight: 135, reps: 10 }),
      set({ exerciseId: bench.id, weight: 155, reps: 8 }),
      set({ exerciseId: bench.id, weight: 165, reps: 6 }),
    ],
    '2026-08-01T10:00:00.000Z',
  );
  const session2 = completedSession(
    bench.id,
    [
      set({ exerciseId: bench.id, weight: 165, reps: 8 }),
      set({ exerciseId: bench.id, weight: 175, reps: 6 }),
      set({ exerciseId: bench.id, weight: 185, reps: 5 }),
    ],
    '2026-08-08T10:00:00.000Z',
  );
  const session3 = completedSession(
    bench.id,
    [
      set({ exerciseId: bench.id, weight: 185, reps: 8 }),
      set({ exerciseId: bench.id, weight: 205, reps: 5 }),
      set({ exerciseId: bench.id, weight: 225, reps: 1 }),
    ],
    '2026-08-15T10:00:00.000Z',
  );
  const sessions = [session1, session2, session3];

  it('max_load = 225 (heaviest weight lifted, any reps)', () => {
    const prs = calculatePRs(sessions, bench);
    const maxLoad = prs.find((p) => p.kind === 'max_load');
    expect(maxLoad?.value).toBe(225);
    expect(maxLoad?.reps).toBe(1);
    expect(maxLoad?.source_session_id).toBe(session3.id);
  });

  it('rep_range is generic per observed rep count -- 225x1, 205x5, 185x10-and-185x8 both tracked independently', () => {
    const prs = calculatePRs(sessions, bench).filter((p) => p.kind === 'rep_range');
    const byReps = new Map(prs.map((p) => [p.reps, p.value]));
    expect(byReps.get(1)).toBe(225);
    expect(byReps.get(5)).toBe(205);
    expect(byReps.get(8)).toBe(185); // best of 155x8 (session1) and 185x8 (session3) -- 185 wins
    expect(byReps.get(10)).toBe(135);
    expect(byReps.get(6)).toBe(175); // best of 165x6 and 175x6
  });

  it('estimated_1rm picks the highest e1RM across all eligible sets, using the default (Brzycki) estimator', () => {
    const prs = calculatePRs(sessions, bench);
    const e1rm = prs.find((p) => p.kind === 'estimated_1rm');
    // 225x1 -> 225 (reps=1 always resolves to weight unchanged, both estimators);
    // 205x5 -> 205*36/32=230.625; 185x8 -> 185*36/29=229.655 -- 205x5 wins.
    expect(e1rm?.value).toBeCloseTo(230.625, 2);
    expect(e1rm?.source_session_id).toBe(session3.id);
    expect(e1rm?.estimator_id).toBe('brzycki');
    expect(e1rm?.estimator_version).toBe('v1');
  });

  it('volume PR is the best single SESSION total, not a per-set value', () => {
    const prs = calculatePRs(sessions, bench);
    const volume = prs.find((p) => p.kind === 'volume');
    // session3: 185*8 + 205*5 + 225*1 = 1480 + 1025 + 225 = 2730
    // session2: 165*8 + 175*6 + 185*5 = 1320 + 1050 + 925 = 3295
    // session1: 135*10 + 155*8 + 165*6 = 1350 + 1240 + 990 = 3580
    expect(volume?.value).toBe(3580);
    expect(volume?.source_session_id).toBe(session1.id);
  });

  it('rep PR (highest reps in one set, any weight) is independent of rep_range', () => {
    const prs = calculatePRs(sessions, bench);
    const rep = prs.find((p) => p.kind === 'rep');
    expect(rep?.value).toBe(10);
  });

  it('a bodyweight/timed/distance exercise never emits weighted-only kinds', () => {
    const prs = calculatePRs(sessions, bench).map((p) => p.kind);
    expect(new Set(prs)).toEqual(
      new Set(['max_load', 'rep', 'rep_range', 'rep_at_load', 'estimated_1rm', 'volume']),
    );
  });

  it('rep_at_load is generic per observed load -- the dual of rep_range', () => {
    const prs = calculatePRs(sessions, bench).filter((p) => p.kind === 'rep_at_load');
    const byLoad = new Map(prs.map((p) => [p.load, p.value]));
    expect(byLoad.get(165)).toBe(8); // best reps at 165 across 165x6 (session1) and 165x8 (session2)
    expect(byLoad.get(185)).toBe(8); // best reps at 185 across 185x5 (session2) and 185x8 (session3)
    expect(byLoad.get(225)).toBe(1);
    // rep_at_load stores its metric (reps) in `value` and its identity in
    // `load`, never in `reps` -- avoids overloading that field with two
    // meanings depending on kind.
    const at185 = prs.find((p) => p.load === 185);
    expect(at185?.reps).toBeNull();
  });

  it('an equipment ceiling (same load, climbing reps across sessions) registers a new rep_at_load record each time', () => {
    const ceilingExercise = makeExercise({ id: 'chest-press-machine', measurement_type: 'reps_weight' });
    const ceilingSessions = [
      completedSession(ceilingExercise.id, [set({ exerciseId: ceilingExercise.id, weight: 170, reps: 12 })], '2026-09-01T10:00:00.000Z'),
      completedSession(ceilingExercise.id, [set({ exerciseId: ceilingExercise.id, weight: 170, reps: 15 })], '2026-09-08T10:00:00.000Z'),
      completedSession(ceilingExercise.id, [set({ exerciseId: ceilingExercise.id, weight: 170, reps: 18 })], '2026-09-15T10:00:00.000Z'),
    ];
    const repAtLoad = calculatePRs(ceilingSessions, ceilingExercise).find((p) => p.kind === 'rep_at_load');
    expect(repAtLoad?.load).toBe(170);
    expect(repAtLoad?.value).toBe(18);
    expect(repAtLoad?.source_session_id).toBe(ceilingSessions[2]?.id);
  });
});

describe('calculatePRs: vNext Handoff 02 load_semantics is inert (no active conversion built yet)', () => {
  it('a dumbbell_per_hand-tagged set contributes its logged weight as-is, never doubled', () => {
    const exercise = makeExercise({ id: 'db-press', measurement_type: 'reps_weight' });
    const tagged = set({ exerciseId: exercise.id, weight: 70, reps: 8 });
    const session = completedSession(exercise.id, [{ ...tagged, load_semantics: 'dumbbell_per_hand' }], '2026-08-01T10:00:00.000Z');
    const maxLoad = calculatePRs([session], exercise).find((p) => p.kind === 'max_load');
    expect(maxLoad?.value).toBe(70);
  });
});

describe('calculatePRs: vNext Handoff 02 equipment-context (training_location_id) scoping', () => {
  const chestPress = makeExercise({ id: 'chest-press', measurement_type: 'reps_weight' });

  it('does not scope PRs when no session records a location -- identical to pre-Handoff-02 behavior', () => {
    const unscoped = [
      completedSession(chestPress.id, [set({ exerciseId: chestPress.id, weight: 150, reps: 10 })], '2026-08-01T10:00:00.000Z'),
    ];
    const prs = calculatePRs(unscoped, chestPress);
    expect(prs.every((p) => p.training_location_id == null)).toBe(true);
  });

  it('keeps two locations\' max_load series independent -- a harder machine at Gym A never overwrites Gym B\'s max', () => {
    const gymA = completedSession(chestPress.id, [set({ exerciseId: chestPress.id, weight: 150, reps: 10 })], '2026-08-01T10:00:00.000Z');
    const gymB = completedSession(chestPress.id, [set({ exerciseId: chestPress.id, weight: 170, reps: 10 })], '2026-08-08T10:00:00.000Z');
    const sessions: WorkoutSession[] = [
      { ...gymA, training_location_id: 'loc-a' },
      { ...gymB, training_location_id: 'loc-b' },
    ];
    const maxLoads = calculatePRs(sessions, chestPress).filter((p) => p.kind === 'max_load');
    expect(maxLoads).toHaveLength(2);
    const byLocation = new Map(maxLoads.map((p) => [p.training_location_id, p.value]));
    expect(byLocation.get('loc-a')).toBe(150);
    expect(byLocation.get('loc-b')).toBe(170);
  });

  it('a session with no recorded location and a session with one never merge into the same series', () => {
    const unlocated = completedSession(chestPress.id, [set({ exerciseId: chestPress.id, weight: 150, reps: 10 })], '2026-08-01T10:00:00.000Z');
    const located = completedSession(chestPress.id, [set({ exerciseId: chestPress.id, weight: 200, reps: 10 })], '2026-08-08T10:00:00.000Z');
    const sessions: WorkoutSession[] = [unlocated, { ...located, training_location_id: 'loc-a' }];
    const maxLoads = calculatePRs(sessions, chestPress).filter((p) => p.kind === 'max_load');
    expect(maxLoads).toHaveLength(2);
    const unscopedRecord = maxLoads.find((p) => p.training_location_id == null);
    const scopedRecord = maxLoads.find((p) => p.training_location_id === 'loc-a');
    expect(unscopedRecord?.value).toBe(150);
    expect(scopedRecord?.value).toBe(200);
  });
});

describe('calculatePRs: eligibility rules', () => {
  const bench = makeExercise({ id: 'bench' });

  it('excludes warm-up sets from every kind', () => {
    const session = completedSession(
      bench.id,
      [
        set({ exerciseId: bench.id, weight: 300, reps: 5, phase: 'warmup' }),
        set({ exerciseId: bench.id, weight: 185, reps: 5 }),
      ],
      '2026-08-01T10:00:00.000Z',
    );
    const prs = calculatePRs([session], bench);
    expect(prs.find((p) => p.kind === 'max_load')?.value).toBe(185);
  });

  it('still excludes warm-ups from a genuinely pre-v0.2.0 stored session (no `phase` field, old `set_type: "warmup"` literal)', () => {
    const session = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 185, reps: 5 })],
      '2026-08-01T10:00:00.000Z',
    );
    // Simulate real stored data written before the phase/set_type split
    // existed: `phase` is entirely absent, and `set_type` carries the old
    // literal a pre-v0.2.0 record actually has on disk (TypeScript no
    // longer permits new code to write this, but old rows still have it).
    const legacyWarmup = { ...set({ exerciseId: bench.id, weight: 300, reps: 5 }) } as Record<
      string,
      unknown
    >;
    delete legacyWarmup.phase;
    legacyWarmup.set_type = 'warmup';
    const withLegacyWarmup: WorkoutSession = {
      ...session,
      performed_sets: [
        ...session.performed_sets,
        legacyWarmup as unknown as (typeof session.performed_sets)[number],
      ],
    };
    const prs = calculatePRs([withLegacyWarmup], bench);
    // 300 must NOT win despite being the heavier set -- it's a legacy warmup.
    expect(prs.find((p) => p.kind === 'max_load')?.value).toBe(185);
  });

  it('includes drop, amrap, and failure sets', () => {
    const session = completedSession(
      bench.id,
      [
        set({ exerciseId: bench.id, weight: 135, reps: 15, setType: 'amrap' }),
        set({ exerciseId: bench.id, weight: 115, reps: 20, setType: 'drop' }),
        set({ exerciseId: bench.id, weight: 185, reps: 3, setType: 'failure' }),
      ],
      '2026-08-01T10:00:00.000Z',
    );
    const prs = calculatePRs([session], bench);
    expect(prs.find((p) => p.kind === 'max_load')?.value).toBe(185);
    expect(prs.find((p) => p.kind === 'rep')?.value).toBe(20);
  });

  it('excludes in_progress, discarded, and skipped-whole-workout sessions', () => {
    const inProgress = startWorkoutSession({
      name: 'Live',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
    });
    const withSet = addPerformedSet(
      inProgress,
      set({ exerciseId: bench.id, weight: 500, reps: 1 }),
    );

    let discarded = startWorkoutSession({
      name: 'Abandoned',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
    });
    discarded = addPerformedSet(discarded, set({ exerciseId: bench.id, weight: 500, reps: 1 }));
    discarded = discardWorkoutSession(discarded);

    const prs = calculatePRs([withSet, discarded], bench);
    expect(prs).toEqual([]);
  });

  it('a per-exercise skip marker does not invalidate sets actually logged before the skip', () => {
    let session = startWorkoutSession({
      name: 'Partial',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
    });
    session = addPerformedSet(session, set({ exerciseId: bench.id, weight: 185, reps: 5 }));
    session = {
      ...session,
      skipped_exercises: [
        { exercise_id: bench.id, reason: 'ran out of time', skipped_at: session.updated_at },
      ],
    };
    session = completeWorkoutSession(session);

    const prs = calculatePRs([session], bench);
    expect(prs.find((p) => p.kind === 'max_load')?.value).toBe(185);
  });

  it('returns [] for an exercise with no completed history (first-session-safe, no crash)', () => {
    expect(calculatePRs([], bench)).toEqual([]);
  });
});

describe('calculatePRs: tie behavior', () => {
  const bench = makeExercise({ id: 'bench' });

  it('an equal value keeps crediting the earlier session (first achieved wins)', () => {
    const earlier = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const later = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
      '2026-08-08T10:00:00.000Z',
    );

    const prs = calculatePRs([earlier, later], bench);
    const maxLoad = prs.find((p) => p.kind === 'max_load');
    expect(maxLoad?.source_session_id).toBe(earlier.id);

    // and detectNewPRs correctly does NOT surface this as "new" for the later session
    expect(newPRsFromSession(prs, later.id, [])).toEqual([]);
  });

  it('is order-independent -- passing sessions newest-first produces the same result', () => {
    const older = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 185, reps: 5 })],
      '2026-08-01T10:00:00.000Z',
    );
    const newer = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
      '2026-08-08T10:00:00.000Z',
    );

    const forward = calculatePRs([older, newer], bench);
    const backward = calculatePRs([newer, older], bench);
    expect(forward.find((p) => p.kind === 'max_load')?.value).toBe(225);
    expect(backward.find((p) => p.kind === 'max_load')?.value).toBe(225);
  });
});

describe('calculatePRs: historical recalculation', () => {
  const bench = makeExercise({ id: 'bench' });

  it('inserting an older session that is NOT stronger does not change the current PR', () => {
    const recent = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
      '2026-08-08T10:00:00.000Z',
    );
    const before = calculatePRs([recent], bench);

    const olderWeaker = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 185, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const after = calculatePRs([recent, olderWeaker], bench);

    expect(before.find((p) => p.kind === 'max_load')?.value).toBe(225);
    expect(after.find((p) => p.kind === 'max_load')?.value).toBe(225);
    expect(after.find((p) => p.kind === 'max_load')?.source_session_id).toBe(recent.id);
  });

  it('inserting a stronger HISTORICAL session (backfilled old data) correctly moves the record backward in time', () => {
    const recent = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
      '2026-08-08T10:00:00.000Z',
    );
    const strongerOlder = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 245, reps: 1 })],
      '2026-07-01T10:00:00.000Z',
    );

    const prs = calculatePRs([recent, strongerOlder], bench);
    const maxLoad = prs.find((p) => p.kind === 'max_load');
    expect(maxLoad?.value).toBe(245);
    expect(maxLoad?.source_session_id).toBe(strongerOlder.id);
  });

  it('inserting a newer, stronger session moves the record forward', () => {
    const older = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 185, reps: 1 })],
      '2026-08-01T10:00:00.000Z',
    );
    const newerStronger = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
      '2026-08-15T10:00:00.000Z',
    );

    const prs = calculatePRs([older, newerStronger], bench);
    expect(prs.find((p) => p.kind === 'max_load')?.value).toBe(225);
    expect(prs.find((p) => p.kind === 'max_load')?.source_session_id).toBe(newerStronger.id);
  });

  it('exercise replacement (today-only) is transparent to PR calculation -- each exercise_id has its own independent history', () => {
    const replacement = makeExercise({ id: 'bench-alt' });
    // Sets logged before a replacement keep the original exercise_id; sets
    // after point at the replacement -- calculatePRs is called once per
    // exercise_id, so this falls out for free with no special-casing.
    const originalSession = completedSession(
      bench.id,
      [set({ exerciseId: bench.id, weight: 185, reps: 5 })],
      '2026-08-01T10:00:00.000Z',
    );
    const replacedSession = completedSession(
      replacement.id,
      [set({ exerciseId: replacement.id, weight: 135, reps: 8 })],
      '2026-08-08T10:00:00.000Z',
    );

    const benchPRs = calculatePRs([originalSession, replacedSession], bench);
    const altPRs = calculatePRs([originalSession, replacedSession], replacement);
    expect(benchPRs.find((p) => p.kind === 'max_load')?.value).toBe(185);
    expect(altPRs.find((p) => p.kind === 'max_load')?.value).toBe(135);
  });
});

describe('calculatePRs: non-weighted exercises', () => {
  it('bodyweight exercise gets a bodyweight PR, never a fake 0 lb max_load', () => {
    const pushup = makeExercise({ id: 'pushup', measurement_type: 'reps_bodyweight' });
    const session = completedSession(
      pushup.id,
      [set({ exerciseId: pushup.id, reps: 42 })],
      '2026-08-01T10:00:00.000Z',
    );
    const prs = calculatePRs([session], pushup);
    expect(prs).toEqual([expect.objectContaining({ kind: 'bodyweight', value: 42, reps: null })]);
  });

  it('timed exercise gets a timed PR from duration_seconds', () => {
    const plank = makeExercise({ id: 'plank', measurement_type: 'time' });
    const session = completedSession(
      plank.id,
      [
        set({ exerciseId: plank.id, durationSeconds: 90 }),
        set({ exerciseId: plank.id, durationSeconds: 123 }),
      ],
      '2026-08-01T10:00:00.000Z',
    );
    const prs = calculatePRs([session], plank);
    expect(prs.find((p) => p.kind === 'timed')?.value).toBe(123);
  });

  it('distance exercise gets a distance PR from distance_meters', () => {
    const carry = makeExercise({ id: 'carry', measurement_type: 'distance' });
    const session = completedSession(
      carry.id,
      [set({ exerciseId: carry.id, distanceMeters: 91.4 })],
      '2026-08-01T10:00:00.000Z',
    );
    const prs = calculatePRs([session], carry);
    expect(prs.find((p) => p.kind === 'distance')?.value).toBe(91.4);
  });
});

describe('newPRsFromSession', () => {
  const bench = makeExercise({ id: 'bench' });
  const first = completedSession(
    bench.id,
    [set({ exerciseId: bench.id, weight: 225, reps: 1 })],
    '2026-08-15T10:00:00.000Z',
  );
  const better = completedSession(
    bench.id,
    [set({ exerciseId: bench.id, weight: 235, reps: 1 })],
    '2026-08-22T10:00:00.000Z',
  );
  const eventFor = (session: WorkoutSession, context: { training_location_id?: string; gym_equipment_id?: string } = {}) => ({
    session_id: session.id,
    exercise_id: bench.id,
    training_location_id: context.training_location_id ?? null,
    gym_equipment_id: context.gym_equipment_id ?? null,
  });

  it('surfaces exactly the PR rows sourced from the given session that beat an earlier record', () => {
    const prs = calculatePRs([first, better], bench);
    const surfaced = newPRsFromSession(prs, better.id, [eventFor(better)]);
    expect(surfaced.length).toBeGreaterThan(0);
    expect(surfaced.every((pr) => pr.source_session_id === better.id)).toBe(true);
    expect(newPRsFromSession(prs, 'some-other-session', [eventFor(better)])).toEqual([]);
  });

  it('a first-ever session is a baseline: it sets records but, with no event, announces none', () => {
    const prs = calculatePRs([first], bench);
    expect(prs.length).toBeGreaterThan(0);
    expect(newPRsFromSession(prs, first.id, [])).toEqual([]);
  });

  it("only an event for this session counts -- another session's event does not announce this one's records", () => {
    const prs = calculatePRs([first, better], bench);
    expect(newPRsFromSession(prs, better.id, [eventFor(first)])).toEqual([]);
  });

  it('is scoped to the machine: an event on one machine does not announce a baseline on another', () => {
    const onMachine = (session: WorkoutSession, machine: string): WorkoutSession => ({
      ...session,
      training_location_id: 'gym',
      exercise_equipment: [{ exercise_id: bench.id, gym_equipment_id: machine }],
    });
    // #1 has history and is improved today; today's #2 set is that machine's first, so its baseline.
    const sessions = [onMachine(first, 'm1'), onMachine(better, 'm1')];
    const todayOn2 = onMachine(
      completedSession(bench.id, [set({ exerciseId: bench.id, weight: 100, reps: 5 })], '2026-08-22T11:00:00.000Z'),
      'm2',
    );
    const prs = calculatePRs([...sessions, todayOn2], bench);
    const events = [eventFor(sessions[1]!, { training_location_id: 'gym', gym_equipment_id: 'm1' })];
    expect(newPRsFromSession(prs, todayOn2.id, events)).toEqual([]);
    expect(newPRsFromSession(prs, sessions[1]!.id, events).length).toBeGreaterThan(0);
  });
});
