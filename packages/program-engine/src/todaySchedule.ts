import type { Program, ProgramDay, WorkoutOccurrence, WorkoutTemplate } from '@atlas/data-model';
import { findOccurrence, findOccurrenceByEffectiveDate } from './workoutOccurrence';
import {
  currentSequentialDay,
  flattenProgramDays,
  programProgressionMode,
} from './sequentialProgress';

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Local (not UTC) YYYY-MM-DD for a `Date` -- the inverse of the
 * `new Date(y, m, d)` construction `weekdayOfIsoDate` relies on, so a date
 * arrived at by pure day-arithmetic (`setDate`) round-trips back to the
 * same local calendar day it was constructed from. */
function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** `Date.getDay()`'s local (not UTC) weekday for `date` -- device-local by
 * construction, since `new Date(y, m, d)` (no timezone marker) always
 * resolves in the local timezone, unlike `new Date("YYYY-MM-DD")` which
 * parses as UTC midnight and can land on the wrong local day near either
 * edge of a day. Callers pass today's own already-local YYYY-MM-DD (see
 * `todayIso()`), so this just re-derives the weekday from those same
 * local components rather than re-parsing through UTC. */
export function weekdayOfIsoDate(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getDay();
}

/** Explicit `day.weekday` wins when set. Otherwise, falls back to finding a
 * recognizable weekday name anywhere in `day.label` -- every real
 * Weekly-mode program seen in practice (including the owner's own seeded
 * Weekly Workout Guide) already names its days "Monday · Upper A" etc., so
 * this resolves correctly with no forced migration for existing data. Full
 * names only (not "Mon"/"Tue"): a 3-letter abbreviation risks matching
 * inside an unrelated word in a free-text label. Returns null when neither
 * source resolves -- a day genuinely not tied to any weekday. */
export function resolveDayWeekday(day: ProgramDay): number | null {
  if (day.weekday != null) return day.weekday;
  const lower = day.label.toLowerCase();
  const index = WEEKDAY_NAMES.findIndex((name) => lower.includes(name));
  return index === -1 ? null : index;
}

export interface ResolvedDay {
  day: ProgramDay;
  template: WorkoutTemplate | null;
  /** The occurrence actually governing this slot, if any -- e.g. something
   * moved in from elsewhere, or this day's own occurrence for this date. */
  occurrence: WorkoutOccurrence | null;
}

export type TodayScheduleEntry =
  | { kind: 'workout'; resolved: ResolvedDay }
  /** The resolved day's template has zero exercises (a real rest day like
   * the owner's own Sunday), not "nothing scheduled at all." */
  | { kind: 'rest'; day: ProgramDay }
  | { kind: 'skipped'; day: ProgramDay; occurrence: WorkoutOccurrence }
  /** Already done for this slot (a real WorkoutSession is linked) -- not
   * something to offer "Start Workout" for again, and never a valid Up
   * Next match (already happened, not upcoming). */
  | { kind: 'completed'; day: ProgramDay; occurrence: WorkoutOccurrence }
  /** Today's regular day was moved to a different date -- nothing to show
   * here today (see `movedToDate`), distinct from never having anything
   * scheduled at all. */
  | { kind: 'moved_away'; day: ProgramDay; movedToDate: string }
  /** No Program day resolves to today at all, and nothing was moved in. */
  | { kind: 'none' };

function templateFor(
  templates: Map<string, WorkoutTemplate>,
  id: string | null,
): WorkoutTemplate | null {
  return id ? (templates.get(id) ?? null) : null;
}

/**
 * The ONE thing Today should show for a Weekly/Calendar ("fixed") program --
 * see docs/DATA_MODEL.md "Weekly schedule resolution." Occurrence overrides
 * take priority over the plain weekday match, in this order:
 *  1. Something with an effective_date of today (moved in from elsewhere,
 *     or replaced) -- shown regardless of what today's own weekday slot is.
 *  2. Today's own regularly-scheduled day (by resolved weekday), UNLESS its
 *     own occurrence says it was moved away or skipped.
 *  3. Nothing.
 * Sequential programs don't use this at all -- `currentSequentialDay`
 * already covers that mode; see `todaysScheduleEntry` for the combined
 * entry point.
 */
