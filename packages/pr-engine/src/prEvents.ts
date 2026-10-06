import { getOrCreateDeviceId, localDateOfInstant } from '@atlas/core';
import type { Exercise, PersonalRecord, PersonalRecordEvent, PrKind, WorkoutSession } from '@atlas/data-model';
import { calculatePRs } from './calculatePRs';
import { performanceContextKey, performanceContextOf } from './context';
import { DEFAULT_E1RM_ESTIMATOR } from './e1rmEstimators';
import { exposureSessions, type ExposureSessions } from './exposure';

/**
 * vNext Handoff 04A.1. How a `PersonalRecordEvent` is recognized. It names the
 * default e1RM estimator on purpose: changing that estimator changes this
 * string, so events written under the old one are recognizably older and are
 * never rewritten or deleted by the change (see `planPREventReconciliation`).
 * Bump the leading number when the derivation below changes meaning.
 *
 * - `pr-events-1` (04A.1): the comparable context is the training location.
 * - `pr-events-2` (04B): the context is the location plus the actual equipment
 *   instance. Nothing about a legacy event changes meaning -- a session with no
 *   recorded equipment derives exactly the event, id and content it did under
 *   version 1 -- so version-1 events stay as written (frozen, per the planner)
 *   and only events derived for new data carry version 2.
 */
export const PR_EVENT_EVALUATOR_VERSION = `pr-events-2/${DEFAULT_E1RM_ESTIMATOR.id}-${DEFAULT_E1RM_ESTIMATOR.version}`;

/**
 * Which detailed record labels an event when it holds several -- `pr_kinds` is
 * kept in this order, so `pr_kinds[0]` is the event's primary kind. Display
 * only; it never changes what counts. Handoff 04A's order mapped onto the
 * repository's kinds: MAX_LOAD = `max_load` (and its bodyweight analogue
 * `weighted_bodyweight`), REP_AT_LOAD = `rep_at_load`, E1RM = `estimated_1rm`,
 * MAX_REPS = `rep` / `bodyweight`, DURATION / DISTANCE = `timed` / `distance`,
 * then the remaining kinds.
 */
export const HEADLINE_PRIMARY_KIND_ORDER: readonly PrKind[] = [
  'max_load',
  'weighted_bodyweight',
  'rep_at_load',
  'estimated_1rm',
  'rep',
  'bodyweight',
  'timed',
  'distance',
  'rep_range',
  'volume',
];

function kindRank(kind: PrKind): number {
  const rank = HEADLINE_PRIMARY_KIND_ORDER.indexOf(kind);
  return rank === -1 ? HEADLINE_PRIMARY_KIND_ORDER.length : rank;
}

/**
 * The stable identity of an event: one per session + exercise + equipment
 * context. Writing it twice is an upsert, so re-processing a session can
 * never duplicate an event. Without an equipment instance the id is exactly
 * what it was before Handoff 04B, so every existing event keeps its id.
 */
export function personalRecordEventId(
  sessionId: string,
  exerciseId: string,
  trainingLocationId: string | null | undefined,
  gymEquipmentId?: string | null,
): string {
  const base = `pr-event:${sessionId}:${exerciseId}:${trainingLocationId ?? 'none'}`;
  return gymEquipmentId ? `${base}:${gymEquipmentId}` : base;
}

/**
 * Which record a row is a version of: one slot per kind, except `rep_range`
 * (one per exact rep count) and `rep_at_load` (one per exact load). The same
 * slot in two consecutive replays is the same record, beaten; a slot that only
 * exists in the later replay is a record set for the first time.
 */
function recordSlot(record: PersonalRecord): string {
  if (record.kind === 'rep_range') return `rep_range:${record.reps}`;
  if (record.kind === 'rep_at_load') return `rep_at_load:${record.load}`;
  return record.kind;
}

/** An event as derived from history, before it is stamped with sync metadata. */
export interface DerivedPREvent {
  session_id: string;
  exercise_id: string;
  training_location_id: string | null;
  gym_equipment_id: string | null;
  achieved_at: string;
  pr_kinds: PrKind[];
  estimator_id: string | null;
  estimator_version: string | null;
}

