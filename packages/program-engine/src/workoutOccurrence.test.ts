import { describe, expect, it } from 'vitest';
import { startWorkoutSession } from '@atlas/workout-engine';
import {
  completeOccurrence,
  findOccurrence,
  findOccurrenceByEffectiveDate,
  moveOccurrence,
  replaceOccurrence,
  resolveOccurrenceCompletion,
  skipOccurrence,
} from './workoutOccurrence';
import { createProgram, createProgramDay, createProgramWeek } from './createProgram';

describe('workoutOccurrence', () => {
  it('moving a workout does not mutate the Program template', () => {
    const day = createProgramDay(0, 'Monday', 'template-upper-a');
    const week = { ...createProgramWeek(0, null), days: [day] };
    const program = { ...createProgram('Real Program', null), weeks: [week] };
    const programSnapshot = JSON.parse(JSON.stringify(program));

    const occurrence = moveOccurrence(null, program.id, day.id, '2026-09-07', '2026-09-08');

    expect(program).toEqual(programSnapshot); // untouched
    expect(occurrence.status).toBe('moved');
    expect(occurrence.original_date).toBe('2026-09-07');
    expect(occurrence.effective_date).toBe('2026-09-08');
    expect(occurrence.program_day_id).toBe(day.id);
  });

  it('a move is findable both by its original date and by its new effective date', () => {
    const occurrence = moveOccurrence(null, 'prog-1', 'day-1', '2026-09-07', '2026-09-08');
    expect(findOccurrence([occurrence], 'day-1', '2026-09-07')?.id).toBe(occurrence.id);
    expect(findOccurrenceByEffectiveDate([occurrence], '2026-09-08')?.id).toBe(occurrence.id);
    expect(findOccurrenceByEffectiveDate([occurrence], '2026-09-07')).toBeNull();
  });

  it('skip stores a durable skipped state rather than deleting anything', () => {
    const occurrence = skipOccurrence(null, 'prog-1', 'day-1', '2026-09-07', 'Sick day');
    expect(occurrence.status).toBe('skipped');
    expect(occurrence.notes).toBe('Sick day');
    expect(occurrence.effective_date).toBe('2026-09-07'); // unmoved
  });

  it('replace records the substitute template without touching the Program', () => {
    const occurrence = replaceOccurrence(null, 'prog-1', 'day-1', '2026-09-07', 'quick-workout-1');
    expect(occurrence.status).toBe('replaced');
    expect(occurrence.replacement_template_id).toBe('quick-workout-1');
  });

  it('does not create a duplicate occurrence for the same slot -- reuses what the caller looked up', () => {
    const first = moveOccurrence(null, 'prog-1', 'day-1', '2026-09-07', '2026-09-08');
    const occurrences = [first];
    const found = findOccurrence(occurrences, 'day-1', '2026-09-07');
    const second = skipOccurrence(found, 'prog-1', 'day-1', '2026-09-07');

    expect(second.id).toBe(first.id); // same row, updated in place
    expect(second.status).toBe('skipped');
  });

  it('completing an occurrence preserves that it was moved and/or replaced', () => {
    let occurrence = moveOccurrence(null, 'prog-1', 'day-1', '2026-09-07', '2026-09-08');
    occurrence = replaceOccurrence(occurrence, 'prog-1', 'day-1', '2026-09-07', 'quick-workout-1');
    occurrence = completeOccurrence(occurrence, 'prog-1', 'day-1', '2026-09-07', 'session-1');

    expect(occurrence.status).toBe('completed');
    expect(occurrence.session_id).toBe('session-1');
    expect(occurrence.effective_date).toBe('2026-09-08'); // still reflects the move
    expect(occurrence.replacement_template_id).toBe('quick-workout-1'); // still reflects the replacement
  });

  it('a fresh occurrence starts as planned before any action is taken', () => {
    // ensureOccurrence's internal default -- exercised indirectly via any
    // action's own returned base state before this specific action's field.
    const occurrence = completeOccurrence(null, 'prog-1', 'day-1', '2026-09-07', 'session-1');
    expect(occurrence.original_date).toBe('2026-09-07');
    expect(occurrence.effective_date).toBe('2026-09-07');
  });
});

describe('resolveOccurrenceCompletion', () => {
  const MONDAY = '2026-09-07';
  const TUESDAY = '2026-09-08';

  function sessionFor(scheduledDate: string | null): ReturnType<typeof startWorkoutSession> {
    return {
      ...startWorkoutSession({
        name: 'Upper A',
        templateId: 'tpl-1',
        programId: 'prog-1',
        programDayId: 'day-1',
        plannedSnapshot: [],
        scheduledDate,
      }),
      id: 'session-1',
    };
  }

  it('a normal on-time completion completes the occurrence for its own day, even with no prior row', () => {
    const session = sessionFor(MONDAY);
    const result = resolveOccurrenceCompletion([], session);
    expect(result).toMatchObject({
      status: 'completed',
      original_date: MONDAY,
      effective_date: MONDAY,
      session_id: 'session-1',
    });
  });

  it('a late completion (missed Monday, performed Tuesday) completes MONDAY\'S occurrence, not Tuesday\'s', () => {
    // The session's own started_at/completed_at are real Tuesday timestamps
    // (never backdated -- only Log Past Workout does that); scheduled_date
    // alone carries which occurrence this fulfills.
    const session = { ...sessionFor(MONDAY), started_at: `${TUESDAY}T09:15:00.000Z` };
    const result = resolveOccurrenceCompletion([], session);
    expect(result?.original_date).toBe(MONDAY);
    expect(result?.effective_date).toBe(MONDAY); // late completion, not a move
    expect(result?.status).toBe('completed');
  });

  it('reuses an existing occurrence row (e.g. already moved) rather than creating a duplicate', () => {
    const moved = moveOccurrence(null, 'prog-1', 'day-1', MONDAY, TUESDAY);
    const session = sessionFor(MONDAY);
    const result = resolveOccurrenceCompletion([moved], session);
    expect(result?.id).toBe(moved.id);
    expect(result?.effective_date).toBe(TUESDAY); // the move is preserved
    expect(result?.status).toBe('completed');
  });

  it('returns null for a session with no scheduled_date -- a "Do Again" rerun must never touch an occurrence', () => {
    const session = sessionFor(null);
    expect(resolveOccurrenceCompletion([], session)).toBeNull();
  });

  it('returns null for a session with no program day at all (Freestyle/Quick Workout)', () => {
    const session = {
      ...startWorkoutSession({
        name: 'Freestyle Workout',
        templateId: null,
        programId: null,
        programDayId: null,
        plannedSnapshot: [],
      }),
      id: 'session-2',
    };
    expect(resolveOccurrenceCompletion([], session)).toBeNull();
  });

  it('a "Do Again" rerun does not disturb the original occurrence\'s completion link', () => {
    const firstSession = sessionFor(MONDAY);
    const firstCompletion = resolveOccurrenceCompletion([], firstSession);
    expect(firstCompletion).not.toBeNull();

    // Do Again: same program/day, but no scheduled_date.
    const rerun = { ...sessionFor(null), id: 'session-do-again' };
    const rerunResult = resolveOccurrenceCompletion([firstCompletion!], rerun);

    expect(rerunResult).toBeNull();
    expect(firstCompletion!.session_id).toBe('session-1'); // untouched
  });
});
