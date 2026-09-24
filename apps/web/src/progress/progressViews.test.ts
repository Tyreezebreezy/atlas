import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  startWorkoutSession,
} from '@atlas/workout-engine';
import { calculatePRs } from '@atlas/pr-engine';
import { buildWeeklyReview, detectAllStagnation } from '@atlas/progress-engine';
import { createMilestone } from '@atlas/milestone-engine';
import { createBodyMeasurement } from '@atlas/body-composition';
import type { Exercise, Milestone, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { BodySummary } from '../body/BodyScreen';
import { MilestonesView } from './MilestonesView';
import { MusclesView } from './MusclesView';
import { OverviewView } from './OverviewView';
import type { ProgressData } from './progressData';
import { StrengthView } from './StrengthView';

// Thursday 24 Sep 2026, local noon. Every date below is relative to it.
const NOW = new Date(2026, 8, 24, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

const at = (daysAgo: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
};

function exercise(id: string, name: string, muscles?: { primary: string[]; secondary?: string[] }): Exercise {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name,
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
    muscle_map: muscles
      ? { primary: muscles.primary, secondary: muscles.secondary ?? [], provenance: 'user', taxonomy_version: '1.0.0' }
      : null,
  };
}

function session(sets: { exerciseId: string; weight: number; reps: number }[], daysAgo: number): WorkoutSession {
  let s = startWorkoutSession({
    name: 'Session',
    templateId: null,
    programId: null,
    programDayId: null,
    plannedSnapshot: [],
    startedAt: at(daysAgo),
  });
  sets.forEach((set, index) => {
    s = addPerformedSet(s, {
      ...createPerformedSet({
        exerciseId: set.exerciseId,
        setIndex: index,
        setType: 'normal',
        weight: set.weight,
        reps: set.reps,
        durationSeconds: null,
        distanceMeters: null,
        rpe: null,
        rir: null,
        notes: null,
      }),
      completed_at: at(daysAgo),
    });
  });
  return { ...completeWorkoutSession(s), completed_at: at(daysAgo) };
}

const PRESS = exercise('press', 'Lever Chest Press', { primary: ['chest.mid'], secondary: ['arms.triceps'] });
const ROW = exercise('row', 'Barbell Row', { primary: ['back.lats'] });
const EXERCISES = new Map([PRESS, ROW].map((e) => [e.id, e]));

function prsFor(sessions: WorkoutSession[]): PersonalRecord[] {
  return [...EXERCISES.values()].flatMap((e) => calculatePRs(sessions, e));
}

function data(overrides: Partial<ProgressData> = {}): ProgressData {
  const sessions = overrides.sessions ?? [];
  return {
    sessions,
    exercises: EXERCISES,
    prs: prsFor(sessions),
    milestones: [],
    benchmarks: [],
    bodyMeasurements: [],
    activeProgram: null,
    templates: new Map(),
    occurrences: [],
    ...overrides,
  };
}

const noop = () => {};
const overview = (d: ProgressData) =>
  renderToStaticMarkup(
    createElement(OverviewView, { data: d, onOpenStrength: noop, onOpenSegment: noop, onViewExercises: noop }),
  );

describe('Overview — scales with the amount of history', () => {
  it('has a plain empty state, not a dashboard of empty cards', () => {
    const html = overview(data());
    expect(html).toContain('No workouts yet');
    expect(html).not.toContain('This week');
    expect(html).not.toContain('Recent progress');
  });

  it('early user: a short summary with fixed-load rep progress, and nothing that needs more history', () => {
    const sessions = [
      session([{ exerciseId: 'press', weight: 170, reps: 12 }], 14),
      session([{ exerciseId: 'press', weight: 170, reps: 14 }], 7),
      session([{ exerciseId: 'press', weight: 170, reps: 16 }], 1),
    ];
    const html = overview(data({ sessions }));
    expect(html).toContain('>3<');
    expect(html).toContain('workouts completed');
    expect(html).toContain('+2 reps at 170 lb');
    // Fixed load -> reps at that load, never a fabricated e1RM claim.
    expect(html).not.toContain('est. 1RM');
    // Established-only surfaces stay out.
    expect(html).not.toContain('This week');
    expect(html).not.toContain('Muscles · last 30 days');
  });

  it('shows no trend for something done once -- it says what is needed instead', () => {
    const html = overview(data({ sessions: [session([{ exerciseId: 'press', weight: 170, reps: 12 }], 1)] }));
    expect(html).toContain('Do an exercise twice and how it changed shows up here.');
    expect(html).not.toMatch(/\+\d+ (reps|lb)/);
  });

  it('established user: the weekly review card shows what buildWeeklyReview returned', () => {
    const sessions = [
      session([{ exerciseId: 'press', weight: 150, reps: 10 }, { exerciseId: 'row', weight: 100, reps: 8 }], 30),
      session([{ exerciseId: 'press', weight: 150, reps: 12 }], 24),
      session([{ exerciseId: 'row', weight: 105, reps: 8 }], 20),
      session([{ exerciseId: 'press', weight: 160, reps: 10 }], 13),
      session([{ exerciseId: 'row', weight: 110, reps: 8 }], 10),
      session([{ exerciseId: 'press', weight: 160, reps: 12 }], 3), // Monday of this week
      session([{ exerciseId: 'row', weight: 115, reps: 8 }], 2), // Tuesday of this week
    ];
    const d = data({ sessions });
    const review = buildWeeklyReview({
      periodStart: '2026-09-21',
      periodEnd: '2026-09-27',
      sessions,
      personalRecords: d.prs,
      milestones: [],
      bodyMeasurements: [],
      stagnationSignals: detectAllStagnation(sessions, EXERCISES, d.prs),
      plannedSessions: null,
    });
    const html = overview(d);
    expect(review.completed_sessions).toBe(2);
    expect(html).toContain('This week');
    expect(html).toContain(`<strong>${review.completed_sessions}</strong>`);
    if (review.pr_count > 0) expect(html).toContain(`${review.pr_count} PR`);
    for (const [count, word] of [
      [review.exercises_progressed, 'progressed'],
      [review.exercises_maintained, 'maintained'],
      [review.exercises_stalled, 'stalled'],
    ] as const) {
      if (count > 0) expect(html).toContain(`<strong>${count}</strong> ${word}`);
      else expect(html).not.toContain(` ${word}<`);
    }
    // No planned-session count without a program, no body-weight line without weigh-ins.
    expect(html).not.toContain('atlas-review__of');
    expect(html).not.toContain('Body weight avg');
    expect(html).toContain('Muscles · last 30 days');
  });
});

describe('Strength — supported trends and rep-at-load progress', () => {
  it('opens a fixed-load exercise on reps at that load, with the load as a label', () => {
    const sessions = [12, 14, 16, 18].map((reps, i) =>
      session([{ exerciseId: 'press', weight: 170, reps }], (4 - i) * 7),
    );
    const html = renderToStaticMarkup(
      createElement(StrengthView, {
        data: data({ sessions }),
        exerciseId: 'press',
        onSelectExercise: noop,
        onViewExercises: noop,
      }),
    );
    expect(html).toContain('170 lb');
    expect(html).toContain('reps per session at this load');
    expect(html).toContain('Best 18');
    // e1RM is a different concept and a different tab; no headline e1RM exists for sets above 10 reps.
    expect(html).toContain('Estimated 1RM</button>');
    expect(html).not.toContain('Estimated 1RM PR');
  });

  it('says so plainly when there is no strength data', () => {
    const html = renderToStaticMarkup(
      createElement(StrengthView, { data: data(), exerciseId: null, onSelectExercise: noop, onViewExercises: noop }),
    );
    expect(html).toContain('No strength data yet');
  });
});

describe('Muscles — exact values, honest empty states', () => {
  const muscles = (d: ProgressData) => renderToStaticMarkup(createElement(MusclesView, { data: d }));

  it('lists exact working-set counts by group and keeps assisting muscles separate', () => {
    const sessions = [session([1, 2, 3, 4].map(() => ({ exerciseId: 'press', weight: 100, reps: 8 })), 3)];
    const html = muscles(data({ sessions }));
    expect(html).toContain('4 sets');
    expect(html).toContain('4 sets as assist'); // triceps assist, not converted into primary volume
    expect(html).toContain('Assist only');
    expect(html).toContain('4 working sets');
    // Volume never claims anything about growth.
    expect(html).not.toMatch(/growth/i);
  });

  it('offers all four questions, and the map is one shared renderer', () => {
    const html = muscles(data({ sessions: [session([{ exerciseId: 'press', weight: 100, reps: 8 }], 3)] }));
    for (const label of ['Trained', 'Volume', 'Focus', 'Performance']) expect(html).toContain(`>${label}<`);
    expect(html).toContain('atlas-body-map');
  });

  it('explains an empty period instead of drawing an all-blank body', () => {
    const html = muscles(data({ sessions: [session([{ exerciseId: 'press', weight: 100, reps: 8 }], 80)] }));
    expect(html).toContain('No completed workouts in the last 30 days. Try a longer period.');
    expect(html).not.toContain('atlas-body-map__svg');
  });

  it('explains a brand-new install', () => {
    expect(muscles(data())).toContain('Finish a workout to see which muscles you&#x27;ve trained.');
  });
});

describe('Body — no data, sparse, populated', () => {
  const body = (measurements: ReturnType<typeof createBodyMeasurement>[]) =>
    renderToStaticMarkup(createElement(BodySummary, { measurements, onLog: noop }));
  const weigh = (daysAgo: number, weight: number, extra = {}) =>
    createBodyMeasurement({ date: at(daysAgo).slice(0, 10), weight, ...extra });

  it('no data: one clear next step and nothing else', () => {
    const html = body([]);
    expect(html).toContain('No weigh-ins yet');
    expect(html).toContain('Log first weigh-in');
    expect(html).not.toContain('atlas-trend-chart');
  });

  it('sparse: shows what exists and says when the average will appear -- no invented average', () => {
    const html = body([weigh(7, 181.2), weigh(1, 180.6)]);
    expect(html).toContain('180.6');
    expect(html).toContain('A 7-day average appears once there are three weigh-ins within a week.');
    expect(html).not.toMatch(/7-day average \d/);
  });

  it('populated: the raw weigh-ins lead and the 7-day average is the quiet secondary line', () => {
    const html = body([weigh(6, 180), weigh(4, 179), weigh(2, 178), weigh(0, 177)]);
    expect(html).toContain('177');
    expect(html).toMatch(/7-day average \d+(\.\d)? lb/);
    expect(html).toContain('atlas-trend-chart__legend');
    expect(html).toContain('atlas-trend-chart__secondary');
  });

  it('keeps body-composition estimates collapsed, optional, and labeled as estimates', () => {
    const without = body([weigh(0, 177)]);
    expect(without).not.toContain('Body composition estimates');
    const withBf = body([weigh(6, 180, { bodyFatPercentage: 18 }), weigh(0, 177, { bodyFatPercentage: 17.6 })]);
    expect(withBf).toContain('<details');
    expect(withBf).not.toContain('<details open');
    expect(withBf).toContain('not an exact measurement');
  });
});

describe('Milestones — categories, hidden program completion, distinct benchmark language', () => {
  const view = (milestones: Milestone[]) =>
    renderToStaticMarkup(
      createElement(MilestonesView, {
        data: data({ milestones }),
        onAdd: noop,
        onEdit: noop,
        onRemove: noop,
        onChooseNextGoal: noop,
      }),
    );
  const goal = (over: Parameters<typeof createMilestone>[0], achieved = false): Milestone => ({
    ...createMilestone(over),
    achieved_at: achieved ? '2026-09-01T10:00:00.000Z' : null,
  });

  const bench = goal({ title: '185 lb Bench Press', exerciseId: 'press', dimension: 'weight', targetWeight: 185, isBuiltin: true });
  const streak = goal({ title: '50 Sessions', exerciseId: null, dimension: 'consistency', targetTotalSessions: 50 });
  const mine = goal({ title: 'Machine Press 20 reps', exerciseId: 'press', dimension: 'weight', targetWeight: 170 });
  const program = goal(
    { title: 'Training Block Complete', exerciseId: null, dimension: 'program_completion', targetProgramId: 'p' },
    true,
  );

  it('groups by category and does not render categories that have nothing in them', () => {
    const html = view([bench, streak, mine]);
    for (const label of ['Performance', 'Consistency', 'User-defined']) expect(html).toContain(label);
    expect(html).not.toContain('>Body<');
    expect(html).not.toContain('>Program<');
  });

  it('never draws the same goal twice', () => {
    const html = view([bench, streak, mine]);
    for (const title of ['185 lb Bench Press', '50 Sessions', 'Machine Press 20 reps']) {
      expect(html.split(title).length - 1).toBe(1);
    }
  });

  it('does not surface "Training Block Complete", even when it was achieved', () => {
    const html = view([program, bench]);
    expect(html).not.toContain('Training Block Complete');
    expect(html).toContain('Achieved (0)');
  });

  it('states a non-lift goal in words instead of a generic "not enough data"', () => {
    const html = view([streak]);
    expect(html).toContain('50 completed workouts');
    expect(html).not.toContain('Not enough data yet');
  });

  it('starts on Achieved when there is nothing in progress', () => {
    const done = goal({ title: '135 lb Bench Press', exerciseId: 'press', dimension: 'weight', targetWeight: 135, isBuiltin: true }, true);
    const html = view([done]);
    expect(html).toContain('Achieved 2026-09-01'.slice(0, 8)); // "Achieved " prefix on the card
    expect(html).toContain('135 lb Bench Press');
  });

  it('has no Benchmarks pane unless there is a real comparison to show', () => {
    expect(view([bench])).not.toContain('>Benchmarks<');
  });
});
