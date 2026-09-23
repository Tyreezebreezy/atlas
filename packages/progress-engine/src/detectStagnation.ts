import { eligibleSetsForExercise, type EligibleSet } from '@atlas/pr-engine';
import type { Exercise, PersonalRecord, WorkoutSession } from '@atlas/data-model';

/**
 * vNext Handoff 02 (research pack v2 §10). Deliberately the neutral product
 * term "Progress Stalled" -- never "plateau," "overtraining," or "recovery
 * failure," which are physiological claims this heuristic has no basis to
 * make (performance varies with sleep, fatigue, nutrition, technique, and
 * ordinary noise). One row per exercise+equipment-context combination that
 * currently qualifies; an empty array means nothing is currently flagged.
 */
export interface StagnationSignal {
  exercise_id: string;
  /** Null groups every session with no recorded location -- the legacy/unscoped series, same convention as PersonalRecord.training_location_id. */
  training_location_id: string | null;
  comparable_exposures: number;
  first_exposure_date: string;
  last_exposure_date: string;
  reason_code: 'PROGRESS_STALLED';
}

const DEFAULT_MIN_COMPARABLE_EXPOSURES = 3;

/**
 * "Improvement" is deliberately defined as "pr-engine recorded a new
 * PersonalRecord (of any applicable kind) in one of the recent exposures" --
 * reusing calculatePRs's own, already-tested definition of improvement
 * (higher load, more reps, better e1RM, a new rep-at-load record, etc.)
 * rather than re-deriving a second, possibly-inconsistent notion of
 * "better" here. Callers pass in the CURRENT PersonalRecord set (e.g. from
 * storage) rather than this function recomputing it.
 *
 * Configurable per research pack §10.1: `minComparableExposures` defaults
 * to 3 (a single bad session never flags; two exposures never flags either
 * since there's nothing to compare a lack of improvement against yet). A
 * caller wanting a stronger signal can require e.g. 5.
 */
export function detectStagnation(
  sessions: WorkoutSession[],
  exercise: Exercise,
  personalRecords: PersonalRecord[],
  options: { minComparableExposures?: number } = {},
): StagnationSignal[] {
  const minExposures = options.minComparableExposures ?? DEFAULT_MIN_COMPARABLE_EXPOSURES;
  const eligible = eligibleSetsForExercise(sessions, exercise.id);
  if (eligible.length === 0) return [];

  const byLocation = new Map<string | null, EligibleSet[]>();
  for (const e of eligible) {
    const key = e.session.training_location_id ?? null;
    const list = byLocation.get(key);
    if (list) list.push(e);
    else byLocation.set(key, [e]);
  }

  const signals: StagnationSignal[] = [];
  for (const [locationId, group] of byLocation) {
    const sessionsById = new Map<string, WorkoutSession>();
    for (const e of group) sessionsById.set(e.session.id, e.session);
    const exposures = [...sessionsById.values()].sort((a, b) =>
      (a.completed_at ?? a.started_at).localeCompare(b.completed_at ?? b.started_at),
    );
    if (exposures.length < minExposures) continue;

    const recent = exposures.slice(-minExposures);
    const recentSessionIds = new Set(recent.map((s) => s.id));
    const improvedRecently = personalRecords.some(
      (pr) =>
        pr.exercise_id === exercise.id &&
        (pr.training_location_id ?? null) === locationId &&
        recentSessionIds.has(pr.source_session_id),
    );
    if (improvedRecently) continue;

    const first = recent[0] as WorkoutSession;
    const last = recent[recent.length - 1] as WorkoutSession;
    signals.push({
      exercise_id: exercise.id,
      training_location_id: locationId,
      comparable_exposures: recent.length,
      first_exposure_date: first.completed_at ?? first.started_at,
      last_exposure_date: last.completed_at ?? last.started_at,
      reason_code: 'PROGRESS_STALLED',
    });
  }
  return signals;
}