export function resolveWeeklySchedule(
  program: Program,
  templates: Map<string, WorkoutTemplate>,
  occurrences: WorkoutOccurrence[],
  todayIso: string,
): TodayScheduleEntry {
  const allDays = flattenProgramDays(program).map((f) => f.day);

  const movedIn = findOccurrenceByEffectiveDate(occurrences, todayIso);
  if (movedIn && movedIn.status !== 'skipped') {
    const sourceDay = allDays.find((d) => d.id === movedIn.program_day_id);
    if (sourceDay) {
      if (movedIn.status === 'completed') {
        return { kind: 'completed', day: sourceDay, occurrence: movedIn };
      }
      const templateId = movedIn.replacement_template_id ?? sourceDay.template_id;
      const template = templateFor(templates, templateId);
      if (template && template.exercises.length === 0) return { kind: 'rest', day: sourceDay };
      return { kind: 'workout', resolved: { day: sourceDay, template, occurrence: movedIn } };
    }
  }

  const todayWeekday = weekdayOfIsoDate(todayIso);
  const scheduledDay = allDays.find((d) => resolveDayWeekday(d) === todayWeekday);
  if (!scheduledDay) return { kind: 'none' };

  const ownOccurrence = findOccurrence(occurrences, scheduledDay.id, todayIso);
  if (ownOccurrence?.status === 'moved') {
    return { kind: 'moved_away', day: scheduledDay, movedToDate: ownOccurrence.effective_date };
  }
  if (ownOccurrence?.status === 'skipped') {
    return { kind: 'skipped', day: scheduledDay, occurrence: ownOccurrence };
  }
  if (ownOccurrence?.status === 'completed') {
    return { kind: 'completed', day: scheduledDay, occurrence: ownOccurrence };
  }

  const templateId = ownOccurrence?.replacement_template_id ?? scheduledDay.template_id;
  const template = templateFor(templates, templateId);
  if (template && template.exercises.length === 0) return { kind: 'rest', day: scheduledDay };
  return { kind: 'workout', resolved: { day: scheduledDay, template, occurrence: ownOccurrence } };
}

export interface UpNextEntry {
  day: ProgramDay;
  template: WorkoutTemplate | null;
  /** ISO date this occurrence of the day actually falls on. */
  date: string;
}

/** Walks forward up to 7 calendar days (a full week) from tomorrow, in
 * effective-schedule terms (an occurrence moved into one of those dates
 * counts; a day moved away from one doesn't), and returns the first day
 * with a real (non-empty, non-skipped) workout. Null if nothing in the
 * whole week resolves to anything -- e.g. a program with only a single
 * rest day defined, which is a degenerate but not invalid Program. */
export function resolveUpNext(
  program: Program,
  templates: Map<string, WorkoutTemplate>,
  occurrences: WorkoutOccurrence[],
  todayIso: string,
): UpNextEntry | null {
  const start = new Date(`${todayIso}T00:00:00`);
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(start);
    candidate.setDate(candidate.getDate() + offset);
    const iso = toIsoDate(candidate);
    const entry = resolveWeeklySchedule(program, templates, occurrences, iso);
    if (entry.kind === 'workout') {
      return { day: entry.resolved.day, template: entry.resolved.template, date: iso };
    }
  }
  return null;
}

export interface MissedEntry {
  /** ISO date this occurrence was originally scheduled for -- always in the past. */
  date: string;
  resolved: ResolvedDay;
}

/**
 * v0.2.4. Walks backward up to `lookbackDays` (default one week, mirroring
 * `resolveUpNext`'s forward-looking bound) from yesterday, collecting any
 * date that still resolves to a real, unaddressed workout -- i.e. `kind:
 * 'workout'`, meaning not completed, not skipped, and not moved away
 * (those already have their own status and don't belong here). Most
 * recently missed first, since that's the most actionable.
 *
 * Fixed-schedule programs only: a sequential program has no calendar
 * cadence to be "missed" against -- its only notion of "next" is
 * `currentSequentialDay`, which doesn't advance until explicitly completed
 * or skipped, so nothing is ever silently missed there.
 */
