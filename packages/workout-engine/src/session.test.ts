import { describe, expect, it } from 'vitest';
import type { ExerciseGroup } from '@atlas/data-model';
import { createPlannedExercise } from './createPlannedExercise';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  discardWorkoutSession,
  executionModeOf,
  removePerformedSet,
  setExecutionMode,
  setExerciseGoal,
  startWorkoutSession,
  setSessionNote,
} from './session';

function makeSession() {
  const planned = [createPlannedExercise('ex-1', 0)];
  return startWorkoutSession({
    name: 'Push Day',
    templateId: 'template-1',
    programId: null,
    programDayId: null,
    plannedSnapshot: planned,
  });
}

describe('startWorkoutSession', () => {
  it('starts in_progress with an independent copy of the planned exercises', () => {
    const planned = [createPlannedExercise('ex-1', 0)];
    const session = startWorkoutSession({
      name: 'Push Day',
      templateId: 't-1',
      programId: null,
      programDayId: null,
      plannedSnapshot: planned,
    });

    expect(session.status).toBe('in_progress');
    expect(session.performed_sets).toEqual([]);
    expect(session.planned_snapshot).toEqual(planned);
    expect(session.planned_snapshot).not.toBe(planned);

    // mutating the source array after the fact must not affect the snapshot
    planned.push(createPlannedExercise('ex-2', 1));
    expect(session.planned_snapshot).toHaveLength(1);
  });

  it('defaults scheduled_date to null when not given -- Freestyle/Quick Workouts and "Do Again" reruns', () => {
    const session = makeSession();
    expect(session.scheduled_date).toBeNull();
  });

  it('v0.2.4: scheduled_date is independent of startedAt -- a live late completion sets scheduled_date without backdating started_at', () => {
    // The defining case this release fixes: starting Monday's missed
    // workout live on Tuesday. started_at must stay real "now" (no
    // startedAt override at all) while scheduled_date carries Monday.
    const before = Date.now();
    const session = startWorkoutSession({
      name: 'Upper A',
      templateId: 't-1',
      programId: 'prog-1',
      programDayId: 'day-1',
      plannedSnapshot: [],
      scheduledDate: '2026-09-07', // Monday
    });
    expect(session.scheduled_date).toBe('2026-09-07');
    expect(new Date(session.started_at).getTime()).toBeGreaterThanOrEqual(before);
    expect(session.planned_completed_at).toBeNull();
  });

  it('v0.2.4: only an explicit startedAt override (Log Past Workout) backdates started_at -- scheduledDate never does', () => {
    const session = startWorkoutSession({
      name: 'Upper A',
      templateId: 't-1',
      programId: 'prog-1',
      programDayId: 'day-1',
      plannedSnapshot: [],
      startedAt: '2026-08-01T12:00:00.000Z',
      plannedCompletedAt: '2026-08-01T13:00:00.000Z',
      scheduledDate: '2026-08-01',
    });
    expect(session.started_at).toBe('2026-08-01T12:00:00.000Z');
    expect(session.planned_completed_at).toBe('2026-08-01T13:00:00.000Z');
    expect(session.scheduled_date).toBe('2026-08-01');
  });
});

describe('addPerformedSet / removePerformedSet', () => {
  it('appends and removes sets, bumping version each time', () => {
    let session = makeSession();
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
    expect(session.performed_sets).toHaveLength(1);
    expect(session.version).toBe(2);

    session = removePerformedSet(session, set.id);
    expect(session.performed_sets).toHaveLength(0);
    expect(session.version).toBe(3);
  });

  it('represents a bodyweight set with a null weight, not zero', () => {
    const set = createPerformedSet({
      exerciseId: 'ex-1',
      setIndex: 0,
      setType: 'normal',
      weight: null,
      reps: 15,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
    });
    expect(set.weight).toBeNull();
    expect(set.reps).toBe(15);
  });

  it('stamps completed_at from completedAt when given, for backdated Log Past Workout entries', () => {
    const set = createPerformedSet({
      exerciseId: 'ex-1',
      setIndex: 0,
      setType: 'normal',
      weight: 90,
      reps: 12,
      durationSeconds: null,
      distanceMeters: null,
      rpe: null,
      rir: null,
      notes: null,
      completedAt: '2026-08-01T17:00:00.000Z',
    });
    expect(set.completed_at).toBe('2026-08-01T17:00:00.000Z');
  });
});

describe('completeWorkoutSession / discardWorkoutSession', () => {
  it('completing stamps status and completed_at', () => {
    const session = makeSession();
    const completed = completeWorkoutSession(session);
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();
  });

  it('discarding is a status change, not a delete', () => {
    const session = makeSession();
    const discarded = discardWorkoutSession(session);
    expect(discarded.status).toBe('discarded');
    expect(discarded.id).toBe(session.id);
  });

  it('a historical entry completes at its planned date, not the moment Finish is tapped', () => {
    const historical = startWorkoutSession({
      name: 'Backfilled Session',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
      startedAt: '2026-08-01T18:00:00.000Z',
      plannedCompletedAt: '2026-08-01T19:00:00.000Z',
    });
    const completed = completeWorkoutSession(historical);
    expect(completed.started_at).toBe('2026-08-01T18:00:00.000Z');
    expect(completed.completed_at).toBe('2026-08-01T19:00:00.000Z');
    expect(completed.planned_completed_at).toBeNull(); // cleared once actually completed
  });
});

