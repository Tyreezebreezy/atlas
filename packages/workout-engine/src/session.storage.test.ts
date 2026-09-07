import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { createPlannedExercise } from './createPlannedExercise';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from './session';
import { skipExerciseInSession, skipWorkoutSession } from './skip';
import { replaceExercise } from './replace';
import { adjustActiveTimer, startRestTimer } from './timer';

describe('session storage round-trip', () => {
  it('create session, save a set, reload storage, retrieve session', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    let storage = new IndexedDbAdapter(dbName);

    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    await storage.workoutSessions.put(session);

    const set = createPerformedSet({
      exerciseId: 'ex-1',
      setIndex: 0,
      setType: 'normal',
      weight: 170,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    });
    session = addPerformedSet(session, set);
    await storage.workoutSessions.put(session); // immediate autosave

    // simulate reload: fresh adapter instance against the same underlying database
    storage = new IndexedDbAdapter(dbName);
    const reloaded = await storage.workoutSessions.get(session.id);

    expect(reloaded?.performed_sets).toHaveLength(1);
    expect(reloaded?.performed_sets[0]?.weight).toBe(170);
    expect(reloaded?.status).toBe('in_progress');
  });

  it('complete session, reload, verify it appears in history', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    let storage = new IndexedDbAdapter(dbName);

    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    session = completeWorkoutSession(session);
    await storage.workoutSessions.put(session);

    storage = new IndexedDbAdapter(dbName);
    const all = await storage.workoutSessions.getAll();
    const completed = all.filter((s) => s.status === 'completed');

    expect(completed).toHaveLength(1);
    expect(completed[0]?.id).toBe(session.id);
    expect(completed[0]?.completed_at).not.toBeNull();
  });

  it('editing the source template afterward does not alter the session planned_snapshot already in storage', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    const storage = new IndexedDbAdapter(dbName);

    const firstExercise = createPlannedExercise('ex-1', 0);
    firstExercise.target_reps_min = 6;
    firstExercise.target_reps_max = 8;
    const originalPlan = [firstExercise];

    const session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: originalPlan,
    });
    await storage.workoutSessions.put(session);

    // "edit the template" -- mutates the source array, not the stored session
    firstExercise.target_reps_min = 10;
    firstExercise.target_reps_max = 10;

    const reloaded = await storage.workoutSessions.get(session.id);
    expect(reloaded?.planned_snapshot[0]?.target_reps_min).toBe(6);
    expect(reloaded?.planned_snapshot[0]?.target_reps_max).toBe(8);
  });

  it('an active rest timer round-trips through storage, including +15/-15 adjustments', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    let storage = new IndexedDbAdapter(dbName);

    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    session = startRestTimer(session, 'ex-1', 90);
    session = adjustActiveTimer(session, 15);
    await storage.workoutSessions.put(session);

    storage = new IndexedDbAdapter(dbName);
    const reloaded = await storage.workoutSessions.get(session.id);
    expect(reloaded?.active_timer?.kind).toBe('rest');
    expect(reloaded?.active_timer?.duration_seconds).toBe(105);
  });

  it('a skipped exercise round-trips and stays undoable after reload', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    let storage = new IndexedDbAdapter(dbName);

    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    session = skipExerciseInSession(session, 'ex-1', 'Shoulder tweak');
    await storage.workoutSessions.put(session);

    storage = new IndexedDbAdapter(dbName);
    const reloaded = await storage.workoutSessions.get(session.id);
    expect(reloaded?.skipped_exercises).toEqual([
      { exercise_id: 'ex-1', reason: 'Shoulder tweak', skipped_at: expect.any(String) },
    ]);
    // planned_snapshot is untouched by a skip -- still there to resume/undo against
    expect(reloaded?.planned_snapshot).toHaveLength(1);
  });

  it('a whole-workout skip persists as its own session with status skipped', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    const storage = new IndexedDbAdapter(dbName);

    const session = skipWorkoutSession({
      name: 'Leg Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
      reason: 'Traveling',
    });
    await storage.workoutSessions.put(session);

    const all = await storage.workoutSessions.getAll();
    const skipped = all.filter((s) => s.status === 'skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.skip_reason).toBe('Traveling');
    expect(skipped[0]?.performed_sets).toEqual([]);
  });

  it('an exercise replacement round-trips, preserving already-performed sets under the original id', async () => {
    const dbName = `atlas-test-${crypto.randomUUID()}`;
    let storage = new IndexedDbAdapter(dbName);

    let session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-1',
        setIndex: 0,
        setType: 'normal',
        weight: 100,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    session = replaceExercise(session, 'ex-1', 'ex-1-alt', 'Machine was taken', 'today');
    await storage.workoutSessions.put(session);

    storage = new IndexedDbAdapter(dbName);
    const reloaded = await storage.workoutSessions.get(session.id);
    expect(reloaded?.planned_snapshot[0]?.exercise_id).toBe('ex-1-alt');
    expect(reloaded?.performed_sets[0]?.exercise_id).toBe('ex-1');
    expect(reloaded?.replacements[0]?.scope).toBe('today');
  });
});
