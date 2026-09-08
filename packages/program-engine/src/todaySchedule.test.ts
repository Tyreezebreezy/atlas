import { describe, expect, it } from 'vitest';
import type { Program, ProgramDay, WorkoutTemplate } from '@atlas/data-model';
import { createProgram, createProgramDay, createProgramWeek } from './createProgram';
import { completeOccurrence, moveOccurrence, skipOccurrence } from './workoutOccurrence';
import {
  resolveDayWeekday,
  resolveUpNext,
  resolveWeeklySchedule,
  todaysScheduleEntry,
  weekdayOfIsoDate,
} from './todaySchedule';

function template(id: string, name: string, exerciseCount = 1): WorkoutTemplate {
  const now = new Date().toISOString();
  return {
    id,
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name,
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({
      id: `pe-${id}-${i}`,
      exercise_id: `ex-${i}`,
      order: i + 1,
      target_sets: null,
      target_reps_min: null,
      target_reps_max: null,
      target_weight: null,
      target_rpe: null,
      target_rir: null,
      target_duration_seconds: null,
      target_distance_meters: null,
      rest_seconds: null,
      notes: null,
      group_id: null,
    })),
    is_quick_workout: false,
    groups: [],
  };
}

// 2026-09-07 is a real Monday (verified against the actual calendar).
const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';
const SUNDAY = '2026-09-13';

function weeklyProgram(): { program: Program; templates: Map<string, WorkoutTemplate> } {
  const monday = { ...createProgramDay(1, 'Monday · Upper A', 'tpl-monday'), weekday: 1 };
  const tuesday = { ...createProgramDay(2, 'Tuesday · Lower', 'tpl-tuesday'), weekday: 2 };
  const sunday = { ...createProgramDay(3, 'Sunday · Rest', 'tpl-sunday'), weekday: 0 };
  const week = { ...createProgramWeek(1, null), days: [monday, tuesday, sunday] };
  const program: Program = { ...createProgram('Weekly Workout Guide', null), weeks: [week] };
  const templates = new Map([
    ['tpl-monday', template('tpl-monday', 'Upper A')],
    ['tpl-tuesday', template('tpl-tuesday', 'Lower')],
    ['tpl-sunday', template('tpl-sunday', 'Rest', 0)],
  ]);
  return { program, templates };
}

describe('weekdayOfIsoDate', () => {
  it('resolves the correct local weekday for known real dates', () => {
    expect(weekdayOfIsoDate(MONDAY)).toBe(1);
    expect(weekdayOfIsoDate(TUESDAY)).toBe(2);
    expect(weekdayOfIsoDate(SUNDAY)).toBe(0);
  });

  it('matches local Date-component construction, not a UTC string parse of the same ISO date', () => {
    // `new Date("YYYY-MM-DD")` (no time component) parses as UTC midnight;
    // `.getDay()` on that result reports the PREVIOUS calendar day for any
    // timezone behind UTC (the Americas, etc.) -- a real, easy-to-reintroduce
    // bug if this function is ever "simplified" back to `new
    // Date(iso).getDay()`. Comparing against `new Date(y, m-1, d)` (local
    // component construction, immune to that pitfall) rather than a
    // hardcoded weekday number means this test's own expectation is
    // correct in whatever timezone it actually runs in, while still
    // pinning weekdayOfIsoDate to the safe construction path.
    for (const iso of [MONDAY, TUESDAY, SUNDAY, '2026-01-01', '2026-12-31']) {
      const [y, m, d] = iso.split('-').map(Number);
      expect(weekdayOfIsoDate(iso)).toBe(new Date(y!, m! - 1, d!).getDay());
    }
  });
});

describe('resolveDayWeekday', () => {
  it('uses the explicit weekday field when set', () => {
    const day: ProgramDay = { ...createProgramDay(1, 'Some label', 'tpl'), weekday: 3 };
    expect(resolveDayWeekday(day)).toBe(3);
  });

  it('falls back to parsing a recognizable weekday name out of the label', () => {
    const day = createProgramDay(1, 'Monday · Upper A', 'tpl');
    expect(resolveDayWeekday(day)).toBe(1);
  });

  it('is case-insensitive when parsing the label', () => {
    const day = createProgramDay(1, 'FRIDAY - full body', 'tpl');
    expect(resolveDayWeekday(day)).toBe(5);
  });

  it('returns null when neither an explicit weekday nor a recognizable label exists', () => {
    const day = createProgramDay(1, 'Full Body A', 'tpl');
    expect(resolveDayWeekday(day)).toBeNull();
  });
});

