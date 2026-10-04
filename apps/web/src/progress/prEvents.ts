import {
  derivePREventsForExercise,
  exposureSessions,
  planPREventReconciliation,
  type PREventReconciliation,
} from '@atlas/pr-engine';
import type { Exercise, PersonalRecordEvent, WorkoutSession } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

/**
 * vNext Handoff 04A.1. Persistence of the PR event history. The derivation and
 * the reconciliation policy are pure and live in `pr-engine`
 * (`derivePREventsForExercise`, `planPREventReconciliation`); this file only
 * reads what is stored, asks for the plan, and writes it -- the same layering
 * as `recalculatePRs.ts` next to it.
 */

export interface PREventReconcileResult {
  created: number;
  updated: number;
  removed: number;
  /**
   * Exercises that appear in completed sessions but cannot be found in the
   * exercise library, so their history cannot be replayed. Their stored events
   * are left exactly as they are -- an explicit gap, never invented history.
   */
  skipped: { exercise_id: string; reason: 'EXERCISE_UNRESOLVED' }[];
}

const NOTHING: PREventReconcileResult = { created: 0, updated: 0, removed: 0, skipped: [] };

async function write(storage: AtlasStorage, plan: PREventReconciliation): Promise<void> {
  if (plan.upsert.length > 0) await storage.personalRecordEvents.putMany(plan.upsert);
  await Promise.all(plan.remove.map((id) => storage.personalRecordEvents.softDelete(id)));
}

function counts(plan: PREventReconciliation, stored: PersonalRecordEvent[]): Omit<PREventReconcileResult, 'skipped'> {
  const storedIds = new Set(stored.map((e) => e.id));
  const created = plan.upsert.filter((e) => !storedIds.has(e.id)).length;
  return { created, updated: plan.upsert.length - created, removed: plan.remove.length };
}

/**
 * Brings one exercise's stored events in line with its history -- the event half
 * of `recalculatePRsForExercise`, run from the same post-session path, so a
 * finished workout (live or backdated) updates the ledger exactly when it
 * updates the standing records. Idempotent: running it again changes nothing.
 * `sessions` is passed in by the caller that has already loaded them.
 *
 * ponytail: replays the exercise's whole history (quadratic in that one
 * exercise's session count -- ~75 ms for a lift done 400 times). An event only
 * depends on the sessions before it, so if that ever matters, replay from the
 * finished session onward.
 */
export async function reconcilePREventsForExercise(
  storage: AtlasStorage,
  exercise: Exercise,
  sessions: WorkoutSession[],
): Promise<PREventReconcileResult> {
  const stored = (await storage.personalRecordEvents.getAll()).filter((e) => e.exercise_id === exercise.id);
  const exposures = exposureSessions(sessions);
  const plan = planPREventReconciliation(stored, derivePREventsForExercise(sessions, exercise, exposures), exposures);
  await write(storage, plan);
  return { ...counts(plan, stored), skipped: [] };
}

/** Hands the thread back to the UI, but only once a slice of work has run long enough to be felt (a timer per exercise would just add delay). */
const SLICE_MS = 12;
const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Reconciles EVERY exercise: the historical backfill, and a self-healing pass
 * for anything that changed history outside the finish path (a restored backup,
 * a replaced session). Deterministic and idempotent -- a second run writes
 * nothing -- and it only ever adds, updates or removes according to
 * `planPREventReconciliation`, so events stamped by an older evaluator are
 * never rewritten.
 *
 * Processes completed sessions chronologically per exercise and per equipment
 * context; the first exposure of each context is a baseline and yields no
 * event. An exercise that cannot be resolved is reported in `skipped`, not
 * guessed at. Yields to the UI between exercises so a long history never
 * freezes a screen.
 */
export async function reconcilePREvents(storage: AtlasStorage): Promise<PREventReconcileResult> {
  const [sessions, exercises, stored] = await Promise.all([
    storage.workoutSessions.getAll(),
    storage.exercises.getAll(),
    storage.personalRecordEvents.getAll(),
  ]);
  const exercisesById = new Map(exercises.map((e) => [e.id, e]));
  const exposures = exposureSessions(sessions);
  const storedByExercise = new Map<string, PersonalRecordEvent[]>();
  for (const event of stored) {
    const list = storedByExercise.get(event.exercise_id);
    if (list) list.push(event);
    else storedByExercise.set(event.exercise_id, [event]);
  }

  const result: PREventReconcileResult = { ...NOTHING, skipped: [] };
  const upsert: PersonalRecordEvent[] = [];
  const remove: string[] = [];
  let sliceStart = performance.now();
  // Every exercise with history, plus any exercise that only has stored events (its sessions are gone).
  for (const exerciseId of new Set([...exposures.keys(), ...storedByExercise.keys()])) {
    const exercise = exercisesById.get(exerciseId);
    if (exposures.has(exerciseId) && !exercise) {
      result.skipped.push({ exercise_id: exerciseId, reason: 'EXERCISE_UNRESOLVED' });
      continue;
    }
    const existing = storedByExercise.get(exerciseId) ?? [];
    const derived = exercise ? derivePREventsForExercise(sessions, exercise, exposures) : [];
    const plan = planPREventReconciliation(existing, derived, exposures);
    const c = counts(plan, existing);
    result.created += c.created;
    result.updated += c.updated;
    result.removed += c.removed;
    upsert.push(...plan.upsert);
    remove.push(...plan.remove);
    if (performance.now() - sliceStart > SLICE_MS) {
      await macrotask();
      sliceStart = performance.now();
    }
  }

  await write(storage, { upsert, remove });
  return result;
}

const inFlight = new WeakMap<AtlasStorage, Promise<PREventReconcileResult>>();

/**
 * Runs the full reconcile once per storage instance (per app launch) and lets
 * every screen that reads events wait on the same promise -- the same guard as
 * `ensureBenchmarksSeeded`. The first launch after an upgrade builds the
 * history; every later one finds nothing to change. Pass `force` after
 * something replaced history wholesale (a restored backup).
 *
 * ponytail: costs one replay of all history per launch (~0.7 s for 800
 * sessions on a desktop, far less for ordinary use). If that ever hurts, skip
 * it when a cheap fingerprint of the completed sessions is unchanged.
 */
export function ensurePREventsUpToDate(
  storage: AtlasStorage,
  options: { force?: boolean } = {},
): Promise<PREventReconcileResult> {
  let promise = options.force ? undefined : inFlight.get(storage);
  if (!promise) {
    promise = reconcilePREvents(storage).catch((error: unknown) => {
      inFlight.delete(storage); // a failed run must not block a retry
      throw error;
    });
    inFlight.set(storage, promise);
  }
  return promise;
}

/**
 * Waits for the ledger to be current, then returns it. Every screen that counts
 * PRs reads it through here. The ledger is derived data with a self-healing
 * pass, so a failed reconcile is logged and the stored events are returned as
 * they are -- it must never stop Today or Progress from loading.
 */
export async function loadPREvents(storage: AtlasStorage): Promise<PersonalRecordEvent[]> {
  try {
    await ensurePREventsUpToDate(storage);
  } catch (error) {
    console.error('ATLAS: the PR event history could not be brought up to date; showing it as stored.', error);
  }
  return storage.personalRecordEvents.getAll();
}
