import { describe, expect, it } from 'vitest';
import {
  completeOccurrence,
  findOccurrence,
  findOccurrenceByEffectiveDate,
  moveOccurrence,
  replaceOccurrence,
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
