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
      setType: 'working',
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
});