/**
 * Derives an exercise's full event history by replaying it chronologically.
 *
 * For each equipment context, the first session is the baseline. For every
 * later session, `calculatePRs` is run over the history up to and including
 * it; the records it attributes to that session are the ones it just set --
 * `calculatePRs` breaks ties toward the earliest session, so only a strictly
 * better performance moves a record to a later one. An event needs more than a
 * record existing, though: the session must have BEATEN one an earlier session
 * already held (the same record slot in the previous replay). A record set for
 * the first time -- a rep count or load never used before -- establishes a row
 * but improves on nothing, exactly as a first-ever performance does. That
 * before/after comparison of `calculatePRs`' own output is the ONLY definition
 * of improvement here; nothing below compares one set to another. A session
 * that beat at least one record is one event, however many it beat, and
 * `pr_kinds` lists the kinds it beat.
 *
 * An event depends only on the sessions up to it, so a later, better session
 * never changes an earlier event. Contexts -- the training location plus the
 * actual equipment instance (Handoff 04B), null for all legacy history that
 * recorded neither -- are replayed independently, exactly as `calculatePRs`
 * scopes its series: Chest Press #1 never competes with Chest Press #2, and
 * a machine at one gym never competes with the same make at another.
 *
 * Cost is quadratic in one exercise's session count (each replay step
 * recomputes its records); a lift done 500 times replays in well under a
 * second.
 */
export function derivePREventsForExercise(
  sessions: WorkoutSession[],
  exercise: Exercise,
  exposures: ExposureSessions = exposureSessions(sessions),
): DerivedPREvent[] {
  const contexts = exposures.get(exercise.id);
  if (!contexts) return [];

  const events: DerivedPREvent[] = [];
  for (const history of contexts.values()) {
    const first = history[0];
    if (!first) continue;
    // Every session in a group shares its context, so the first one names it.
    const context = performanceContextOf(first, exercise.id);
    // Only this exercise's sets matter to its own records; dropping the rest keeps every replay step cheap.
    const own = history.map((s) => ({
      ...s,
      performed_sets: s.performed_sets.filter((set) => set.exercise_id === exercise.id),
    }));
    let existing = new Set(calculatePRs(own.slice(0, 1), exercise).map(recordSlot));
    for (let i = 1; i < own.length; i += 1) {
      const session = own[i];
      if (!session) continue;
      const records = calculatePRs(own.slice(0, i + 1), exercise);
      const held = records.filter((r) => r.source_session_id === session.id && existing.has(recordSlot(r)));
      existing = new Set(records.map(recordSlot));
      if (held.length === 0) continue;
      const e1rm = held.find((r) => r.kind === 'estimated_1rm');
      events.push({
        session_id: session.id,
        exercise_id: exercise.id,
        training_location_id: context.training_location_id,
        gym_equipment_id: context.gym_equipment_id,
        achieved_at: held.reduce((first, r) => (r.achieved_at < first ? r.achieved_at : first), held[0]?.achieved_at ?? ''),
        pr_kinds: [...new Set(held.map((r) => r.kind))].sort((a, b) => kindRank(a) - kindRank(b)),
        estimator_id: e1rm?.estimator_id ?? null,
        estimator_version: e1rm?.estimator_version ?? null,
      });
    }
  }
  return events.sort(
    (a, b) => a.achieved_at.localeCompare(b.achieved_at) || a.session_id.localeCompare(b.session_id),
  );
}

export interface PREventReconciliation {
  /** New events, and current-version events whose content changed, ready to write. */
  upsert: PersonalRecordEvent[];
  /** Ids of stored events to soft-delete. */
  remove: string[];
}

