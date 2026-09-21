import { muscleMapOf, getMuscle } from '@atlas/anatomy';
import { eligibleSets } from '@atlas/pr-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';

/**
 * v1.0.0 (H3). "Training Exposure" — a deterministic aggregation of recorded
 * training onto individual muscles, distinguishing **direct** (primary) work
 * from **secondary** involvement. Recorded workout facts (performed sets)
 * remain canonical; this is a derived view, never a stored entity and never
 * an invented "physiological stimulus" score.
 *
 * A set is "direct" for each of its exercise's primary muscles and
 * "secondary" for each secondary muscle. Volume counts only direct sets,
 * using the same `(weight ?? external_load) × reps` convention as
 * `summarizeSession`/`sessionSummary`.
 */

export interface MuscleExposureEntry {
  muscleId: string;
  /** Direct (primary) working sets for this muscle. */
  directSets: number;
  /** Sets where this muscle was secondarily involved. */
  secondarySets: number;
  /** Volume (weight × reps) across direct sets. */
  volume: number;
  /** Number of distinct sessions that trained this muscle (directly or indirectly). */
  frequency: number;
  /** Exercise ids that trained this muscle directly. */
  exercises: string[];
  lastTrainedAt: string | null;
}

export interface TrainingExposure {
  windowDays: number;
  muscles: MuscleExposureEntry[];
}

const DEFAULT_WINDOW_DAYS = 7;

export function trainingExposure(
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): TrainingExposure {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = eligibleSets(sessions).filter(
    (e) => new Date(e.set.completed_at).getTime() >= cutoff,
  );
  return { windowDays, muscles: aggregate(inWindow, exercises) };
}

/** Per-muscle exposure for ONE session (no window) — the workout-summary view. */
export function sessionMuscleExposure(
  session: WorkoutSession,
  exercises: Map<string, Exercise>,
): MuscleExposureEntry[] {
  return aggregate(eligibleSets([session]), exercises);
}

function aggregate(
  sets: { set: { exercise_id: string; completed_at: string; weight: number | null; external_load?: number | null; reps: number | null }; session: WorkoutSession }[],
  exercises: Map<string, Exercise>,
): MuscleExposureEntry[] {
  const entries = new Map<string, MuscleExposureEntry & { sessions: Set<string> }>();
  const ensure = (muscleId: string) => {
    const existing = entries.get(muscleId);
    if (existing) return existing;
    const created = {
      muscleId,
      directSets: 0,
      secondarySets: 0,
      volume: 0,
      frequency: 0,
      exercises: [] as string[],
      lastTrainedAt: null as string | null,
      sessions: new Set<string>(),
    };
    entries.set(muscleId, created);
    return created;
  };

  for (const { set, session } of sets) {
    const exercise = exercises.get(set.exercise_id);
    if (!exercise) continue;
    const map = muscleMapOf(exercise);
    if (!map) continue;

    const volume = (set.weight ?? set.external_load ?? 0) * (set.reps ?? 0);

    for (const muscleId of map.primary) {
      const entry = ensure(muscleId);
      entry.directSets += 1;
      entry.volume += volume;
      if (!entry.exercises.includes(exercise.id)) entry.exercises.push(exercise.id);
      entry.sessions.add(session.id);
      entry.lastTrainedAt = later(entry.lastTrainedAt, set.completed_at);
    }
    for (const muscleId of map.secondary) {
      const entry = ensure(muscleId);
      entry.secondarySets += 1;
      entry.sessions.add(session.id);
      entry.lastTrainedAt = later(entry.lastTrainedAt, set.completed_at);
    }
  }

  return [...entries.values()]
    .map(({ sessions, ...entry }) => ({ ...entry, frequency: sessions.size }))
    .sort((a, b) => b.directSets - a.directSets || b.secondarySets - a.secondarySets);
}

function later(a: string | null, b: string): string {
  if (a == null) return b;
  return a.localeCompare(b) >= 0 ? a : b;
}

/** The taxonomy muscle-group id an exercise primarily targets, or null when
 * unmappable (callers fall back to the legacy `category` string). */
export function primaryMuscleGroupId(exercise: Exercise | undefined): string | null {
  if (!exercise) return null;
  const map = muscleMapOf(exercise);
  if (!map || map.primary.length === 0) return null;
  return getMuscle(map.primary[0]!)?.group_id ?? null;
}