describe('resolveWeeklySchedule', () => {
  it('Monday resolves the Monday workout only', () => {
    const { program, templates } = weeklyProgram();
    const entry = resolveWeeklySchedule(program, templates, [], MONDAY);
    expect(entry.kind).toBe('workout');
    if (entry.kind === 'workout') {
      expect(entry.resolved.day.label).toBe('Monday · Upper A');
      expect(entry.resolved.template?.name).toBe('Upper A');
    }
  });

  it('Tuesday resolves the Tuesday workout only, not Monday', () => {
    const { program, templates } = weeklyProgram();
    const entry = resolveWeeklySchedule(program, templates, [], TUESDAY);
    expect(entry.kind).toBe('workout');
    if (entry.kind === 'workout') expect(entry.resolved.day.label).toBe('Tuesday · Lower');
  });

  it('a rest day (zero-exercise template) resolves to kind "rest", not "workout"', () => {
    const { program, templates } = weeklyProgram();
    const entry = resolveWeeklySchedule(program, templates, [], SUNDAY);
    expect(entry).toMatchObject({ kind: 'rest' });
  });

  it('a weekday with no assigned day resolves to "none"', () => {
    const { program, templates } = weeklyProgram();
    // Wednesday (2026-09-09) has no day in this 3-day program.
    const entry = resolveWeeklySchedule(program, templates, [], '2026-09-09');
    expect(entry).toEqual({ kind: 'none' });
  });

  it('a moved-away day is not shown on its original date', () => {
    const { program, templates } = weeklyProgram();
    const mondayDay = program.weeks[0]!.days[0]!;
    const occurrence = moveOccurrence(null, program.id, mondayDay.id, MONDAY, TUESDAY);
    const entry = resolveWeeklySchedule(program, templates, [occurrence], MONDAY);
    expect(entry).toMatchObject({ kind: 'moved_away', movedToDate: TUESDAY });
  });

  it("a day moved IN to a date shows there, taking priority over that date's own regular day", () => {
    const { program, templates } = weeklyProgram();
    const mondayDay = program.weeks[0]!.days[0]!;
    // Move Monday's workout onto Sunday (which normally has its own rest day).
    const occurrence = moveOccurrence(null, program.id, mondayDay.id, MONDAY, SUNDAY);
    const entry = resolveWeeklySchedule(program, templates, [occurrence], SUNDAY);
    expect(entry.kind).toBe('workout');
    if (entry.kind === 'workout') expect(entry.resolved.template?.name).toBe('Upper A');
  });

  it('a skipped day resolves to kind "skipped", not "workout"', () => {
    const { program, templates } = weeklyProgram();
    const mondayDay = program.weeks[0]!.days[0]!;
    const occurrence = skipOccurrence(null, program.id, mondayDay.id, MONDAY, 'felt sick');
    const entry = resolveWeeklySchedule(program, templates, [occurrence], MONDAY);
    expect(entry).toMatchObject({ kind: 'skipped' });
  });

  it('a completed occurrence resolves to kind "completed", not "workout" -- real bug found live: a single-Monday program moved+completed onto Tuesday was showing "Start Workout" again on Tuesday', () => {
    const monday = createProgramDay(1, 'Monday', 'tpl-monday');
    const week = { ...createProgramWeek(1, null), days: [monday] };
    const program: Program = { ...createProgram('Real Program', null), weeks: [week] };
    const templates = new Map([['tpl-monday', template('tpl-monday', 'Progression Test')]]);
    const moved = moveOccurrence(null, program.id, monday.id, MONDAY, TUESDAY);
    const completed = completeOccurrence(moved, program.id, monday.id, MONDAY, 'session-1');

    const entry = resolveWeeklySchedule(program, templates, [completed], TUESDAY);
    expect(entry).toMatchObject({ kind: 'completed' });
  });

  it('a completed day is never returned as Up Next -- it already happened, it is not upcoming', () => {
    const monday = createProgramDay(1, 'Monday', 'tpl-monday');
    const week = { ...createProgramWeek(1, null), days: [monday] };
    const program: Program = { ...createProgram('Real Program', null), weeks: [week] };
    const templates = new Map([['tpl-monday', template('tpl-monday', 'Progression Test')]]);
    const moved = moveOccurrence(null, program.id, monday.id, MONDAY, TUESDAY);
    const completed = completeOccurrence(moved, program.id, monday.id, MONDAY, 'session-1');

    // Viewed from Monday: Tuesday holds a completed (not upcoming) session,
    // and the only other candidate within the 7-day window is next Monday
    // (offset 7) -- Up Next must land there, never on Tuesday.
    const next = resolveUpNext(program, templates, [completed], MONDAY);
    expect(next?.date).not.toBe(TUESDAY);
    expect(next?.day.label).toBe('Monday');
  });

  it('does not mutate the Program or its templates while resolving', () => {
    const { program, templates } = weeklyProgram();
    const programSnapshot = JSON.stringify(program);
    const templatesSnapshot = JSON.stringify([...templates.values()]);
    resolveWeeklySchedule(program, templates, [], MONDAY);
    expect(JSON.stringify(program)).toBe(programSnapshot);
    expect(JSON.stringify([...templates.values()])).toBe(templatesSnapshot);
  });
});

