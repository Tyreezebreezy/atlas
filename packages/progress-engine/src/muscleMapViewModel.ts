import { getMuscle, muscleMapOf, MUSCLE_GROUPS } from '@atlas/anatomy';
import { eligibleSets, exposureSessions, performanceContextKey, type ExposureSessions } from '@atlas/pr-engine';
import type {
  Exercise,
  PersonalRecord,
  PersonalRecordEvent,
  PlannedExercise,
  WorkoutSession,
} from '@atlas/data-model';
import { detectStagnation } from './detectStagnation';

/**
 * vNext Handoff 03B. The presentation contract between ATLAS analytics and
 * the Body Map renderer:
 *
 *   sessions / program / PRs  ->  buildMuscleMapViewModel  ->  Body Map
 *
 * The renderer only paints what this returns (`normalized_visual_intensity`
 * is already 0..1), and the ranked list under the map prints the exact
 * counts -- nobody has to infer a number from a color.
 *
 * Four deliberately different questions, never blended into one score:
 *
 * - **trained**     what did I train, and how often? (distinct workouts that
 *                   targeted the muscle as a primary muscle)
 * - **volume**      where did my working sets go? (primary-target working sets)
 * - **focus**       what does my program's week emphasize? (planned sets)
 * - **performance** which muscles have associated exercises that are
 *                   progressing / stable / stalled / short on data? This is
 *                   about exercise PERFORMANCE and says nothing about muscle
 *                   growth.
 *
 * V1 volume rule (Handoff 03B §10): a set counts once, fully, for each of
 * its exercise's PRIMARY muscles. Secondary involvement is tallied
 * separately and is never converted into fractional "effective sets".
 * `groups` counts a set once per group even when the exercise's primary
 * muscles land in the same group twice (bench press hits Upper and Mid
 * Chest -- that's one set of chest work, not two), so a group's number
 * cannot be recovered by summing its muscles and is aggregated here.
 */

export type MuscleMapMode = 'trained' | 'volume' | 'focus' | 'performance';

export type MusclePerformanceState = 'progressing' | 'stable' | 'stalled' | 'insufficient_data';

/** How many of the muscle's associated exercises are in each state -- always
 * exposed so the single rolled-up state never hides a mixed picture. */
export type PerformanceCounts = Record<MusclePerformanceState, number>;

/** One exercise that targeted a muscle (or group) as a primary muscle. */
export interface MuscleExerciseEntry {
  exercise_id: string;
  /** Working sets (focus: planned sets) of this exercise credited to the muscle. */
  sets: number;
  /** Performance only. */
  performance_state?: MusclePerformanceState;
}

export interface MuscleMapEntry {
  muscle_id: string;
  /** Working sets (trained/volume/performance) or planned weekly sets (focus) that
   * target this muscle as a primary muscle. */
  primary_set_count: number;
  /** Sets/planned sets where this muscle was only secondarily involved. */
  secondary_set_count: number;
  /** Distinct workouts (focus: distinct planned sessions) that targeted it as a primary muscle. */
  workout_count: number;
  last_trained_at: string | null;
  /** Primary-target exercises, most sets first. */
  exercises: MuscleExerciseEntry[];
  /** Focus only: share (0..1) of the week's planned working sets that target this muscle. */
  focus_score?: number;
  /** Performance only. See `PERFORMANCE_PRECEDENCE`. */
  performance_state?: MusclePerformanceState;
  performance_counts?: PerformanceCounts;
  /** 0..1, normalized for the current mode. */
  normalized_visual_intensity: number;
}

export interface MuscleGroupEntry extends Omit<MuscleMapEntry, 'muscle_id'> {
  group_id: string;
  /** Members of the group that have any activity in this view, in taxonomy order. */
  muscle_ids: string[];
}

export interface MuscleMapViewModel {
  mode: MuscleMapMode;
  /** `days`/`start`/`end` are null in focus mode: it describes the program's week, not a time window. */
  period: { days: number | null; start: string | null; end: string | null };
  /** Distinct sets/workouts, NOT the sum of the rows below (a set hitting two muscles is one set). */
  totals: { working_sets: number; workouts: number };
  muscles: MuscleMapEntry[];
  groups: MuscleGroupEntry[];
  /** Why there is nothing to show, or null when there is something. */
  empty_reason: 'no_training_in_period' | 'no_program' | null;
}