describe('setSessionNote', () => {
  it('stores a note, and treats an empty string as null', () => {
    let session = makeSession();
    session = setSessionNote(session, 'Felt strong today.');
    expect(session.session_note).toBe('Felt strong today.');
    session = setSessionNote(session, '');
    expect(session.session_note).toBeNull();
  });
});

describe('executionModeOf / setExecutionMode', () => {
  it('defaults to paired for a session without the field', () => {
    expect(executionModeOf(makeSession())).toBe('paired');
  });

  it('stores the chosen mode and reads it back', () => {
    const normal = setExecutionMode(makeSession(), 'normal');
    expect(executionModeOf(normal)).toBe('normal');
    expect(normal.execution_mode).toBe('normal');
  });

  it('switching modes preserves performed sets and planned snapshot', () => {
    let session = makeSession();
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-1',
        setIndex: 0,
        setType: 'normal',
        weight: 175,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    const paired = setExecutionMode(session, 'paired');
    const normal = setExecutionMode(paired, 'normal');
    expect(normal.performed_sets).toHaveLength(1);
    expect(normal.performed_sets[0]?.weight).toBe(175);
    expect(normal.planned_snapshot).toEqual(session.planned_snapshot);
  });

  it('toggling Normal <-> Paired with a superset group never loses logged work or group metadata', () => {
    const group: ExerciseGroup = {
      id: 'grp-1',
      type: 'superset',
      rounds: 3,
      rest_after_seconds: null,
    };
    const planned = [
      { ...createPlannedExercise('a1', 0), group_id: 'grp-1', target_sets: 3 },
      { ...createPlannedExercise('a2', 1), group_id: 'grp-1', target_sets: 3 },
    ];
    let session = startWorkoutSession({
      name: 'Upper A',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: planned,
      groups: [group],
    });
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'a1',
        setIndex: 0,
        setType: 'normal',
        weight: 175,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'a2',
        setIndex: 0,
        setType: 'normal',
        weight: 120,
        reps: 10,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );

    const normal = setExecutionMode(session, 'normal');
    const pairedAgain = setExecutionMode(normal, 'paired');

    expect(pairedAgain.performed_sets.map((s) => s.exercise_id).sort()).toEqual(['a1', 'a2']);
    expect(pairedAgain.groups).toEqual([group]); // pair metadata never rewritten
    expect(pairedAgain.planned_snapshot[0]?.group_id).toBe('grp-1');
  });
});

describe('setExerciseGoal', () => {
  it('persists a reps goal separately from actual sets', () => {
    let session = makeSession();
    session = setExerciseGoal(session, 'ex-1', { goal_reps: 8 });
    expect(session.planned_snapshot[0]?.goal_reps).toBe(8);
    // Actual stays in performed_sets, untouched by the goal.
    expect(session.performed_sets).toHaveLength(0);
  });

  it('persists a duration goal for a timed exercise', () => {
    let session = makeSession();
    session = setExerciseGoal(session, 'ex-1', { goal_duration_seconds: 30 });
    expect(session.planned_snapshot[0]?.goal_duration_seconds).toBe(30);
    expect(session.planned_snapshot[0]?.goal_reps).toBeUndefined();
  });

  it('only mutates the target exercise, not its neighbors', () => {
    const planned = [createPlannedExercise('ex-1', 0), createPlannedExercise('ex-2', 1)];
    let session = startWorkoutSession({
      name: 'Two exercises',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: planned,
    });
    session = setExerciseGoal(session, 'ex-1', { goal_reps: 8 });
    expect(session.planned_snapshot[0]?.goal_reps).toBe(8);
    expect(session.planned_snapshot[1]?.goal_reps).toBeUndefined();
  });

  it('does not conflate the goal with the program prescription range', () => {
    const planned = [
      { ...createPlannedExercise('ex-1', 0), target_reps_min: 6, target_reps_max: 10 },
    ];
    let session = startWorkoutSession({
      name: 'Upper',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: planned,
    });
    session = setExerciseGoal(session, 'ex-1', { goal_reps: 8 });
    const slot = session.planned_snapshot[0]!;
    expect(slot.target_reps_min).toBe(6); // program prescription untouched
    expect(slot.target_reps_max).toBe(10);
    expect(slot.goal_reps).toBe(8); // goal is its own field
  });

  it('the goal survives session completion (persisted separately from actual)', () => {
    let session = startWorkoutSession({
      name: 'Upper',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [createPlannedExercise('ex-1', 0)],
    });
    session = setExerciseGoal(session, 'ex-1', { goal_reps: 8 });
    session = addPerformedSet(
      session,
      createPerformedSet({
        exerciseId: 'ex-1',
        setIndex: 0,
        setType: 'normal',
        weight: 175,
        reps: 6,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
    );
    const completed = completeWorkoutSession(session);
    expect(completed.planned_snapshot[0]?.goal_reps).toBe(8); // goal persisted
    expect(completed.performed_sets[0]?.reps).toBe(6); // actual is separate
  });
});
