import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  exerciseEquipmentIdOf,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, PersonalRecordEvent, WorkoutSession } from '@atlas/data-model';
import { calculatePRs } from './calculatePRs';
import {
  performanceContextKey,
  performanceContextOf,
  sessionContextKey,
  sessionsPreferringContext,
  UNSPECIFIED_CONTEXT_KEY,
} from './context';
import { exposureSessions } from './exposure';
import {
  derivePREventsForExercise,
  personalRecordEventId,
  planPREventReconciliation,
  PR_EVENT_EVALUATOR_VERSION,
  type PREventReconciliation,
} from './prEvents';

function makeExercise(id: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name: id,
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

type SetSpec = Partial<LogSetInput> & { exerciseId: string };

function makeSession(
  sets: SetSpec[],
  completedAt: string,
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  let session = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
  });
  sets.forEach((input, index) => {
    const performed = createPerformedSet({
      setIndex: index,
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
    session = addPerformedSet(session, { ...performed, completed_at: completedAt });
  });
  session = completeWorkoutSession(session);
  return { ...session, completed_at: completedAt, ...overrides };
}

const press = makeExercise('press');
const row = makeExercise('row');
const lift = (exercise: Exercise, weight: number, reps: number): SetSpec => ({
  exerciseId: exercise.id,
  weight,
  reps,
});
const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}T10:00:00.000Z`;

/** A session's recorded context: which gym, and which machine `exercise` was done on. */
function at(
  location: string | null,
  instance: string | null,
  exercise: Exercise = press,
): Partial<WorkoutSession> {
  return {
    training_location_id: location,
    ...(instance
      ? { exercise_equipment: [{ exercise_id: exercise.id, gym_equipment_id: instance }] }
      : {}),
  };
}

function apply(stored: PersonalRecordEvent[], plan: PREventReconciliation): PersonalRecordEvent[] {
  const removed = new Set(plan.remove);
  const byId = new Map(stored.filter((e) => !removed.has(e.id)).map((e) => [e.id, e]));
  for (const event of plan.upsert) byId.set(event.id, event);
  return [...byId.values()];
}

function reconcile(stored: PersonalRecordEvent[], sessions: WorkoutSession[], exercise: Exercise) {
  const exposures = exposureSessions(sessions);
  return planPREventReconciliation(
    stored,
    derivePREventsForExercise(sessions, exercise, exposures),
    exposures,
  );
}

describe('performanceContextOf', () => {
  it('is the session location plus the machine THIS exercise ran on', () => {
    const session = makeSession([lift(press, 100, 8), lift(row, 80, 10)], day(1), {
      training_location_id: 'gym-a',
      exercise_equipment: [{ exercise_id: 'press', gym_equipment_id: 'machine-1' }],
    });
    expect(performanceContextOf(session, 'press')).toEqual({
      training_location_id: 'gym-a',
      gym_equipment_id: 'machine-1',
    });
    // The row was done on unspecified equipment in the same workout: same gym, no machine.
    expect(performanceContextOf(session, 'row')).toEqual({
      training_location_id: 'gym-a',
      gym_equipment_id: null,
    });
    expect(exerciseEquipmentIdOf(session, 'press')).toBe('machine-1');
    expect(exerciseEquipmentIdOf(session, 'row')).toBeNull();
  });

  it('a session from before any of this was recorded is the one unspecified context', () => {
    const legacy = makeSession([lift(press, 100, 8)], day(1));
    expect(sessionContextKey(legacy, 'press')).toBe(UNSPECIFIED_CONTEXT_KEY);
    expect(performanceContextKey({})).toBe(UNSPECIFIED_CONTEXT_KEY);
    expect(performanceContextKey({ training_location_id: null, gym_equipment_id: null })).toBe(
      UNSPECIFIED_CONTEXT_KEY,
    );
  });

  it('two contexts are the same series only when BOTH the gym and the machine match', () => {
    const key = (loc: string | null, eq: string | null) =>
      performanceContextKey({ training_location_id: loc, gym_equipment_id: eq });
    expect(key('gym-a', 'm1')).toBe(key('gym-a', 'm1'));
    expect(key('gym-a', 'm1')).not.toBe(key('gym-a', 'm2'));
    expect(key('gym-a', 'm1')).not.toBe(key('gym-b', 'm1'));
    expect(key('gym-a', null)).not.toBe(key('gym-a', 'm1'));
    expect(key(null, 'm1')).not.toBe(key('gym-a', 'm1'));
  });
});

describe('calculatePRs scopes records by the actual machine', () => {
  it("two machines at the same gym keep separate current bests, and neither borrows the other's load", () => {
    const sessions = [
      makeSession([lift(press, 170, 10)], day(1), at('gym-a', 'machine-1')),
      makeSession([lift(press, 120, 10)], day(8), at('gym-a', 'machine-2')),
    ];
    const maxLoads = calculatePRs(sessions, press).filter((p) => p.kind === 'max_load');
    expect(maxLoads).toHaveLength(2);
    const byMachine = new Map(maxLoads.map((p) => [p.gym_equipment_id, p.value]));
    expect(byMachine.get('machine-1')).toBe(170);
    expect(byMachine.get('machine-2')).toBe(120);
    expect(maxLoads.every((p) => p.training_location_id === 'gym-a')).toBe(true);
  });

  it('the same exercise at another gym is its own series', () => {
    const sessions = [
      makeSession([lift(press, 170, 10)], day(1), at('gym-a', 'machine-1')),
      makeSession([lift(press, 90, 10)], day(8), at('gym-b', 'machine-9')),
    ];
    const maxLoads = calculatePRs(sessions, press).filter((p) => p.kind === 'max_load');
    expect(new Set(maxLoads.map((p) => `${p.training_location_id}/${p.gym_equipment_id}`))).toEqual(
      new Set(['gym-a/machine-1', 'gym-b/machine-9']),
    );
  });

  it('legacy history stays one unspecified series and is never assigned equipment', () => {
    const sessions = [
      makeSession([lift(press, 100, 8)], day(1)),
      makeSession([lift(press, 110, 8)], day(8)),
      makeSession([lift(press, 200, 5)], day(15), at('gym-a', 'machine-1')),
    ];
    const maxLoads = calculatePRs(sessions, press).filter((p) => p.kind === 'max_load');
    const legacy = maxLoads.find(
      (p) => p.training_location_id == null && p.gym_equipment_id == null,
    );
    expect(legacy?.value).toBe(110);
    expect(maxLoads.find((p) => p.gym_equipment_id === 'machine-1')?.value).toBe(200);
    expect(maxLoads).toHaveLength(2);
  });

  it('a gym with no machine recorded is distinct from the same gym on a recorded machine', () => {
    const sessions = [
      makeSession([lift(press, 100, 8)], day(1), at('gym-a', null)),
      makeSession([lift(press, 140, 8)], day(8), at('gym-a', 'machine-1')),
    ];
    const maxLoads = calculatePRs(sessions, press).filter((p) => p.kind === 'max_load');
    expect(maxLoads.map((p) => [p.gym_equipment_id, p.value]).sort()).toEqual([
      [null, 100],
      ['machine-1', 140],
    ]);
  });

  it('every record carries its context, null for the parts a session did not record', () => {
    const [record] = calculatePRs([makeSession([lift(press, 100, 8)], day(1))], press);
    expect(record).toMatchObject({ training_location_id: null, gym_equipment_id: null });
  });
});

describe('exposureSessions: each machine has its own baseline', () => {
  it("a first session on a new machine is that machine's baseline, even after many sessions on another", () => {
    const sessions = [
      makeSession([lift(press, 100, 8)], day(1), at('gym-a', 'machine-1')),
      makeSession([lift(press, 105, 8)], day(8), at('gym-a', 'machine-1')),
      makeSession([lift(press, 60, 8)], day(15), at('gym-a', 'machine-2')),
    ];
    const contexts = exposureSessions(sessions).get('press');
    expect(contexts?.size).toBe(2);
    const second = contexts?.get(
      performanceContextKey({ training_location_id: 'gym-a', gym_equipment_id: 'machine-2' }),
    );
    expect(second).toHaveLength(1);
  });
});

describe('headline PR events scope by the actual machine', () => {
  const machine1 = (completedAt: string, weight: number) =>
    makeSession([lift(press, weight, 8)], completedAt, at('gym-a', 'machine-1'));
  const machine2 = (completedAt: string, weight: number) =>
    makeSession([lift(press, weight, 8)], completedAt, at('gym-a', 'machine-2'));

  it("same exercise on Machine A builds context A's history only", () => {
    const sessions = [machine1(day(1), 100), machine1(day(8), 110), machine1(day(15), 120)];
    const events = derivePREventsForExercise(sessions, press);
    expect(events.map((e) => e.session_id)).toEqual([sessions[1]?.id, sessions[2]?.id]);
    expect(
      events.every((e) => e.gym_equipment_id === 'machine-1' && e.training_location_id === 'gym-a'),
    ).toBe(true);
  });

  it('Machine B at the same gym is a separate history: a heavier first session there is a baseline, not a PR over Machine A', () => {
    const a1 = machine1(day(1), 100);
    const a2 = machine1(day(8), 110);
    const b1 = machine2(day(10), 150); // far above machine 1's best -- but a different machine
    const a3 = machine1(day(12), 105); // below machine 1's own best: not an improvement
    const b2 = machine2(day(15), 155);
    const events = derivePREventsForExercise([a1, a2, b1, a3, b2], press);
    expect(events.map((e) => [e.session_id, e.gym_equipment_id])).toEqual([
      [a2.id, 'machine-1'],
      [b2.id, 'machine-2'],
    ]);
  });

  it('the same exercise at another gym is a separate history', () => {
    const home1 = makeSession([lift(press, 100, 8)], day(1), at('home', 'home-bench'));
    const home2 = makeSession([lift(press, 105, 8)], day(8), at('home', 'home-bench'));
    const gym1 = makeSession([lift(press, 60, 8)], day(10), at('gym-a', 'machine-1'));
    const events = derivePREventsForExercise([home1, home2, gym1], press);
    expect(events.map((e) => e.session_id)).toEqual([home2.id]);
    expect(events[0]?.training_location_id).toBe('home');
  });

  it('legacy history with no equipment stays valid and separate from located history', () => {
    const l1 = makeSession([lift(press, 100, 8)], day(1));
    const l2 = makeSession([lift(press, 110, 8)], day(8));
    const located = makeSession([lift(press, 300, 8)], day(15), at('gym-a', 'machine-1'));
    const events = derivePREventsForExercise([l1, l2, located], press);
    expect(events.map((e) => e.session_id)).toEqual([l2.id]); // the located session is its own baseline
    expect(events[0]).toMatchObject({ training_location_id: null, gym_equipment_id: null });
  });

  it('new events record the real equipment context, and their id includes it', () => {
    const sessions = [machine1(day(1), 100), machine1(day(8), 110)];
    const exposures = exposureSessions(sessions);
    const plan = planPREventReconciliation(
      [],
      derivePREventsForExercise(sessions, press, exposures),
      exposures,
    );
    expect(plan.upsert).toHaveLength(1);
    const [event] = plan.upsert;
    expect(event).toMatchObject({
      training_location_id: 'gym-a',
      gym_equipment_id: 'machine-1',
      evaluator_version: PR_EVENT_EVALUATOR_VERSION,
    });
    expect(event?.id).toBe(
      personalRecordEventId(sessions[1]?.id ?? '', 'press', 'gym-a', 'machine-1'),
    );
    expect(event?.id.endsWith(':machine-1')).toBe(true);
  });

  it('an event with no equipment keeps exactly the id it had before equipment was captured', () => {
    expect(personalRecordEventId('s1', 'press', 'gym-a')).toBe('pr-event:s1:press:gym-a');
    expect(personalRecordEventId('s1', 'press', null)).toBe('pr-event:s1:press:none');
    expect(personalRecordEventId('s1', 'press', 'gym-a', null)).toBe('pr-event:s1:press:gym-a');
    expect(personalRecordEventId('s1', 'press', 'gym-a', 'm1')).toBe('pr-event:s1:press:gym-a:m1');
  });
});

describe('evaluator version 2 leaves version-1 history exactly as it was', () => {
  it('names the equipment-aware derivation', () => {
    expect(PR_EVENT_EVALUATOR_VERSION.startsWith('pr-events-2/')).toBe(true);
  });

  it('re-deriving legacy sessions reproduces the version-1 event: nothing is rewritten or removed', () => {
    const legacy = [
      makeSession([lift(press, 100, 8)], day(1)),
      makeSession([lift(press, 110, 8)], day(8)),
    ];
    // The event as 04A.1 wrote it: no gym_equipment_id, evaluator version 1.
    const [derived] = derivePREventsForExercise(legacy, press);
    const v1: PersonalRecordEvent = {
      id: personalRecordEventId(derived?.session_id ?? '', 'press', null),
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      version: 1,
      device_id: 'old-device',
      deleted_at: null,
      session_id: derived?.session_id ?? '',
      exercise_id: 'press',
      training_location_id: null,
      achieved_at: derived?.achieved_at ?? '',
      pr_kinds: ['max_load'], // deliberately different from the derivation: a frozen event is not re-evaluated
      evaluator_version: 'pr-events-1/brzycki-v1',
    };
    const plan = reconcile([v1], legacy, press);
    expect(plan.upsert).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('new equipment-scoped events are added beside untouched version-1 events', () => {
    const legacy = [
      makeSession([lift(press, 100, 8)], day(1)),
      makeSession([lift(press, 110, 8)], day(8)),
    ];
    const [derived] = derivePREventsForExercise(legacy, press);
    const v1: PersonalRecordEvent = {
      id: personalRecordEventId(derived?.session_id ?? '', 'press', null),
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      version: 1,
      device_id: 'old-device',
      deleted_at: null,
      session_id: derived?.session_id ?? '',
      exercise_id: 'press',
      training_location_id: null,
      achieved_at: derived?.achieved_at ?? '',
      pr_kinds: derived?.pr_kinds ?? [],
      evaluator_version: 'pr-events-1/brzycki-v1',
    };
    const newer = [
      makeSession([lift(press, 100, 8)], day(20), at('gym-a', 'machine-1')),
      makeSession([lift(press, 105, 8)], day(27), at('gym-a', 'machine-1')),
    ];
    const plan = reconcile([v1], [...legacy, ...newer], press);
    expect(plan.remove).toEqual([]);
    expect(plan.upsert).toHaveLength(1);
    expect(plan.upsert[0]?.gym_equipment_id).toBe('machine-1');
    const after = apply([v1], plan);
    expect(after).toHaveLength(2);
    expect(after.find((e) => e.id === v1.id)?.evaluator_version).toBe('pr-events-1/brzycki-v1');
  });

  it('is idempotent with equipment contexts: planning again after applying does nothing', () => {
    const sessions = [
      makeSession([lift(press, 100, 8)], day(1), at('gym-a', 'machine-1')),
      makeSession([lift(press, 110, 8)], day(8), at('gym-a', 'machine-1')),
      makeSession([lift(press, 70, 8)], day(10), at('gym-a', 'machine-2')),
      makeSession([lift(press, 75, 8)], day(15), at('gym-a', 'machine-2')),
    ];
    const first = apply([], reconcile([], sessions, press));
    expect(first).toHaveLength(2);
    const again = reconcile(first, sessions, press);
    expect(again.upsert).toEqual([]);
    expect(again.remove).toEqual([]);
  });

  it('moving a session to another machine retires its current-version event and derives it under the new context', () => {
    const base = makeSession([lift(press, 100, 8)], day(1), at('gym-a', 'machine-1'));
    const improved = makeSession([lift(press, 110, 8)], day(8), at('gym-a', 'machine-1'));
    const stored = apply([], reconcile([], [base, improved], press));
    expect(stored).toHaveLength(1);

    // The owner corrects which machine the second session used.
    const corrected: WorkoutSession = {
      ...improved,
      exercise_equipment: [{ exercise_id: 'press', gym_equipment_id: 'machine-2' }],
    };
    const plan = reconcile(stored, [base, corrected], press);
    expect(plan.remove).toEqual(stored.map((e) => e.id)); // machine-1 history no longer has it
    expect(plan.upsert).toEqual([]); // machine-2's first session is a baseline: no event
  });
});

describe('sessionsPreferringContext: what "Last time" and the progression baseline compare with', () => {
  const main1 = makeSession([lift(press, 170, 12)], day(1), at('gym-a', 'machine-1'));
  const main2 = makeSession([lift(press, 170, 16)], day(8), at('gym-a', 'machine-1'));
  const hotel = makeSession([lift(press, 105, 10)], day(15), at('hotel', 'hotel-press'));
  const legacy = makeSession([lift(press, 150, 12)], day(20));
  const all = [legacy, main1, main2, hotel];

  it('prefers the same machine at the same place when the exercise has been done there', () => {
    const pool = sessionsPreferringContext(all, 'press', {
      training_location_id: 'gym-a',
      gym_equipment_id: 'machine-1',
    });
    expect(pool.map((s) => s.id)).toEqual([main1.id, main2.id]); // not the lighter hotel machine, not legacy
  });

  it('falls back to all history for a context it has never been done in, so a new machine or gym still has a starting point', () => {
    const pool = sessionsPreferringContext(all, 'press', {
      training_location_id: 'gym-b',
      gym_equipment_id: 'gym-b-press',
    });
    expect(pool).toBe(all);
  });

  it('a second machine at a known gym is a new context: it carries on from the program, not a blank page', () => {
    expect(
      sessionsPreferringContext(all, 'press', {
        training_location_id: 'gym-a',
        gym_equipment_id: 'machine-2',
      }),
    ).toBe(all);
  });

  it('with no place and no machine it prefers the unspecified legacy history', () => {
    expect(sessionsPreferringContext(all, 'press', {}).map((s) => s.id)).toEqual([legacy.id]);
  });

  it('ignores sessions that are unfinished or that never did this exercise', () => {
    const unfinished = { ...main1, status: 'in_progress' as const };
    const otherLift = makeSession([lift(row, 100, 10)], day(2), at('gym-a', 'machine-1', row));
    expect(
      sessionsPreferringContext([unfinished, otherLift, hotel], 'press', {
        training_location_id: 'gym-a',
        gym_equipment_id: 'machine-1',
      }),
    ).toEqual([unfinished, otherLift, hotel]); // nothing qualifies in that context, so the full pool comes back unchanged
  });
});