export function resolveMissedWorkouts(
  program: Program,
  templates: Map<string, WorkoutTemplate>,
  occurrences: WorkoutOccurrence[],
  todayIso: string,
  lookbackDays = 7,
): MissedEntry[] {
  if (programProgressionMode(program) !== 'fixed') return [];
  const start = new Date(`${todayIso}T00:00:00`);
  const results: MissedEntry[] = [];
  for (let offset = 1; offset <= lookbackDays; offset++) {
    const candidate = new Date(start);
    candidate.setDate(candidate.getDate() - offset);
    const iso = toIsoDate(candidate);
    const entry = resolveWeeklySchedule(program, templates, occurrences, iso);
    if (entry.kind === 'workout') {
      results.push({ date: iso, resolved: entry.resolved });
    }
  }
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

export interface WeekDayEntry {
  date: string;
  /** `Date.getDay()` convention (0=Sun..6=Sat), for the caller's own weekday labeling. */
  weekday: number;
  entry: TodayScheduleEntry;
}

/**
 * v0.2.4. The Monday-Sunday week containing `anyDateInWeekIso`, each day
 * resolved independently through the exact same `resolveWeeklySchedule`
 * used for Today/Up Next/Missed -- a week navigator asks nothing that
 * those don't already answer per-date. Monday-first is a pure display
 * convention here (the underlying weekday matching is unaffected).
 *
 * Fixed-schedule programs only -- see `resolveMissedWorkouts`'s doc
 * comment for why Sequential mode has no calendar week to show; callers
 * should offer a sequence-based navigator (current position and its
 * neighbors) instead.
 */
export function resolveWeekSchedule(
  program: Program,
  templates: Map<string, WorkoutTemplate>,
  occurrences: WorkoutOccurrence[],
  anyDateInWeekIso: string,
): WeekDayEntry[] {
  const centerWeekday = weekdayOfIsoDate(anyDateInWeekIso);
  const mondayOffset = centerWeekday === 0 ? -6 : 1 - centerWeekday;
  const center = new Date(`${anyDateInWeekIso}T00:00:00`);
  const monday = new Date(center);
  monday.setDate(monday.getDate() + mondayOffset);

  const result: WeekDayEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = toIsoDate(d);
    result.push({
      date: iso,
      weekday: weekdayOfIsoDate(iso),
      entry: resolveWeeklySchedule(program, templates, occurrences, iso),
    });
  }
  return result;
}

/** The single combined entry point Today should use, regardless of
 * Weekly/Sequential mode -- callers shouldn't need their own mode branch. */
export function todaysScheduleEntry(
  program: Program,
  templates: Map<string, WorkoutTemplate>,
  occurrences: WorkoutOccurrence[],
  todayIso: string,
): TodayScheduleEntry {
  if (programProgressionMode(program) === 'sequential') {
    const next = currentSequentialDay(program);
    if (!next) return { kind: 'none' };
    const ownOccurrence = findOccurrence(occurrences, next.day.id, todayIso);
    // Defensive, not the normal path: completing a day already advances
    // sequence_position (see GymModeScreen's handleFinish), so the
    // "current" sequential day is never the one just marked completed --
    // this only guards against that invariant somehow not holding.
    if (ownOccurrence?.status === 'completed') {
      return { kind: 'completed', day: next.day, occurrence: ownOccurrence };
    }
    const template = templateFor(templates, next.day.template_id);
    if (template && template.exercises.length === 0) return { kind: 'rest', day: next.day };
    return { kind: 'workout', resolved: { day: next.day, template, occurrence: ownOccurrence } };
  }
  return resolveWeeklySchedule(program, templates, occurrences, todayIso);
}
