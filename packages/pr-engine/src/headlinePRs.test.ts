import { describe, expect, it } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { calculatePRs } from './calculatePRs';
import { exposureSessions } from './exposure';
import { buildHeadlinePREvents, headlinePREventsInPeriod, HEADLINE_PRIMARY_KIND_ORDER } from './headlinePRs';

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

const bench = makeExercise('bench');
const squat = makeExercise('squat');
const machine = makeExercise('machine');

const lift = (exercise: Exercise, weight: number, reps: number): SetSpec => ({
  exerciseId: exercise.id,
  weight,
  reps,
});

/** The real, current PersonalRecord rows -- exactly what the app persists after each finish. */
function currentRows(sessions: WorkoutSession[], ...exercises: Exercise[]): PersonalRecord[] {
  return exercises.flatMap((exercise) => calculatePRs(sessions, exercise));
}

function rowsOf(rows: PersonalRecord[], session: WorkoutSession, exercise: Exercise): PersonalRecord[] {
  return rows.filter((r) => r.source_session_id === session.id && r.exercise_id === exercise.id);
}

describe('buildHeadlinePREvents', () => {
  it('turns the many detailed rows one exercise performance sets into exactly one headline PR', () => {
    const first = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const second = makeSession(
      [lift(bench, 105, 8), lift(bench, 105, 10), lift(bench, 110, 5)],
      '2026-07-08T10:00:00.000Z',
    );
    const sessions = [first, second];
    const rows = currentRows(sessions, bench);

    const detailed = rowsOf(rows, second, bench);
    expect(detailed.length).toBeGreaterThan(5); // max load, e1RM, several rep counts, several loads, volume...

    const events = buildHeadlinePREvents(rows, sessions);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ session_id: second.id, exercise_id: 'bench', training_location_id: null });
    // Every detailed record is still reachable from the event.
    expect(events[0]?.records).toHaveLength(detailed.length);
  });

  it('counts two different exercises in one session as two headline PRs', () => {
    const first = makeSession([lift(bench, 100, 8), lift(squat, 150, 5)], '2026-07-01T10:00:00.000Z');
    const second = makeSession([lift(bench, 105, 8), lift(squat, 155, 5)], '2026-07-08T10:00:00.000Z');
    const sessions = [first, second];
    const events = buildHeadlinePREvents(currentRows(sessions, bench, squat), sessions);

    expect(events.map((e) => e.exercise_id).sort()).toEqual(['bench', 'squat']);
    expect(new Set(events.map((e) => e.session_id))).toEqual(new Set([second.id]));
  });

  it('keeps the same exercise in separate sessions as separate headline events', () => {
    const a = makeSession([lift(bench, 100, 10)], '2026-07-01T10:00:00.000Z');
    const b = makeSession([lift(bench, 105, 5)], '2026-07-08T10:00:00.000Z');
    const c = makeSession([lift(bench, 110, 3)], '2026-07-15T10:00:00.000Z');
    const sessions = [a, b, c];
    const rows = currentRows(sessions, bench);

    // Both later sessions still hold at least one current record (B: 5-rep and 105-lb records; C: max load...).
    expect(rowsOf(rows, b, bench).length).toBeGreaterThan(0);
    expect(rowsOf(rows, c, bench).length).toBeGreaterThan(0);

    const events = buildHeadlinePREvents(rows, sessions);
    expect(events.map((e) => e.session_id)).toEqual([b.id, c.id]); // A is the baseline
  });

  it('treats a first-ever performance as a baseline: it has rows, but is not a PR', () => {
    const only = makeSession([lift(bench, 100, 8), lift(bench, 105, 6), lift(bench, 95, 10)], '2026-07-01T10:00:00.000Z');
    const rows = currentRows([only], bench);
    expect(rows.length).toBeGreaterThan(5);
    expect(buildHeadlinePREvents(rows, [only])).toEqual([]);
  });

  it('judges the first-ever performance per equipment context', () => {
    const at = (loc: string, day: string, weight: number) =>
      makeSession([lift(bench, weight, 8)], `2026-07-${day}T10:00:00.000Z`, { training_location_id: loc });
    const a1 = at('gym-a', '01', 100); // baseline at A
    const a2 = at('gym-a', '08', 105); // improvement at A
    const b1 = at('gym-b', '15', 60); // first time at B: baseline at B, even though bench has history at A
    const b2 = at('gym-b', '22', 65); // improvement at B
    const sessions = [a1, a2, b1, b2];
    const events = buildHeadlinePREvents(currentRows(sessions, bench), sessions);

    expect(events.map((e) => [e.session_id, e.training_location_id])).toEqual([
      [a2.id, 'gym-a'],
      [b2.id, 'gym-b'],
    ]);
  });

  it('leaves the detailed PersonalRecord rows exactly as they were', () => {
    const first = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const second = makeSession([lift(bench, 110, 6), lift(bench, 105, 10)], '2026-07-08T10:00:00.000Z');
    const rows = currentRows([first, second], bench);
    const snapshot = structuredClone(rows);

    const events = buildHeadlinePREvents(rows, [first, second]);

    expect(rows).toEqual(snapshot);
    const grouped = events.flatMap((e) => e.records);
    expect(grouped.every((record) => rows.includes(record))).toBe(true); // the same row objects, not copies
    // The first session's rows are still in the detailed set even though they are not headline events.
    expect(rowsOf(rows, first, bench).length).toBeGreaterThan(0);
  });

  it('keeps rep-at-load records visible under the event for a fixed-load equipment ceiling', () => {
    const a = makeSession([lift(machine, 170, 12)], '2026-07-01T10:00:00.000Z');
    const b = makeSession([lift(machine, 170, 14)], '2026-07-08T10:00:00.000Z');
    const c = makeSession([lift(machine, 170, 16)], '2026-07-15T10:00:00.000Z');
    const sessions = [a, b, c];
    const events = buildHeadlinePREvents(currentRows(sessions, machine), sessions);

    // 12 -> 14 -> 16 at 170 lb: the 12-rep session is the baseline; the 14- and 16-rep sessions each still hold a
    // current record (best weight at exactly that many reps), so each is one event -- not one per record row.
    expect(events.map((e) => e.session_id)).toEqual([b.id, c.id]);
    const latest = events[1];
    expect(latest?.records.find((r) => r.kind === 'rep_at_load')).toMatchObject({ load: 170, value: 16 });
    expect(latest?.primary_kind).toBe('rep_at_load'); // 170 lb was already lifted, so no max-load record leads it
  });

  it('labels an event with the highest-priority kind it holds, without dropping the others', () => {
    const first = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const second = makeSession([lift(bench, 105, 8)], '2026-07-08T10:00:00.000Z');
    const row = (kind: PersonalRecord['kind']): PersonalRecord => ({
      id: `pr-${kind}`,
      created_at: '2026-07-08T10:00:00.000Z',
      updated_at: '2026-07-08T10:00:00.000Z',
      version: 1,
      device_id: 'seed',
      deleted_at: null,
      exercise_id: 'bench',
      kind,
      value: 1,
      reps: null,
      achieved_at: '2026-07-08T10:00:00.000Z',
      source_session_id: second.id,
      source_set_id: 's',
      training_location_id: null,
    });

    const lowOnly = buildHeadlinePREvents([row('volume'), row('rep_range'), row('estimated_1rm')], [first, second]);
    expect(lowOnly[0]?.primary_kind).toBe('estimated_1rm');

    const withLoad = buildHeadlinePREvents(
      [row('volume'), row('rep_at_load'), row('estimated_1rm'), row('max_load')],
      [first, second],
    );
    expect(withLoad[0]?.primary_kind).toBe('max_load');
    expect(withLoad[0]?.records.map((r) => r.kind)).toEqual(['max_load', 'rep_at_load', 'estimated_1rm', 'volume']);

    // Kinds not in the handoff's list still rank (last), and every kind is ordered exactly once.
    expect(new Set(HEADLINE_PRIMARY_KIND_ORDER).size).toBe(HEADLINE_PRIMARY_KIND_ORDER.length);
  });

  it('does not count a row whose session is unknown -- it cannot be shown to be an improvement', () => {
    const first = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const second = makeSession([lift(bench, 105, 8)], '2026-07-08T10:00:00.000Z');
    const rows = currentRows([first, second], bench);
    expect(buildHeadlinePREvents(rows, [second])).toEqual([]); // the baseline is missing from the given sessions
    expect(buildHeadlinePREvents(rows, [])).toEqual([]);
  });

  it('ignores sessions that are not completed when deciding what came first', () => {
    const discarded = makeSession([lift(bench, 90, 8)], '2026-06-01T10:00:00.000Z', { status: 'discarded' });
    const first = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const second = makeSession([lift(bench, 105, 8)], '2026-07-08T10:00:00.000Z');
    const sessions = [discarded, first, second];
    const events = buildHeadlinePREvents(currentRows(sessions, bench), sessions);
    expect(events.map((e) => e.session_id)).toEqual([second.id]);
  });

  it('is independent of the order rows and sessions are given in', () => {
    const a = makeSession([lift(bench, 100, 8), lift(squat, 150, 5)], '2026-07-01T10:00:00.000Z');
    const b = makeSession([lift(bench, 105, 8), lift(squat, 155, 5)], '2026-07-08T10:00:00.000Z');
    const c = makeSession([lift(bench, 110, 6)], '2026-07-15T10:00:00.000Z');
    const rows = currentRows([a, b, c], bench, squat);

    const forward = buildHeadlinePREvents(rows, [a, b, c]);
    const shuffled = buildHeadlinePREvents([...rows].reverse(), [c, a, b]);
    const shape = (events: ReturnType<typeof buildHeadlinePREvents>) =>
      events.map((e) => [e.session_id, e.exercise_id, e.primary_kind, e.records.map((r) => r.id)]);
    expect(shape(shuffled)).toEqual(shape(forward));
  });
});

