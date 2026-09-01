import type { Program, ProgramDay, ProgramWeek } from '@atlas/data-model';

/** Old stored programs (pre-v0.1.1) have neither field at runtime despite
 * the required type -- see program.ts's comment. Every other read site in
 * this package/apps/web should go through these two rather than reading
 * the fields directly. */
export function programProgressionMode(program: Program): 'fixed' | 'sequential' {
  return program.progression_mode ?? 'fixed';
}

export function programSequencePosition(program: Program): number {
  return program.sequence_position ?? 0;
}

export interface FlattenedProgramDay {
  week: ProgramWeek;
  weekIndex: number;
  day: ProgramDay;
}

/** Weeks and days, in `order`, as one flat sequence -- the same
 * week/day structure Fixed Schedule already uses, just walked in order
 * instead of shown all at once. No new authoring structure. */
export function flattenProgramDays(program: Program): FlattenedProgramDay[] {
  const weeks = [...program.weeks].sort((a, b) => a.order - b.order);
  const result: FlattenedProgramDay[] = [];
  weeks.forEach((week, weekIndex) => {
    for (const day of [...week.days].sort((a, b) => a.order - b.order)) {
      result.push({ week, weekIndex, day });
    }
  });
  return result;
}

/** The one day Today should show for a sequential program -- null if the
 * program has no days at all yet. */
export function currentSequentialDay(program: Program): FlattenedProgramDay | null {
  const flattened = flattenProgramDays(program);
  if (flattened.length === 0) return null;
  const position = programSequencePosition(program) % flattened.length;
  return flattened[position] ?? null;
}

/** Advances sequence_position by one (wrapping back to the start -- a
 * repeating rotation like Upper/Lower/Upper/Lower, not a program that ends)
 * only when the completed/skipped day is genuinely the one the program was
 * currently on. A day started out of the normal sequence (if that's ever
 * reachable) does not move the position, so it can't desync from what
 * Today is actually showing. No-op for a fixed-schedule program. */
export function advanceProgramSequence(program: Program, completedDayId: string): Program {
  if (programProgressionMode(program) !== 'sequential') return program;
  const current = currentSequentialDay(program);
  if (!current || current.day.id !== completedDayId) return program;
  const flattened = flattenProgramDays(program);
  const nextPosition = (programSequencePosition(program) + 1) % flattened.length;
  return { ...program, sequence_position: nextPosition };
}
