import { describe, expect, it } from 'vitest';
import type { Exercise, Milestone } from '@atlas/data-model';
import { createMilestone, type CreateMilestoneInput } from './createMilestone';
import {
  groupMilestonesByCategory,
  isMilestoneVisible,
  milestoneCategory,
} from './groupMilestonesByCategory';

function exercise(id: string, name: string): Exercise {
  const now = new Date().toISOString();
  return {
    id,
    created_at: now,
    updated_at: now,
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
  };
}

const BENCH = exercise('ex-bench', 'barbell bench press');
const PUSHUP = exercise('ex-pushup', 'push-up');
const EXERCISES = new Map([BENCH, PUSHUP].map((e) => [e.id, e]));

function milestone(input: CreateMilestoneInput): Milestone {
  return createMilestone(input);
}

const bench225 = milestone({ title: '225 lb Bench', exerciseId: BENCH.id, dimension: 'weight', targetWeight: 225, isBuiltin: true });
const bench135 = milestone({ title: '135 lb Bench', exerciseId: BENCH.id, dimension: 'weight', targetWeight: 135, isBuiltin: true });
const pushup50 = milestone({ title: '50 Push-Ups', exerciseId: PUSHUP.id, dimension: 'reps', targetReps: 50, isBuiltin: true });
const mine = milestone({ title: 'Bench 315', exerciseId: BENCH.id, dimension: 'weight', targetWeight: 315 });
const streak = milestone({ title: '4 Weeks in a Row', exerciseId: null, dimension: 'consistency', targetConsecutiveWeeks: 4 });
const sessions100 = milestone({ title: '100 Sessions', exerciseId: null, dimension: 'consistency', targetTotalSessions: 100 });
const bodyGoal = milestone({ title: 'Reach 190 lb', exerciseId: null, dimension: 'body_weight', targetBodyWeight: 190 });
const benchmark = milestone({
  title: 'Bench: 75th percentile',
  exerciseId: null,
  dimension: 'benchmark_threshold',
  targetBenchmarkId: 'bm-1',
  targetPercentile: 75,
});
const program = milestone({
  title: 'Training Block Complete',
  exerciseId: null,
  dimension: 'program_completion',
  targetProgramId: 'p1',
});

describe('milestoneCategory', () => {
  it('sorts each dimension into its category, and lift goals by authorship', () => {
    expect(milestoneCategory(bench225)).toBe('performance');
    expect(milestoneCategory(mine)).toBe('user_defined');
    expect(milestoneCategory(streak)).toBe('consistency');
    expect(milestoneCategory(bodyGoal)).toBe('body');
    expect(milestoneCategory(benchmark)).toBe('benchmark');
    expect(milestoneCategory(program)).toBe('program');
  });
});

describe('groupMilestonesByCategory', () => {
  it('orders categories Performance, Benchmark, Consistency, Body, User-defined and labels them', () => {
    const groups = groupMilestonesByCategory([mine, bodyGoal, streak, benchmark, bench225], EXERCISES);
    expect(groups.map((g) => g.label)).toEqual([
      'Performance',
      'Benchmark',
      'Consistency',
      'Body',
      'User-defined',
    ]);
  });

  it('leaves empty categories out entirely', () => {
    expect(groupMilestonesByCategory([], EXERCISES)).toEqual([]);
    const groups = groupMilestonesByCategory([bench225, pushup50], EXERCISES);
    expect(groups.map((g) => g.category)).toEqual(['performance']);
  });

  it('lays lift categories out as one ascending ladder per exercise', () => {
    const [performance] = groupMilestonesByCategory([bench225, pushup50, bench135], EXERCISES);
    expect(performance?.count).toBe(3);
    expect(performance?.sections.map((s) => s.heading)).toEqual(['barbell bench press', 'push-up']);
    expect(performance?.sections[0]?.milestones.map((m) => m.title)).toEqual(['135 lb Bench', '225 lb Bench']);
  });

  it("keeps the owner's own goals apart from the catalog ones for the same lift", () => {
    const groups = groupMilestonesByCategory([bench225, mine], EXERCISES);
    expect(groups.find((g) => g.category === 'performance')?.sections[0]?.milestones).toEqual([bench225]);
    expect(groups.find((g) => g.category === 'user_defined')?.sections[0]?.milestones).toEqual([mine]);
  });

  it('shows non-lift categories as one flat list ordered by target', () => {
    const [consistency] = groupMilestonesByCategory([sessions100, streak], EXERCISES);
    expect(consistency?.sections).toHaveLength(1);
    expect(consistency?.sections[0]?.heading).toBeNull();
    expect(consistency?.sections[0]?.milestones.map((m) => m.title)).toEqual([
      '4 Weeks in a Row',
      '100 Sessions',
    ]);
  });

  it('never draws the same milestone twice', () => {
    const all = [bench225, bench135, pushup50, mine, streak, sessions100, bodyGoal, benchmark];
    const ids = groupMilestonesByCategory(all, EXERCISES).flatMap((g) =>
      g.sections.flatMap((s) => s.milestones.map((m) => m.id)),
    );
    expect(ids).toHaveLength(all.length);
    expect(new Set(ids).size).toBe(all.length);
  });

  it('does not surface program completion as "Training Block Complete" unless asked to', () => {
    expect(isMilestoneVisible(program)).toBe(false);
    expect(isMilestoneVisible(program, { showProgramCompletion: true })).toBe(true);
    expect(isMilestoneVisible(bench225)).toBe(true);

    const hidden = groupMilestonesByCategory([bench225, program], EXERCISES);
    expect(hidden.map((g) => g.category)).toEqual(['performance']);
    expect(hidden.flatMap((g) => g.sections.flatMap((s) => s.milestones)).includes(program)).toBe(false);

    const shown = groupMilestonesByCategory([bench225, program], EXERCISES, { showProgramCompletion: true });
    expect(shown.map((g) => g.label)).toEqual(['Performance', 'Program']);
  });
});