export interface MuscleMapInput {
  mode: MuscleMapMode;
  /** Rolling window ending at `now` (trained / volume / performance). Ignored by focus. */
  periodDays: number;
  sessions: WorkoutSession[];
  exercises: Map<string, Exercise>;
  /** Current persisted PRs -- performance mode only, for the stall check (`detectStagnation` reads the standing records; a superseding session is always later, so it is equivalent to reading the event ledger). */
  personalRecords?: PersonalRecord[];
  /** The PR event history -- performance mode only, for "progressing". */
  prEvents?: PersonalRecordEvent[];
  /** Focus only: one array per scheduled session in the program's week. */
  plannedSessions?: PlannedExercise[][];
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The order a muscle's single rolled-up state is chosen in: one stalled
 * exercise is worth a look even when its neighbors progress (same precedence
 * as `buildWeeklyReview`'s status), then progress, then holding steady. */
export const PERFORMANCE_PRECEDENCE: readonly MusclePerformanceState[] = [
  'stalled',
  'progressing',
  'stable',
  'insufficient_data',
];

function emptyCounts(): PerformanceCounts {
  return { progressing: 0, stable: 0, stalled: 0, insufficient_data: 0 };
}

interface Tally {
  primarySets: number;
  secondarySets: number;
  primarySessions: Set<string>;
  lastPrimaryAt: string | null;
  performance: PerformanceCounts;
  exerciseSets: Map<string, number>;
  exerciseStates: Map<string, MusclePerformanceState>;
}

function tallyFor(map: Map<string, Tally>, id: string): Tally {
  let tally = map.get(id);
  if (!tally) {
    tally = {
      primarySets: 0,
      secondarySets: 0,
      primarySessions: new Set(),
      lastPrimaryAt: null,
      performance: emptyCounts(),
      exerciseSets: new Map(),
      exerciseStates: new Map(),
    };
    map.set(id, tally);
  }
  return tally;
}

function creditPrimary(
  tally: Tally,
  sets: number,
  exerciseId: string,
  sessionKey: string,
  at: string | null,
): void {
  tally.primarySets += sets;
  tally.primarySessions.add(sessionKey);
  tally.lastPrimaryAt = laterOf(tally.lastPrimaryAt, at);
  tally.exerciseSets.set(exerciseId, (tally.exerciseSets.get(exerciseId) ?? 0) + sets);
}

function laterOf(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}

/** A set's exercise, split into what it targets and what merely assists. */
function musclesOf(exercise: Exercise | undefined): { primary: string[]; secondaryOnly: string[] } | null {
  const map = exercise ? muscleMapOf(exercise) : null;
  if (!map) return null;
  const primary = [...new Set(map.primary)];
  const primarySet = new Set(primary);
  return { primary, secondaryOnly: [...new Set(map.secondary)].filter((id) => !primarySet.has(id)) };
}

function groupOf(muscleId: string): string | null {
  return getMuscle(muscleId)?.group_id ?? null;
}

/**
 * Credits `sets` of work to the muscles (and, once each, their groups).
 * `sessionKey` identifies the workout (or planned session) for `workout_count`.
 */
function credit(
  muscles: Map<string, Tally>,
  groups: Map<string, Tally>,
  targets: { primary: string[]; secondaryOnly: string[] },
  sets: number,
  exerciseId: string,
  sessionKey: string,
  at: string | null,
): void {
  const primaryGroups = new Set<string>();
  for (const id of targets.primary) {
    creditPrimary(tallyFor(muscles, id), sets, exerciseId, sessionKey, at);
    const group = groupOf(id);
    if (group) primaryGroups.add(group);
  }
  const secondaryGroups = new Set<string>();
  for (const id of targets.secondaryOnly) {
    tallyFor(muscles, id).secondarySets += sets;
    const group = groupOf(id);
    if (group && !primaryGroups.has(group)) secondaryGroups.add(group);
  }
  for (const id of primaryGroups) creditPrimary(tallyFor(groups, id), sets, exerciseId, sessionKey, at);
  for (const id of secondaryGroups) tallyFor(groups, id).secondarySets += sets;
}

/**
 * One exercise's state, reusing the same signals `buildWeeklyReview` reads
 * (stalled from `detectStagnation`, progress from a current PersonalRecord)
 * rather than a second notion of "better".
 *
 * - `insufficient_data`: no equipment context has two completed exposures
 *   yet, so there is nothing to compare against.
 * - `stalled`: `detectStagnation` flags it.
 * - `progressing`: a PR event (the ledger of performances that beat an
 *   earlier record -- a baseline is never one) falls inside the window for this
 *   exercise in that context.
 * - `stable`: enough history, no flag, no new PR in the window.
 */
export function exercisePerformanceState(
  sessions: WorkoutSession[],
  exercise: Exercise,
  personalRecords: PersonalRecord[],
  prEvents: PersonalRecordEvent[],
  window: { start: number; end: number },
  /** Pass a prebuilt index when judging many exercises over the same sessions. */
  exposures: ExposureSessions = exposureSessions(sessions),
): MusclePerformanceState {
  let comparable = false;
  let progressed = false;
  // A context is the location AND the machine (Handoff 04B): an event counts for
  // the context it was earned in, so a PR on one machine never makes another
  // machine's exercise look like it is progressing.
  for (const [contextKey, history] of exposures.get(exercise.id) ?? []) {
    if (history.length < 2) continue;
    comparable = true;
    progressed ||= prEvents.some((event) => {
      if (event.exercise_id !== exercise.id || performanceContextKey(event) !== contextKey) return false;
      const achieved = new Date(event.achieved_at).getTime();
      return achieved >= window.start && achieved <= window.end;
    });
  }

  if (!comparable) return 'insufficient_data';
  if (detectStagnation(sessions, exercise, personalRecords).length > 0) return 'stalled';
  return progressed ? 'progressing' : 'stable';
}

function rollUp(counts: PerformanceCounts): MusclePerformanceState {
  return PERFORMANCE_PRECEDENCE.find((state) => counts[state] > 0) ?? 'insufficient_data';
}

interface Aggregate {
  muscles: Map<string, Tally>;
  groups: Map<string, Tally>;
  totals: { working_sets: number; workouts: number };
  /** Focus only. */
  plannedSets: number;
}

function aggregateTraining(
  input: MuscleMapInput,
  window: { start: number; end: number },
): Aggregate {
  const { sessions, exercises, mode } = input;
  const inWindow = eligibleSets(sessions).filter((e) => {
    const at = new Date(e.set.completed_at).getTime();
    return at >= window.start && at <= window.end;
  });

  const muscles = new Map<string, Tally>();
  const groups = new Map<string, Tally>();
  const workoutIds = new Set<string>();
  let workingSets = 0;
  const performanceByExercise = new Map<string, MusclePerformanceState>();
  const exposures = mode === 'performance' ? exposureSessions(sessions) : undefined;

  for (const { set, session } of inWindow) {
    workoutIds.add(session.id);
    workingSets += 1;
    const exercise = exercises.get(set.exercise_id);
    const targets = musclesOf(exercise);
    if (!exercise || !targets) continue;

    credit(muscles, groups, targets, 1, exercise.id, session.id, set.completed_at);

    // Performance: judge each exercise once (not per set) and tell every muscle/group it targets.
    if (mode === 'performance' && !performanceByExercise.has(exercise.id)) {
      const state = exercisePerformanceState(
        sessions,
        exercise,
        input.personalRecords ?? [],
        input.prEvents ?? [],
        window,
        exposures,
      );
      performanceByExercise.set(exercise.id, state);
      const seenGroups = new Set<string>();
      for (const id of targets.primary) {
        const tally = tallyFor(muscles, id);
        tally.performance[state] += 1;
        tally.exerciseStates.set(exercise.id, state);
        const group = groupOf(id);
        if (group && !seenGroups.has(group)) {
          seenGroups.add(group);
          const groupTally = tallyFor(groups, group);
          groupTally.performance[state] += 1;
          groupTally.exerciseStates.set(exercise.id, state);
        }
      }
    }
  }

  return {
    muscles,
    groups,
    totals: { working_sets: workingSets, workouts: workoutIds.size },
    plannedSets: 0,
  };
}

function aggregatePlan(input: MuscleMapInput): Aggregate {
  const muscles = new Map<string, Tally>();
  const groups = new Map<string, Tally>();
  let plannedSets = 0;
  let sessionCount = 0;
  (input.plannedSessions ?? []).forEach((planned, index) => {
    if (planned.length === 0) return;
    sessionCount += 1;
    for (const item of planned) {
      const sets = item.target_sets ?? 1;
      plannedSets += sets;
      const targets = musclesOf(input.exercises.get(item.exercise_id));
      if (targets) credit(muscles, groups, targets, sets, item.exercise_id, `planned:${index}`, null);
    }
  });
  return { muscles, groups, totals: { working_sets: plannedSets, workouts: sessionCount }, plannedSets };
}

const STATE_RANK = new Map(PERFORMANCE_PRECEDENCE.map((state, index) => [state, index]));

function entryFor(
  tally: Tally,
  mode: MuscleMapMode,
  plannedSets: number,
): Omit<MuscleMapEntry, 'muscle_id' | 'normalized_visual_intensity'> {
  const exercises: MuscleExerciseEntry[] = [...tally.exerciseSets.entries()]
    .map(([exercise_id, sets]) => {
      const state = tally.exerciseStates.get(exercise_id);
      return { exercise_id, sets, ...(state ? { performance_state: state } : {}) };
    })
    .sort((a, b) => b.sets - a.sets || a.exercise_id.localeCompare(b.exercise_id));
  const base = {
    primary_set_count: tally.primarySets,
    secondary_set_count: tally.secondarySets,
    workout_count: tally.primarySessions.size,
    last_trained_at: tally.lastPrimaryAt,
    exercises,
  };
  if (mode === 'focus') {
    return { ...base, focus_score: plannedSets > 0 ? tally.primarySets / plannedSets : 0 };
  }
  if (mode === 'performance') {
    return {
      ...base,
      performance_state: rollUp(tally.performance),
      performance_counts: { ...tally.performance },
    };
  }
  return base;
}

function withIntensity<T extends Omit<MuscleMapEntry, 'muscle_id' | 'normalized_visual_intensity'>>(
  entries: T[],
  mode: MuscleMapMode,
): (T & { normalized_visual_intensity: number })[] {
  const valueOf = (entry: T): number => {
    if (mode === 'trained') return entry.workout_count;
    if (mode === 'performance') return entry.performance_state === 'insufficient_data' ? 0 : 1;
    return entry.primary_set_count;
  };
  const max = Math.max(0, ...entries.map(valueOf));
  return entries.map((entry) => ({
    ...entry,
    normalized_visual_intensity: max > 0 ? valueOf(entry) / max : 0,
  }));
}

function compareEntries(
  mode: MuscleMapMode,
): (
  a: Omit<MuscleMapEntry, 'muscle_id' | 'normalized_visual_intensity'>,
  b: Omit<MuscleMapEntry, 'muscle_id' | 'normalized_visual_intensity'>,
) => number {
  return (a, b) => {
    if (mode === 'performance') {
      const byState =
        (STATE_RANK.get(a.performance_state ?? 'insufficient_data') ?? 0) -
        (STATE_RANK.get(b.performance_state ?? 'insufficient_data') ?? 0);
      if (byState !== 0) return byState;
      const exercisesOf = (e: typeof a) =>
        Object.values(e.performance_counts ?? emptyCounts()).reduce((sum, n) => sum + n, 0);
      return exercisesOf(b) - exercisesOf(a);
    }
    if (mode === 'trained') {
      return (
        b.workout_count - a.workout_count ||
        b.primary_set_count - a.primary_set_count ||
        (b.last_trained_at ?? '').localeCompare(a.last_trained_at ?? '')
      );
    }
    return b.primary_set_count - a.primary_set_count || b.secondary_set_count - a.secondary_set_count;
  };
}

export function buildMuscleMapViewModel(input: MuscleMapInput): MuscleMapViewModel {
  const { mode } = input;
  const now = input.now ?? new Date();
  const window = { start: now.getTime() - input.periodDays * DAY_MS, end: now.getTime() };
  const aggregate = mode === 'focus' ? aggregatePlan(input) : aggregateTraining(input, window);

  const compare = compareEntries(mode);
  const muscleRows = [...aggregate.muscles.entries()]
    // A muscle that only ever assisted has nothing to say about performance (no associated primary exercise).
    .filter(([, tally]) => mode !== 'performance' || Object.values(tally.performance).some((n) => n > 0))
    .map(([id, tally]) => ({ muscle_id: id, ...entryFor(tally, mode, aggregate.plannedSets) }))
    .sort((a, b) => compare(a, b) || a.muscle_id.localeCompare(b.muscle_id));
  const groupOrder = new Map(MUSCLE_GROUPS.map((group, index) => [group.id, index]));
  const groupRows = [...aggregate.groups.entries()]
    .filter(([, tally]) => mode !== 'performance' || Object.values(tally.performance).some((n) => n > 0))
    .map(([id, tally]) => ({ group_id: id, ...entryFor(tally, mode, aggregate.plannedSets) }))
    .sort((a, b) => compare(a, b) || (groupOrder.get(a.group_id) ?? 0) - (groupOrder.get(b.group_id) ?? 0));

  const muscles = withIntensity(muscleRows, mode);
  const memberIds = (groupId: string) =>
    muscles.map((m) => m.muscle_id).filter((id) => groupOf(id) === groupId);
  const groups: MuscleGroupEntry[] = withIntensity(groupRows, mode).map((row) => ({
    ...row,
    muscle_ids: memberIds(row.group_id),
  }));

  const hasActivity = mode === 'performance' ? muscles.length > 0 : aggregate.totals.working_sets > 0;
  return {
    mode,
    period:
      mode === 'focus'
        ? { days: null, start: null, end: null }
        : {
            days: input.periodDays,
            start: new Date(window.start).toISOString(),
            end: now.toISOString(),
          },
    totals: aggregate.totals,
    muscles,
    groups,
    empty_reason: hasActivity
      ? null
      : mode === 'focus'
        ? 'no_program'
        : 'no_training_in_period',
  };
}
