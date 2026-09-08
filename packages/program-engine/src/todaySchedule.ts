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
    const iso = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
    const entry = resolveWeeklySchedule(program, templates, occurrences, iso);
    if (entry.kind === 'workout') {
      return { day: entry.resolved.day, template: entry.resolved.template, date: iso };
    }
  }
  return null;
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
