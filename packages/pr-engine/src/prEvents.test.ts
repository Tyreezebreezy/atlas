import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, PersonalRecordEvent, WorkoutSession } from '@atlas/data-model';
import { calculatePRs } from './calculatePRs';
import { exposureSessions } from './exposure';
import {
  derivePREventsForExercise,
  HEADLINE_PRIMARY_KIND_ORDER,
  personalRecordEventId,
  planPREventReconciliation,
  prEventsInPeriod,
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

function makeSession(sets: SetSpec[], completedAt: string, overrides: Partial<WorkoutSession> = {}): WorkoutSession {
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

const bench = makeExercise('bench');
const squat = makeExercise('squat');
const pushup = makeExercise('pushup', { measurement_type: 'reps_bodyweight' });

const lift = (exercise: Exercise, weight: number, reps: number): SetSpec => ({ exerciseId: exercise.id, weight, reps });
const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const sessionIds = (events: { session_id: string }[]) => events.map((e) => e.session_id);

/** Simulates writing a reconciliation plan to storage. */
function apply(stored: PersonalRecordEvent[], plan: PREventReconciliation): PersonalRecordEvent[] {
  const removed = new Set(plan.remove);
  const byId = new Map(stored.filter((e) => !removed.has(e.id)).map((e) => [e.id, e]));
  for (const event of plan.upsert) byId.set(event.id, event);
  return [...byId.values()];
}

function reconcile(stored: PersonalRecordEvent[], sessions: WorkoutSession[], exercise: Exercise) {
  const exposures = exposureSessions(sessions);
  return planPREventReconciliation(stored, derivePREventsForExercise(sessions, exercise, exposures), exposures);
}

describe('derivePREventsForExercise: baseline and improvement', () => {
  it('treats a first-ever performance as a baseline: no event, even though it sets every record', () => {
    const only = makeSession([lift(bench, 100, 8), lift(bench, 105, 6), lift(bench, 95, 10)], day(1));
    expect(calculatePRs([only], bench).length).toBeGreaterThan(5);
    expect(derivePREventsForExercise([only], bench)).toEqual([]);
  });

  it('counts a machine at a fixed load: 170 x 12 is a baseline (0), 170 x 14 is the first event (1)', () => {
    const a = makeSession([lift(bench, 170, 12)], day(1));
    const b = makeSession([lift(bench, 170, 14)], day(8));
    expect(derivePREventsForExercise([a], bench)).toHaveLength(0);
    expect(sessionIds(derivePREventsForExercise([a, b], bench))).toEqual([b.id]);
  });

  it('records a second historical event for a third improved exposure', () => {
    const a = makeSession([lift(bench, 100, 8)], day(1));
    const b = makeSession([lift(bench, 105, 8)], day(8));
    const c = makeSession([lift(bench, 110, 8)], day(15));
    expect(sessionIds(derivePREventsForExercise([a, b, c], bench))).toEqual([b.id, c.id]);
  });

  it('does not count a session that only ties an earlier performance', () => {
    const a = makeSession([lift(bench, 100, 8)], day(1));
    const tie = makeSession([lift(bench, 100, 8)], day(8));
    expect(derivePREventsForExercise([a, tie], bench)).toEqual([]);
  });

  it('turns the several detailed records one performance beats into exactly one event, and lists them primary-first', () => {
    const first = makeSession([lift(bench, 100, 8)], day(1));
    // 105 x 8 beats the max load, the 8-rep weight and the e1RM; 100 x 10 beats the reps at 100 lb.
    const second = makeSession([lift(bench, 105, 8), lift(bench, 100, 10)], day(8));

    const events = derivePREventsForExercise([first, second], bench);
    expect(events).toHaveLength(1);
    const kinds = events[0]?.pr_kinds ?? [];
    expect(kinds).toEqual(expect.arrayContaining(['max_load', 'estimated_1rm', 'rep_at_load']));
    expect(new Set(kinds).size).toBe(kinds.length); // distinct
    // Ordered by the display priority, so the primary kind leads.
    const rank = (k: string) => HEADLINE_PRIMARY_KIND_ORDER.indexOf(k as (typeof HEADLINE_PRIMARY_KIND_ORDER)[number]);
    expect(kinds.map(rank)).toEqual([...kinds.map(rank)].sort((x, y) => x - y));
    expect(kinds[0]).toBe('max_load');
  });

  it('does not count a lighter day that only reaches a load or rep count never used before', () => {
    const heavy = makeSession([lift(bench, 225, 5)], day(1));
    const light = makeSession([lift(bench, 215, 5)], day(8));
    // The engine does set a record row for the new 215 lb load...
    const rows = calculatePRs([heavy, light], bench).filter((r) => r.source_session_id === light.id);
    expect(rows.map((r) => r.kind)).toEqual(['rep_at_load']);
    // ...but that beat nothing anyone had done, so it is not a PR event.
    expect(derivePREventsForExercise([heavy, light], bench)).toEqual([]);
  });

  it('lists only the kinds the session beat, not a first-time record it also set', () => {
    const first = makeSession([lift(bench, 100, 8)], day(1));
    const second = makeSession([lift(bench, 105, 8)], day(8)); // 105 lb is a new load: a rep-at-load row, but a first-time one
    const [event] = derivePREventsForExercise([first, second], bench);
    expect(event?.pr_kinds).toContain('max_load');
    expect(event?.pr_kinds).not.toContain('rep_at_load');
  });

  it('gives two exercises in one session two events', () => {
    const first = makeSession([lift(bench, 100, 8), lift(squat, 150, 5)], day(1));
    const second = makeSession([lift(bench, 105, 8), lift(squat, 155, 5)], day(8));
    const sessions = [first, second];
    expect(sessionIds(derivePREventsForExercise(sessions, bench))).toEqual([second.id]);
    expect(sessionIds(derivePREventsForExercise(sessions, squat))).toEqual([second.id]);
  });

  it('keeps one exercise at two equipment contexts separate, each with its own baseline', () => {
    const at = (loc: string, dayNumber: number, weight: number) =>
      makeSession([lift(bench, weight, 8)], day(dayNumber), { training_location_id: loc });
    const a1 = at('gym-a', 1, 100); // baseline at A
    const a2 = at('gym-a', 8, 105); // event at A
    const b1 = at('gym-b', 15, 60); // first time at B: baseline at B despite the history at A
    const b2 = at('gym-b', 22, 65); // event at B
    const events = derivePREventsForExercise([a1, a2, b1, b2], bench);

    expect(events.map((e) => [e.session_id, e.training_location_id])).toEqual([
      [a2.id, 'gym-a'],
      [b2.id, 'gym-b'],
    ]);
    expect(new Set(events.map((e) => personalRecordEventId(e.session_id, e.exercise_id, e.training_location_id))).size).toBe(2);
  });

  it('supports unlocated legacy history as its own context, never guessing a gym', () => {
    const a = makeSession([lift(bench, 100, 8)], day(1));
    const b = makeSession([lift(bench, 105, 8)], day(8));
    const [event] = derivePREventsForExercise([a, b], bench);
    expect(event?.training_location_id).toBeNull();
    expect(personalRecordEventId(b.id, 'bench', null)).toContain(':none');
  });

  it('ignores warm-up-only and unfinished sessions when deciding what came first', () => {
    const warmupOnly = makeSession([{ exerciseId: 'bench', weight: 45, reps: 10, phase: 'warmup' }], day(1));
    const unfinished = makeSession([lift(bench, 90, 8)], day(2), { status: 'in_progress' });
    const first = makeSession([lift(bench, 100, 8)], day(3));
    const second = makeSession([lift(bench, 105, 8)], day(10));
    const events = derivePREventsForExercise([warmupOnly, unfinished, first, second], bench);
    expect(sessionIds(events)).toEqual([second.id]);
  });

  it('records estimator provenance only when an e1RM record contributed', () => {
    const a = makeSession([lift(bench, 100, 8)], day(1));
    const b = makeSession([lift(bench, 110, 8)], day(8));
    const [withE1rm] = derivePREventsForExercise([a, b], bench);
    expect(withE1rm?.pr_kinds).toContain('estimated_1rm');
    expect(withE1rm).toMatchObject({ estimator_id: 'brzycki', estimator_version: 'v1' });

    const p1 = makeSession([{ exerciseId: 'pushup', reps: 15 }], day(1));
    const p2 = makeSession([{ exerciseId: 'pushup', reps: 20 }], day(8));
    const [bodyweightEvent] = derivePREventsForExercise([p1, p2], pushup);
    expect(bodyweightEvent?.pr_kinds).toEqual(['bodyweight']);
    expect(bodyweightEvent).toMatchObject({ estimator_id: null, estimator_version: null });
  });

  it('is independent of the order sessions are given in', () => {
    const a = makeSession([lift(bench, 100, 8)], day(1));
    const b = makeSession([lift(bench, 105, 8)], day(8));
    const c = makeSession([lift(bench, 110, 6)], day(15));
    const shape = (events: ReturnType<typeof derivePREventsForExercise>) =>
      events.map((e) => [e.session_id, e.pr_kinds, e.achieved_at]);
    expect(shape(derivePREventsForExercise([c, a, b], bench))).toEqual(shape(derivePREventsForExercise([a, b, c], bench)));
  });
});

describe('derivePREventsForExercise: a later, better performance never erases an earlier event', () => {
  // A chain in which every session beats ALL of the previous session's records, so once the chain is
  // finished the earlier sessions hold no standing PersonalRecord row at all.
  const prior = makeSession([lift(bench, 215, 5)], day(1));
  const mon = makeSession([lift(bench, 225, 5)], day(6));
  const tue = makeSession([lift(bench, 230, 5), lift(bench, 225, 6)], day(7));
  const wed = makeSession([lift(bench, 235, 5), lift(bench, 230, 6), lift(bench, 225, 7)], day(8));
  const chain = [prior, mon, tue, wed];

  it('the standing records after the chain belong to the baseline and the last session only -- the gap this ledger closes', () => {
    const holders = new Set(calculatePRs(chain, bench).map((r) => r.source_session_id));
    expect(holders).toEqual(new Set([prior.id, wed.id]));
  });

  it('still has one event per improving session: Mon, Tue and Wed', () => {
    const events = derivePREventsForExercise(chain, bench);
    expect(sessionIds(events)).toEqual([mon.id, tue.id, wed.id]);
    expect(prEventsInPeriod(events, '2026-07-06', '2026-07-12')).toHaveLength(3);
  });

  it('gives the handoff\'s Monday/Wednesday/Friday example a weekly count of 3 (prior history makes Monday a real PR)', () => {
    const before = makeSession([lift(bench, 215, 5)], day(1));
    const monday = makeSession([lift(bench, 225, 5)], day(6));
    const wednesday = makeSession([lift(bench, 225, 6)], day(8));
    const friday = makeSession([lift(bench, 225, 7)], day(10));
    const events = derivePREventsForExercise([before, monday, wednesday, friday], bench);
    expect(prEventsInPeriod(events, '2026-07-06', '2026-07-12')).toHaveLength(3);
    // The first-ever bench would have been a baseline instead: without `before`, Monday is not a PR.
    expect(derivePREventsForExercise([monday, wednesday, friday], bench)).toHaveLength(2);
  });

  it('an event depends only on the sessions up to it: replaying a prefix reproduces the first events exactly', () => {
    const full = derivePREventsForExercise(chain, bench);
    for (let k = 1; k <= chain.length; k += 1) {
      const upTo = derivePREventsForExercise(chain.slice(0, k), bench);
      expect(upTo.map((e) => [e.session_id, e.pr_kinds, e.achieved_at])).toEqual(
        full.slice(0, upTo.length).map((e) => [e.session_id, e.pr_kinds, e.achieved_at]),
      );
    }
  });
});

describe('planPREventReconciliation', () => {
  const a = makeSession([lift(bench, 100, 8)], day(1));
  const b = makeSession([lift(bench, 105, 8)], day(8));
  const c = makeSession([lift(bench, 110, 8)], day(15));

  it('adds every derived event with its stable id and the current evaluator version', () => {
    const plan = reconcile([], [a, b, c], bench);
    expect(plan.remove).toEqual([]);
    expect(plan.upsert.map((e) => e.id).sort()).toEqual(
      [personalRecordEventId(b.id, 'bench', null), personalRecordEventId(c.id, 'bench', null)].sort(),
    );
    for (const event of plan.upsert) {
      expect(event).toMatchObject({ version: 1, deleted_at: null, evaluator_version: PR_EVENT_EVALUATOR_VERSION });
    }
  });

  it('is idempotent: planning again after applying the plan changes nothing', () => {
    const stored = apply([], reconcile([], [a, b, c], bench));
    const again = reconcile(stored, [a, b, c], bench);
    expect(again).toEqual({ upsert: [], remove: [] });
    // Processing the same completed session a second time is the same: no duplicates, no version bumps.
    expect(apply(stored, again)).toEqual(stored);
  });

  it('keeps an earlier event when a later session beats it', () => {
    let stored = apply([], reconcile([], [a, b], bench));
    expect(stored.map((e) => e.session_id)).toEqual([b.id]);
    stored = apply(stored, reconcile(stored, [a, b, c], bench)); // c beats b
    expect(stored.map((e) => e.session_id).sort()).toEqual([b.id, c.id].sort());
  });

  it('removes a current-version event that history no longer supports, and revives it if history returns', () => {
    const stored = apply([], reconcile([], [a, b, c], bench));
    // A stronger session inserted BEFORE the others (a backfilled workout) makes b and c no longer improvements.
    const stronger = makeSession([lift(bench, 200, 8)], '2026-06-30T10:00:00.000Z');
    const plan = reconcile(stored, [stronger, a, b, c], bench);
    expect(plan.remove.sort()).toEqual(stored.map((e) => e.id).sort());
    expect(apply(stored, plan)).toEqual([]);
    // History returns to how it was (the backfill is discarded): the events come back under the same ids.
    const revived = reconcile([], [a, b, c], bench);
    expect(revived.upsert.map((e) => e.id).sort()).toEqual(stored.map((e) => e.id).sort());
  });

  it('updates a current-version event whose recognized kinds changed, bumping its version', () => {
    const [existing] = reconcile([], [a, b], bench).upsert;
    const stale: PersonalRecordEvent = { ...(existing as PersonalRecordEvent), pr_kinds: ['volume'], version: 3 };
    const plan = reconcile([stale], [a, b], bench);
    expect(plan.remove).toEqual([]);
    expect(plan.upsert).toHaveLength(1);
    expect(plan.upsert[0]?.version).toBe(4);
    expect(plan.upsert[0]?.pr_kinds).toEqual(existing?.pr_kinds);
  });

  it('never rewrites an event stamped with an older evaluator version, even when today\'s derivation disagrees', () => {
    const [current] = reconcile([], [a, b], bench).upsert;
    const old: PersonalRecordEvent = {
      ...(current as PersonalRecordEvent),
      evaluator_version: 'pr-events-0/epley-v1',
      pr_kinds: ['estimated_1rm'], // what the old estimator recognized
      estimator_id: 'epley',
      estimator_version: 'v1',
    };
    const plan = reconcile([old], [a, b], bench);
    expect(plan).toEqual({ upsert: [], remove: [] });
  });

  it('keeps an older-version event that today\'s derivation no longer produces, while its session still exists', () => {
    const old: PersonalRecordEvent = {
      ...(reconcile([], [a, b], bench).upsert[0] as PersonalRecordEvent),
      id: personalRecordEventId(a.id, 'bench', null), // a is only the baseline now
      session_id: a.id,
      evaluator_version: 'pr-events-0/epley-v1',
    };
    expect(reconcile([old], [a, b], bench).remove).toEqual([]);
    // ...and only drops it once the performance itself is gone from history.
    expect(reconcile([old], [b], bench).remove).toEqual([old.id]);
  });

  it('a session that no longer exists takes its events with it, whatever their version', () => {
    const stored = apply([], reconcile([], [a, b, c], bench));
    const plan = reconcile(stored, [a, b], bench); // c was discarded
    expect(plan.remove).toEqual([personalRecordEventId(c.id, 'bench', null)]);
  });
});

describe('prEventsInPeriod', () => {
  it('keeps events whose day is inside the inclusive range, and nothing else', () => {
    const a = makeSession([lift(bench, 100, 8)], day(1));
    const b = makeSession([lift(bench, 105, 8)], day(8));
    const c = makeSession([lift(bench, 110, 8)], day(15));
    const events = derivePREventsForExercise([a, b, c], bench);
    expect(sessionIds(prEventsInPeriod(events, '2026-07-08', '2026-07-14'))).toEqual([b.id]);
    expect(prEventsInPeriod(events, '2026-07-09', '2026-07-14')).toEqual([]);
    expect(sessionIds(prEventsInPeriod(events, '2026-07-15', '2026-07-15'))).toEqual([c.id]);
  });
});
