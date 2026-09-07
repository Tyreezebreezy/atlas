import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { WorkoutOccurrence } from '@atlas/data-model';

/**
 * The already-recorded occurrence for this program day's ORIGINAL planned
 * date, if any -- most days never have one (see `WorkoutOccurrence`'s doc
 * comment); only a day the owner has actually moved, skipped, replaced, or
 * completed gets a row. Callers must look this up before calling any
 * action below and pass the result in, so a slot is never accidentally
 * given two occurrence rows for the same original date.
 */
export function findOccurrence(
  occurrences: WorkoutOccurrence[],
  programDayId: string,
  originalDate: string,
): WorkoutOccurrence | null {
  return (
    occurrences.find(
      (o) => o.program_day_id === programDayId && o.original_date === originalDate && !o.deleted_at,
    ) ?? null
  );
}

/** Any occurrence whose EFFECTIVE date is `date` -- what a schedule view
 * should show for `date` once occurrences are taken into account,
 * including one moved IN from a different original date. */
export function findOccurrenceByEffectiveDate(
  occurrences: WorkoutOccurrence[],
  date: string,
): WorkoutOccurrence | null {
  return occurrences.find((o) => o.effective_date === date && !o.deleted_at) ?? null;
}

function ensureOccurrence(
  existing: WorkoutOccurrence | null,
  programId: string,
  programDayId: string,
  originalDate: string,
): WorkoutOccurrence {
  if (existing) return existing;
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: getOrCreateDeviceId(),
    deleted_at: null,
    program_id: programId,
    program_day_id: programDayId,
    original_date: originalDate,
    effective_date: originalDate,
    status: 'planned',
    replacement_template_id: null,
    session_id: null,
    notes: null,
  };
}

function touch(occurrence: WorkoutOccurrence): Pick<WorkoutOccurrence, 'updated_at' | 'version'> {
  return { updated_at: new Date().toISOString(), version: occurrence.version + 1 };
}

/**
 * Moves a planned workout to a different calendar date without touching
 * the Program template at all -- `original_date` (never changed) and
 * `effective_date` (where it actually is now) together preserve full
 * history even after the move.
 */
export function moveOccurrence(
  existing: WorkoutOccurrence | null,
  programId: string,
  programDayId: string,
  originalDate: string,
  newDate: string,
): WorkoutOccurrence {
  const base = ensureOccurrence(existing, programId, programDayId, originalDate);
  return { ...base, status: 'moved', effective_date: newDate, ...touch(base) };
}

/** Explicitly skips a planned occurrence -- stored, not deleted, so it
 * remains visible historically (see WorkoutOccurrence's doc comment). */
export function skipOccurrence(
  existing: WorkoutOccurrence | null,
  programId: string,
  programDayId: string,
  originalDate: string,
  notes: string | null = null,
): WorkoutOccurrence {
  const base = ensureOccurrence(existing, programId, programDayId, originalDate);
  return { ...base, status: 'skipped', notes: notes ?? base.notes, ...touch(base) };
}

/** Swaps in a different Workout/Quick Workout for this one slot without
 * mutating the Program template -- `replacement_template_id` records which
 * template was actually used; it survives a later `completeOccurrence`
 * call (the spread below keeps whatever this function already set). */
export function replaceOccurrence(
  existing: WorkoutOccurrence | null,
  programId: string,
  programDayId: string,
  originalDate: string,
  replacementTemplateId: string,
): WorkoutOccurrence {
  const base = ensureOccurrence(existing, programId, programDayId, originalDate);
  return {
    ...base,
    status: 'replaced',
    replacement_template_id: replacementTemplateId,
    ...touch(base),
  };
}

/** Links a completed occurrence to its WorkoutSession -- the session
 * remains the immutable performed record; this is only the pointer to it.
 * Preserves `replacement_template_id` if this occurrence was replaced, and
 * `effective_date` if it was moved, so a completed occurrence's full
 * history (moved and/or replaced, then completed) is never lost. */
export function completeOccurrence(
  existing: WorkoutOccurrence | null,
  programId: string,
  programDayId: string,
  originalDate: string,
  sessionId: string,
): WorkoutOccurrence {
  const base = ensureOccurrence(existing, programId, programDayId, originalDate);
  return { ...base, status: 'completed', session_id: sessionId, ...touch(base) };
}
