import type { PlannedExercise, Program, WorkoutOccurrence, WorkoutTemplate } from '@atlas/data-model';
import { currentSequentialDay, flattenProgramDays, programProgressionMode } from './sequentialProgress';
import { resolveDayWeekday, resolveWeekSchedule } from './todaySchedule';

/**
 * vNext Handoff 03B. The one definition of "this week" and "a week of the
 * program", shared by Today's This Week card and Progress's Weekly Review /
 * Muscles > Focus so they can never disagree.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Device-local (not UTC) YYYY-MM-DD. */
export function localIsoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDaysToIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

/** Monday of the calendar week containing `iso` -- the same Monday-first convention as `resolveWeekSchedule`. */
export function startOfWeekIso(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00`).getDay();
  return addDaysToIso(iso, weekday === 0 ? -6 : 1 - weekday);
}

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
