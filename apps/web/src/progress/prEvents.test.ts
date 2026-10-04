import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  discardWorkoutSession,
  startWorkoutSession,
} from '@atlas/workout-engine';
import { personalRecordEventId, PR_EVENT_EVALUATOR_VERSION } from '@atlas/pr-engine';
import type { Exercise, PersonalRecordEvent, WorkoutSession } from '@atlas/data-model';
import { ensurePREventsUpToDate, loadPREvents, reconcilePREvents } from './prEvents';
import { recalculatePRsForSession } from './recalculatePRs';

function exercise(id: string): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'test',
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
  };
}

type SetSpec = { exerciseId: string; weight: number; reps: number };

function session(sets: SetSpec[], completedAt: string): WorkoutSession {
  let s = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    startedAt: completedAt,
  });
  sets.forEach((set, index) => {
    s = addPerformedSet(s, {
      ...createPerformedSet({
        exerciseId: set.exerciseId,
        setIndex: index,
        setType: 'normal',
        weight: set.weight,
        reps: set.reps,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
      completed_at: completedAt,
    });
  });
  return { ...completeWorkoutSession(s), completed_at: completedAt };
}

const BENCH = exercise('bench');
const SQUAT = exercise('squat');
const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const lift = (e: Exercise, weight: number, reps: number): SetSpec => ({ exerciseId: e.id, weight, reps });

async function freshStorage(...exercises: Exercise[]) {
  const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  await storage.exercises.putMany(exercises);
  return storage;
}

/** What a live finish does: persist the completed session, then the post-session recompute -- PR rows and events. */
async function finish(storage: IndexedDbAdapter, completed: WorkoutSession, exercises: Exercise[]) {
  await storage.workoutSessions.put(completed);
  await recalculatePRsForSession(
    storage,
    completed.performed_sets.map((s) => s.exercise_id),
    new Map(exercises.map((e) => [e.id, e])),
  );
}

// A chain in which every session beats ALL of the previous one's records.
const prior = session([lift(BENCH, 215, 5)], day(1));
const mon = session([lift(BENCH, 225, 5)], day(6));
const tue = session([lift(BENCH, 230, 5), lift(BENCH, 225, 6)], day(7));
const wed = session([lift(BENCH, 235, 5), lift(BENCH, 230, 6), lift(BENCH, 225, 7)], day(8));

describe('the finish path keeps the PR event history', () => {
  it('records an event per improving session, and an earlier event survives a later, better performance', async () => {
    const storage = await freshStorage(BENCH);
    const sessionsOfEvents = async () => (await storage.personalRecordEvents.getAll()).map((e) => e.session_id).sort();

    await finish(storage, prior, [BENCH]);
    expect(await sessionsOfEvents()).toEqual([]); // first exposure: a baseline, though it set records
    expect((await storage.personalRecords.getAll()).length).toBeGreaterThan(5);

    await finish(storage, mon, [BENCH]);
    expect(await sessionsOfEvents()).toEqual([mon.id]);
    await finish(storage, tue, [BENCH]);
    expect(await sessionsOfEvents()).toEqual([mon.id, tue.id].sort());
    await finish(storage, wed, [BENCH]);
    expect(await sessionsOfEvents()).toEqual([mon.id, tue.id, wed.id].sort());

    // The standing records no longer point at Monday or Tuesday -- the events are what remember them.
    const holders = new Set((await storage.personalRecords.getAll()).map((r) => r.source_session_id));
    expect(holders.has(mon.id)).toBe(false);
    expect(holders.has(tue.id)).toBe(false);
  });

  it('is idempotent: finishing the same session again writes no new events and bumps no versions', async () => {
    const storage = await freshStorage(BENCH);
    for (const s of [prior, mon, tue]) await finish(storage, s, [BENCH]);
    const before = await storage.personalRecordEvents.getAll();

    await finish(storage, tue, [BENCH]); // the same completed session processed again
    const after = await storage.personalRecordEvents.getAll();
    expect(after).toHaveLength(before.length);
    expect(after.map((e) => [e.id, e.version, e.updated_at]).sort()).toEqual(
      before.map((e) => [e.id, e.version, e.updated_at]).sort(),
    );
  });

  it('gives two exercises in one session two events, each stamped with its own stable id', async () => {
    const storage = await freshStorage(BENCH, SQUAT);
    await finish(storage, session([lift(BENCH, 100, 8), lift(SQUAT, 150, 5)], day(1)), [BENCH, SQUAT]);
    const second = session([lift(BENCH, 105, 8), lift(SQUAT, 155, 5)], day(8));
    await finish(storage, second, [BENCH, SQUAT]);

    const events = await storage.personalRecordEvents.getAll();
    expect(events.map((e) => e.id).sort()).toEqual(
      [personalRecordEventId(second.id, 'bench', null), personalRecordEventId(second.id, 'squat', null)].sort(),
    );
  });

  it('leaves the standing PersonalRecord rows exactly as the recompute wrote them (events never rewrite them)', async () => {
    const storage = await freshStorage(BENCH);
    for (const s of [prior, mon, tue, wed]) await storage.workoutSessions.put(s);
    await recalculatePRsForSession(storage, ['bench'], new Map([[BENCH.id, BENCH]]));
    const rowsBefore = await storage.personalRecords.getAll();

    await reconcilePREvents(storage);
    expect(await storage.personalRecords.getAll()).toEqual(rowsBefore);
  });
});

describe('historical backfill', () => {
  /** A database from before the ledger existed: completed sessions and standing records, no events. */
  async function legacyStorage() {
    const storage = await freshStorage(BENCH, SQUAT);
    for (const s of [prior, mon, tue, wed]) await storage.workoutSessions.put(s);
    await storage.workoutSessions.put(session([lift(SQUAT, 200, 5)], day(5))); // squat: done once
    return storage;
  }

  it('reconstructs every achievable event from existing history, superseded PRs included', async () => {
    const storage = await legacyStorage();
    expect(await storage.personalRecordEvents.getAll()).toEqual([]);

    const result = await reconcilePREvents(storage);
    expect(result).toMatchObject({ created: 3, updated: 0, removed: 0, skipped: [] });

    const events = await storage.personalRecordEvents.getAll();
    expect(events.map((e) => e.session_id).sort()).toEqual([mon.id, tue.id, wed.id].sort());
    for (const event of events) {
      expect(event).toMatchObject({
        exercise_id: 'bench',
        training_location_id: null,
        evaluator_version: PR_EVENT_EVALUATOR_VERSION,
        estimator_id: 'brzycki',
      });
      expect(event.pr_kinds.length).toBeGreaterThan(0);
    }
    // The squat, done once, is a baseline: nothing to reconstruct.
    expect(events.some((e) => e.exercise_id === 'squat')).toBe(false);
  });

  it('is idempotent: a second backfill produces the same event set and writes nothing', async () => {
    const storage = await legacyStorage();
    await reconcilePREvents(storage);
    const first = await storage.personalRecordEvents.getAll();

    const second = await reconcilePREvents(storage);
    expect(second).toMatchObject({ created: 0, updated: 0, removed: 0 });
    expect(await storage.personalRecordEvents.getAll()).toEqual(first);
  });

  it('takes a discarded session\'s events with it (a "Replace Existing" workout)', async () => {
    const storage = await legacyStorage();
    await reconcilePREvents(storage);
    await storage.workoutSessions.put(discardWorkoutSession(wed));

    const result = await reconcilePREvents(storage);
    expect(result.removed).toBe(1);
    expect((await storage.personalRecordEvents.getAll()).map((e) => e.session_id).sort()).toEqual(
      [mon.id, tue.id].sort(),
    );
  });

  it('fails closed on an exercise it cannot resolve: reports it, invents nothing, leaves its stored events alone', async () => {
    const storage = await freshStorage(BENCH); // the library has no "ghost" exercise
    const ghost = exercise('ghost');
    const g1 = session([lift(ghost, 100, 8)], day(1));
    const g2 = session([lift(ghost, 110, 8)], day(8));
    await storage.workoutSessions.putMany([g1, g2]);
    const existing: PersonalRecordEvent = {
      id: personalRecordEventId(g2.id, 'ghost', null),
      created_at: day(8),
      updated_at: day(8),
      version: 1,
      device_id: 'test',
      deleted_at: null,
      session_id: g2.id,
      exercise_id: 'ghost',
      training_location_id: null,
      achieved_at: day(8),
      pr_kinds: ['max_load'],
      evaluator_version: PR_EVENT_EVALUATOR_VERSION,
    };
    await storage.personalRecordEvents.put(existing);

    const result = await reconcilePREvents(storage);
    expect(result.skipped).toEqual([{ exercise_id: 'ghost', reason: 'EXERCISE_UNRESOLVED' }]);
    expect(await storage.personalRecordEvents.getAll()).toEqual([existing]);
  });

  it('never rewrites an event recorded under an older evaluator, while its session still exists', async () => {
    const storage = await legacyStorage();
    await reconcilePREvents(storage);
    const [current] = await storage.personalRecordEvents.getAll();
    const old: PersonalRecordEvent = {
      ...(current as PersonalRecordEvent),
      evaluator_version: 'pr-events-0/epley-v1',
      pr_kinds: ['estimated_1rm'],
      estimator_id: 'epley',
      estimator_version: 'v1',
    };
    await storage.personalRecordEvents.put(old);

    const result = await reconcilePREvents(storage);
    expect(result).toMatchObject({ created: 0, updated: 0, removed: 0 });
    expect(await storage.personalRecordEvents.get(old.id)).toEqual(old);
  });

  it('keeps unlocated legacy history valid and separates two locations once sessions record one', async () => {
    const storage = await freshStorage(BENCH);
    const at = (loc: string | null, n: number, weight: number) => ({
      ...session([lift(BENCH, weight, 8)], day(n)),
      training_location_id: loc,
    });
    await storage.workoutSessions.putMany([
      at(null, 1, 100), // unlocated baseline
      at(null, 8, 105), // unlocated event
      at('gym-a', 15, 60), // first time at gym A: baseline there
      at('gym-a', 22, 65), // event at gym A
    ]);
    await reconcilePREvents(storage);
    const events = await storage.personalRecordEvents.getAll();
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.training_location_id))).toEqual(new Set([null, 'gym-a']));
  });
});