describe('headlinePREventsInPeriod', () => {
  it('keeps events whose day is inside the inclusive range, and nothing else', () => {
    const a = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const b = makeSession([lift(bench, 105, 8)], '2026-07-08T10:00:00.000Z');
    const c = makeSession([lift(bench, 110, 6)], '2026-07-15T10:00:00.000Z');
    const events = buildHeadlinePREvents(currentRows([a, b, c], bench), [a, b, c]);

    expect(headlinePREventsInPeriod(events, '2026-07-08', '2026-07-14').map((e) => e.session_id)).toEqual([b.id]);
    expect(headlinePREventsInPeriod(events, '2026-07-09', '2026-07-14')).toEqual([]);
    expect(headlinePREventsInPeriod(events, '2026-07-15', '2026-07-15').map((e) => e.session_id)).toEqual([c.id]);
  });
});

describe('exposureSessions (the shared first-exposure index)', () => {
  it('lists each exercise\'s sessions oldest-first per equipment context, so the first entry is the baseline', () => {
    const late = makeSession([lift(bench, 105, 8)], '2026-07-08T10:00:00.000Z');
    const early = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');
    const otherGym = makeSession([lift(bench, 60, 8)], '2026-07-04T10:00:00.000Z', { training_location_id: 'gym-b' });

    const index = exposureSessions([late, otherGym, early]);
    expect(index.get('bench')?.get(null)?.map((s) => s.id)).toEqual([early.id, late.id]);
    expect(index.get('bench')?.get('gym-b')?.map((s) => s.id)).toEqual([otherGym.id]);
  });

  it('counts only PR-eligible exposures: completed sessions, no warm-up-only sessions', () => {
    const warmupOnly = makeSession(
      [{ exerciseId: 'bench', weight: 45, reps: 10, phase: 'warmup' }],
      '2026-06-01T10:00:00.000Z',
    );
    const inProgress = makeSession([lift(bench, 90, 8)], '2026-06-15T10:00:00.000Z', { status: 'in_progress' });
    const real = makeSession([lift(bench, 100, 8)], '2026-07-01T10:00:00.000Z');

    const history = exposureSessions([warmupOnly, inProgress, real]).get('bench')?.get(null);
    expect(history?.map((s) => s.id)).toEqual([real.id]);
  });
});