describe('resolveUpNext', () => {
  it('resolves Tuesday as Up Next when viewed from Monday', () => {
    const { program, templates } = weeklyProgram();
    const next = resolveUpNext(program, templates, [], MONDAY);
    expect(next?.day.label).toBe('Tuesday · Lower');
    expect(next?.date).toBe(TUESDAY);
  });

  it('skips a rest day and lands on the next real workout', () => {
    const { program, templates } = weeklyProgram();
    // From Tuesday, the only other day is Sunday (rest) then Monday again
    // the following week -- Up Next should skip Sunday's rest and land on
    // the next Monday.
    const next = resolveUpNext(program, templates, [], TUESDAY);
    expect(next?.day.label).toBe('Monday · Upper A');
  });

  it('respects a moved occurrence when computing what is next', () => {
    const { program, templates } = weeklyProgram();
    const tuesdayDay = program.weeks[0]!.days[1]!;
    // Move Tuesday's workout to Wednesday -- Up Next viewed from Monday
    // should now show it landing on Wednesday, not Tuesday.
    const occurrence = moveOccurrence(null, program.id, tuesdayDay.id, TUESDAY, '2026-09-09');
    const next = resolveUpNext(program, templates, [occurrence], MONDAY);
    expect(next?.date).toBe('2026-09-09');
  });
});

describe('todaysScheduleEntry (combined Weekly/Sequential entry point)', () => {
  it('uses weekly resolution for a fixed-mode program', () => {
    const { program, templates } = weeklyProgram();
    const entry = todaysScheduleEntry(program, templates, [], MONDAY);
    expect(entry.kind).toBe('workout');
  });

  it('uses sequential resolution for a sequential-mode program, ignoring weekday entirely', () => {
    const day1 = createProgramDay(1, 'Day 1', 'tpl-monday');
    const day2 = createProgramDay(2, 'Day 2', 'tpl-tuesday');
    const week = { ...createProgramWeek(1, null), days: [day1, day2] };
    const program: Program = {
      ...createProgram('Sequential Test', null),
      progression_mode: 'sequential',
      sequence_position: 1,
      weeks: [week],
    };
    const templates = new Map([
      ['tpl-monday', template('tpl-monday', 'Upper A')],
      ['tpl-tuesday', template('tpl-tuesday', 'Lower')],
    ]);
    // Position 1 means day2 is next, regardless of what day of the week it
    // actually is (e.g. even queried with a real Sunday date).
    const entry = todaysScheduleEntry(program, templates, [], SUNDAY);
    expect(entry.kind).toBe('workout');
    if (entry.kind === 'workout') expect(entry.resolved.day.label).toBe('Day 2');
  });
});