describe('ensurePREventsUpToDate / loadPREvents', () => {
  it('runs the reconcile once per storage instance and lets every screen wait on the same result', async () => {
    const storage = await freshStorage(BENCH);
    for (const s of [prior, mon]) await storage.workoutSessions.put(s);

    const a = ensurePREventsUpToDate(storage);
    const b = ensurePREventsUpToDate(storage);
    expect(b).toBe(a);
    expect(await a).toMatchObject({ created: 1 });

    const forced = await ensurePREventsUpToDate(storage, { force: true });
    expect(forced).toMatchObject({ created: 0, updated: 0, removed: 0 });
  });

  it('returns the ledger only after it has been brought up to date', async () => {
    const storage = await freshStorage(BENCH);
    for (const s of [prior, mon, tue]) await storage.workoutSessions.put(s); // history, no events yet
    const events = await loadPREvents(storage);
    expect(events.map((e) => e.session_id).sort()).toEqual([mon.id, tue.id].sort());
  });
});

describe('a failure in the derived ledger never blocks the app', () => {
  /** A storage that behaves like the real one except that one repository method rejects. */
  function failing(storage: IndexedDbAdapter, repository: 'workoutSessions' | 'personalRecordEvents', method: 'getAll' | 'putMany') {
    const broken = Object.create(storage[repository]) as Record<string, unknown>;
    broken[method] = () => Promise.reject(new Error('boom'));
    return Object.assign(Object.create(storage), { [repository]: broken }) as IndexedDbAdapter;
  }

  it('loadPREvents logs a failed reconcile and still returns the stored events', async () => {
    const storage = await freshStorage(BENCH);
    for (const s of [prior, mon]) await storage.workoutSessions.put(s);
    await reconcilePREvents(storage);
    const stored = await storage.personalRecordEvents.getAll();
    expect(stored).toHaveLength(1);

    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events = await loadPREvents(failing(storage, 'workoutSessions', 'getAll'));
    expect(events).toEqual(stored);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('a workout still finishes -- PR rows saved, no error -- when the event history cannot be written', async () => {
    const storage = await freshStorage(BENCH);
    await storage.workoutSessions.put(prior);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = failing(storage, 'personalRecordEvents', 'putMany');

    await storage.workoutSessions.put(mon);
    await expect(recalculatePRsForSession(broken, ['bench'], new Map([[BENCH.id, BENCH]]))).resolves.toBeUndefined();

    expect((await storage.personalRecords.getAll()).length).toBeGreaterThan(0); // the standing records were saved
    expect(log).toHaveBeenCalled();
    // ...and the next full reconcile heals the ledger.
    await reconcilePREvents(storage);
    expect((await storage.personalRecordEvents.getAll()).map((e) => e.session_id)).toEqual([mon.id]);
    log.mockRestore();
  });
});
