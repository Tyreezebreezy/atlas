import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import { calculatePRs } from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { recalculatePRsForExercise } from './recalculatePRs';

const press: Exercise = {
  id: 'press',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
  device_id: 'seed',
  deleted_at: null,
  name: 'Machine Chest Press',
  aliases: [],
  category: null,
  equipment: ['leverage machine'],
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

function session(
  day: number,
  weight: number,
  reps: number,
  location: string | null,
  machine: string | null,
): WorkoutSession {
  let s = startWorkoutSession({
    name: 'W',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    trainingLocationId: location,
  });
  const at = `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  s = addPerformedSet(s, {
    ...createPerformedSet({
      exerciseId: 'press',
      setIndex: 0,
      setType: 'normal',
      weight,
      reps,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    }),
    completed_at: at,
  });
  return {
    ...completeWorkoutSession(s),
    completed_at: at,
    performed_local_date: at.slice(0, 10),
    ...(machine
      ? { exercise_equipment: [{ exercise_id: 'press', gym_equipment_id: machine }] }
      : {}),
  };
}

const fresh = () => new IndexedDbAdapter(`atlas-recalc-${crypto.randomUUID()}`);

describe('standing records keep one row per machine', () => {
  it('two machines at the same gym get separate current-best rows -- neither overwrites the other', async () => {
    const storage = fresh();
    await storage.workoutSessions.putMany([
      session(1, 170, 10, 'main', 'press-1'),
      session(8, 120, 10, 'main', 'press-2'),
    ]);
    await recalculatePRsForExercise(storage, press);

    const maxLoads = (await storage.personalRecords.getAll()).filter((p) => p.kind === 'max_load');
    expect(maxLoads).toHaveLength(2);
    expect(new Set(maxLoads.map((p) => p.id)).size).toBe(2);
    expect(Object.fromEntries(maxLoads.map((p) => [p.gym_equipment_id, p.value]))).toEqual({
      'press-1': 170,
      'press-2': 120,
    });
  });

  it('the same make at two gyms stays two series too', async () => {
    const storage = fresh();
    await storage.workoutSessions.putMany([
      session(1, 170, 10, 'main', 'press-1'),
      session(8, 90, 10, 'hotel', 'hotel-press'),
    ]);
    await recalculatePRsForExercise(storage, press);
    const maxLoads = (await storage.personalRecords.getAll()).filter((p) => p.kind === 'max_load');
    expect(maxLoads.map((p) => `${p.training_location_id}/${p.gym_equipment_id}`).sort()).toEqual([
      'hotel/hotel-press',
      'main/press-1',
    ]);
  });

  it("recalculating again reuses each row's id and version when nothing changed", async () => {
    const storage = fresh();
    await storage.workoutSessions.putMany([
      session(1, 170, 10, 'main', 'press-1'),
      session(8, 120, 10, 'main', 'press-2'),
    ]);
    await recalculatePRsForExercise(storage, press);
    const first = (await storage.personalRecords.getAll()).map((p) => [p.id, p.version]).sort();
    await recalculatePRsForExercise(storage, press);
    expect((await storage.personalRecords.getAll()).map((p) => [p.id, p.version]).sort()).toEqual(
      first,
    );
  });

  it("a better session on one machine updates only that machine's rows", async () => {
    const storage = fresh();
    await storage.workoutSessions.putMany([
      session(1, 170, 10, 'main', 'press-1'),
      session(8, 120, 10, 'main', 'press-2'),
    ]);
    await recalculatePRsForExercise(storage, press);
    const before = new Map((await storage.personalRecords.getAll()).map((p) => [p.id, p]));

    await storage.workoutSessions.put(session(15, 180, 10, 'main', 'press-1'));
    await recalculatePRsForExercise(storage, press);
    const after = await storage.personalRecords.getAll();
    const two = after.find((p) => p.kind === 'max_load' && p.gym_equipment_id === 'press-2');
    expect(two).toEqual(before.get(two?.id ?? ''));
    expect(
      after.find((p) => p.kind === 'max_load' && p.gym_equipment_id === 'press-1')?.value,
    ).toBe(180);
  });

  it('rows stored before machines existed (no gym_equipment_id) keep their ids and are matched to the unspecified context', async () => {
    const storage = fresh();
    const legacy = [session(1, 100, 10, null, null), session(8, 110, 10, null, null)];
    await storage.workoutSessions.putMany(legacy);
    // The rows as an older version stored them: the field did not exist at all.
    const olderRows = calculatePRs(legacy, press).map((row) => {
      const older: Partial<typeof row> = { ...row };
      delete older.gym_equipment_id;
      return older as typeof row;
    });
    await storage.personalRecords.putMany(olderRows);

    await recalculatePRsForExercise(storage, press);
    const after = await storage.personalRecords.getAll();
    expect(after).toHaveLength(olderRows.length);
    expect(new Set(after.map((p) => p.id))).toEqual(new Set(olderRows.map((p) => p.id)));
  });

  it('writes headline events in the context they were earned in, under the equipment-aware evaluator', async () => {
    const storage = fresh();
    await storage.workoutSessions.putMany([
      session(1, 100, 10, 'main', 'press-1'),
      session(8, 110, 10, 'main', 'press-1'),
      session(10, 150, 10, 'main', 'press-2'), // a different machine: its own baseline, never a PR over press-1
    ]);
    await recalculatePRsForExercise(storage, press);
    const events = await storage.personalRecordEvents.getAll();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ training_location_id: 'main', gym_equipment_id: 'press-1' });
    expect(events[0]?.evaluator_version.startsWith('pr-events-2/')).toBe(true);
  });
});
