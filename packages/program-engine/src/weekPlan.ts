import type { PlannedExercise, Program, WorkoutOccurrence, WorkoutTemplate } from '@atlas/data-model';
import { currentSequentialDay, flattenProgramDays, programProgressionMode } from './sequentialProgress';
import { resolveDayWeekday, resolveWeekSchedule } from './todaySchedule';

/**
 * vNext Handoff 03B. The one definition of "this week" and "a week of the
 * program", shared by Today's This Week card and Progress's Weekly Review /
 * Muscles > Focus so they can never disagree.
 *
 * vNext Handoff 04B: the date arithmetic itself (`localIsoDate`,
 * `addDaysToIso`, `startOfWeekIso`) moved down to `@atlas/core` so packages
 * that cannot depend on program-engine (the weekly review, the consistency
 * milestone) can bucket by the very same calendar. Re-exported here, so every
 * existing import keeps working.
 */
export { addDaysToIso, localIsoDate, startOfWeekIso } from '@atlas/core';

/**
 * How many real (non-rest) sessions the active program schedules in the
 * week containing `todayIso`, or null when that has no meaning: no program,
 * or a Sequential program (it has no calendar week to plan against -- same
 * reason `WeekNavigator` doesn't apply there).
 */
export function plannedSessionsThisWeek(
  program: Program | null | undefined,
  templates: Map<string, WorkoutTemplate>,
  occurrences: WorkoutOccurrence[],
  todayIso: string,
): number | null {
  if (!program || programProgressionMode(program) === 'sequential') return null;
  return resolveWeekSchedule(program, templates, occurrences, todayIso).filter(
    (d) => d.entry.kind !== 'rest' && d.entry.kind !== 'none',
  ).length;
}

/**
 * What one week of the program plans, as one exercise list per scheduled
 * session (rest days omitted). This is the program's STRUCTURE, deliberately
 * not this calendar week's overrides (a moved or skipped day is still part of
 * what the program emphasizes).
 *
 * - Weekly/fixed: the days assigned to a weekday, first day per weekday --
 *   the same match `resolveWeeklySchedule` makes.
 * - Sequential: the days of the program week the sequence is currently in
 *   (one rotation).
 */
export function plannedSessionsForProgramWeek(
  program: Program | null | undefined,
  templates: Map<string, WorkoutTemplate>,
): PlannedExercise[][] {
  if (!program) return [];
  const flattened = flattenProgramDays(program);
  let days;
  if (programProgressionMode(program) === 'sequential') {
    const current = currentSequentialDay(program);
    days = current ? flattened.filter((f) => f.week.id === current.week.id).map((f) => f.day) : [];
  } else {
    const seenWeekdays = new Set<number>();
    days = flattened
      .map((f) => f.day)
      .filter((day) => {
        const weekday = resolveDayWeekday(day);
        if (weekday == null || seenWeekdays.has(weekday)) return false;
        seenWeekdays.add(weekday);
        return true;
      });
  }
  return days
    .map((day) => templates.get(day.template_id)?.exercises ?? [])
    .filter((exercises) => exercises.length > 0);
}
