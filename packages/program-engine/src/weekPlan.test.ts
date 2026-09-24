import { describe, expect, it } from 'vitest';
import type { Program, WorkoutTemplate } from '@atlas/data-model';
import { createProgram, createProgramDay, createProgramWeek } from './createProgram';
import {
  addDaysToIso,
  localIsoDate,
  plannedSessionsForProgramWeek,
  plannedSessionsThisWeek,
  startOfWeekIso,
} from './weekPlan';

function template(id: string, exerciseIds: string[]): WorkoutTemplate {
  const now = new Date().toISOString();
  return {
    id,
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name: id,
    exercises: exerciseIds.map((exerciseId, i) => ({
      id: `pe-${id}-${i}`,
      exercise_id: exerciseId,
      order: i + 1,
      target_sets: 3,
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

// 2026-09-07 is a real Monday.
const MONDAY = '2026-09-07';

const TEMPLATES = new Map([
  ['tpl-upper', template('tpl-upper', ['bench', 'row'])],
  ['tpl-lower', template('tpl-lower', ['squat'])],
  ['tpl-rest', template('tpl-rest', [])],
  ['tpl-arms', template('tpl-arms', ['curl'])],
]);

function weeklyProgram(): Program {
  const monday = { ...createProgramDay(1, 'Monday · Upper', 'tpl-upper'), weekday: 1 };
  const tuesday = { ...createProgramDay(2, 'Tuesday · Lower', 'tpl-lower'), weekday: 2 };
  const sunday = { ...createProgramDay(3, 'Sunday · Rest', 'tpl-rest'), weekday: 0 };
  const week = { ...createProgramWeek(1, null), days: [monday, tuesday, sunday] };
  return { ...createProgram('Weekly', null), weeks: [week] };
}

describe('week date helpers', () => {
  it('formats device-local dates and does day arithmetic across month ends', () => {
    expect(localIsoDate(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(addDaysToIso('2026-09-28', 5)).toBe('2026-10-03');
    expect(addDaysToIso('2026-01-02', -3)).toBe('2025-12-30');
  });

  it('starts weeks on Monday, including for a Sunday', () => {
    expect(startOfWeekIso('2026-09-07')).toBe('2026-09-07'); // Monday
    expect(startOfWeekIso('2026-09-10')).toBe('2026-09-07'); // Thursday
    expect(startOfWeekIso('2026-09-13')).toBe('2026-09-07'); // Sunday belongs to the week that began Monday
    expect(startOfWeekIso('2026-10-01')).toBe('2026-09-28'); // crosses a month boundary
  });
});

describe('plannedSessionsThisWeek', () => {
  it('counts scheduled non-rest days for a weekly program', () => {
    expect(plannedSessionsThisWeek(weeklyProgram(), TEMPLATES, [], MONDAY)).toBe(2);
  });

  it('is null with no program, and null for a Sequential program', () => {
    expect(plannedSessionsThisWeek(null, TEMPLATES, [], MONDAY)).toBeNull();
    const sequential: Program = { ...weeklyProgram(), progression_mode: 'sequential' };
    expect(plannedSessionsThisWeek(sequential, TEMPLATES, [], MONDAY)).toBeNull();
  });
});

describe('plannedSessionsForProgramWeek', () => {
  it('lists each scheduled weekday session and leaves rest days out', () => {
    const plan = plannedSessionsForProgramWeek(weeklyProgram(), TEMPLATES);
    expect(plan.map((exercises) => exercises.map((e) => e.exercise_id))).toEqual([
      ['bench', 'row'],
      ['squat'],
    ]);
  });

  it('ignores days with no weekday and keeps the first day per weekday', () => {
    const monday = { ...createProgramDay(1, 'Monday · Upper', 'tpl-upper'), weekday: 1 };
    const secondMonday = { ...createProgramDay(2, 'Monday · Arms', 'tpl-arms'), weekday: 1 };
    const floating = { ...createProgramDay(3, 'Bonus', 'tpl-lower'), weekday: null };
    const week = { ...createProgramWeek(1, null), days: [monday, secondMonday, floating] };
    const program: Program = { ...createProgram('Odd', null), weeks: [week] };
    const plan = plannedSessionsForProgramWeek(program, TEMPLATES);
    expect(plan.map((exercises) => exercises.map((e) => e.exercise_id))).toEqual([['bench', 'row']]);
  });

  it('for a Sequential program uses the days of the week the sequence is currently in', () => {
    const w1 = {
      ...createProgramWeek(1, 'Week 1'),
      days: [createProgramDay(1, 'Upper', 'tpl-upper'), createProgramDay(2, 'Lower', 'tpl-lower')],
    };
    const w2 = { ...createProgramWeek(2, 'Week 2'), days: [createProgramDay(1, 'Arms', 'tpl-arms')] };
    const base: Program = {
      ...createProgram('Rotation', null),
      progression_mode: 'sequential',
      weeks: [w1, w2],
    };
    const inWeekOne = plannedSessionsForProgramWeek({ ...base, sequence_position: 1 }, TEMPLATES);
    expect(inWeekOne.map((exercises) => exercises[0]?.exercise_id)).toEqual(['bench', 'squat']);
    const inWeekTwo = plannedSessionsForProgramWeek({ ...base, sequence_position: 2 }, TEMPLATES);
    expect(inWeekTwo.map((exercises) => exercises[0]?.exercise_id)).toEqual(['curl']);
  });

  it('is empty with no program', () => {
    expect(plannedSessionsForProgramWeek(null, TEMPLATES)).toEqual([]);
  });
});