function sameContent(stored: PersonalRecordEvent, derived: DerivedPREvent): boolean {
  return (
    stored.achieved_at === derived.achieved_at &&
    stored.pr_kinds.length === derived.pr_kinds.length &&
    stored.pr_kinds.every((kind, i) => kind === derived.pr_kinds[i]) &&
    (stored.estimator_id ?? null) === derived.estimator_id &&
    (stored.estimator_version ?? null) === derived.estimator_version
  );
}

/**
 * Decides what to write so the stored events for one exercise match its
 * history. Deterministic and idempotent: planning again after applying the
 * result yields nothing to do.
 *
 * - A derived event with no stored counterpart is added, stamped with the
 *   current `PR_EVENT_EVALUATOR_VERSION`.
 * - A stored event stamped with the CURRENT version follows history: it is
 *   updated if its content changed and removed if history no longer supports it
 *   (a corrected or replaced session).
 * - A stored event stamped with an OLDER version is history, not a cache: it is
 *   never rewritten because the evaluator or estimator changed, and is removed
 *   only when its source performance no longer exists at all (the session was
 *   discarded, or has no eligible sets of that exercise any more).
 *
 * `stored` is one exercise's non-deleted events; `exposures` is the shared
 * first-exposure index over the same sessions.
 */
export function planPREventReconciliation(
  stored: PersonalRecordEvent[],
  derived: DerivedPREvent[],
  exposures: ExposureSessions,
): PREventReconciliation {
  const derivedById = new Map(
    derived.map((d) => [
      personalRecordEventId(d.session_id, d.exercise_id, d.training_location_id, d.gym_equipment_id),
      d,
    ]),
  );
  const storedById = new Map(stored.map((e) => [e.id, e]));
  const upsert: PersonalRecordEvent[] = [];
  const remove: string[] = [];
  const now = new Date().toISOString();

  for (const [id, d] of derivedById) {
    const existing = storedById.get(id);
    if (!existing) {
      upsert.push({
        id,
        created_at: now,
        updated_at: now,
        version: 1,
        device_id: getOrCreateDeviceId(),
        deleted_at: null,
        session_id: d.session_id,
        exercise_id: d.exercise_id,
        training_location_id: d.training_location_id,
        gym_equipment_id: d.gym_equipment_id,
        achieved_at: d.achieved_at,
        pr_kinds: d.pr_kinds,
        evaluator_version: PR_EVENT_EVALUATOR_VERSION,
        estimator_id: d.estimator_id,
        estimator_version: d.estimator_version,
      });
    } else if (existing.evaluator_version === PR_EVENT_EVALUATOR_VERSION && !sameContent(existing, d)) {
      upsert.push({
        ...existing,
        achieved_at: d.achieved_at,
        pr_kinds: d.pr_kinds,
        estimator_id: d.estimator_id,
        estimator_version: d.estimator_version,
        updated_at: now,
        version: existing.version + 1,
      });
    }
  }

  for (const existing of stored) {
    if (derivedById.has(existing.id)) continue;
    const sourceStillExists = exposures
      .get(existing.exercise_id)
      ?.get(performanceContextKey(existing))
      ?.some((s) => s.id === existing.session_id);
    if (existing.evaluator_version === PR_EVENT_EVALUATOR_VERSION || !sourceStillExists) remove.push(existing.id);
  }

  return { upsert, remove };
}

/**
 * The events whose day falls in the inclusive `YYYY-MM-DD` range -- "PRs this
 * week" is this list's length.
 *
 * `dayOf` says which calendar day an event belongs to. Callers that hold the
 * sessions pass the event's SESSION day (`sessionLocalDate`), so the PR count
 * and the session count of one week always bucket by the same day (Handoff
 * 04B). The default -- the viewer-local day of `achieved_at`, never the UTC
 * date -- is the fallback for a caller with no sessions to hand.
 */
export function prEventsInPeriod<T extends { achieved_at: string }>(
  events: T[],
  periodStart: string,
  periodEnd: string,
  dayOf: (event: T) => string = (event) => localDateOfInstant(event.achieved_at),
): T[] {
  return events.filter((event) => {
    const day = dayOf(event);
    return day >= periodStart && day <= periodEnd;
  });
}
