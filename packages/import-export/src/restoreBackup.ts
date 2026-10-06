import type { SyncMeta } from '@atlas/data-model';
import type { AtlasStorage, Repository } from '@atlas/storage';
import { OPTIONAL_BACKUP_STORES, type OptionalBackupKey } from './backupStores';
import type { AtlasBackupDocument } from './types';

export interface RestoreBackupResult {
  restored_counts: Record<keyof AtlasBackupDocument['entities'], number>;
}

/** Writes every entity in a validated backup document into storage via
 * `putMany` (an upsert keyed by id), restoring IDs/timestamps/versions/
 * device_id/deleted_at exactly as exported. Custom exercises are written
 * first so templates/sessions that reference them resolve correctly;
 * canonical exercises and benchmarks are expected to already exist from the
 * normal app-startup seed guards (ensureExercisesSeeded/
 * ensureBenchmarksSeeded), not restored here. This function performs the
 * write unconditionally -- confirming with the user before calling it, if
 * the target database isn't already clean, is the caller's job.
 *
 * vNext Handoff 04B: the optional stores (`backupStores.ts` -- occurrences,
 * PR events, locations, equipment, aliases, test protocols) are each written
 * from their own key, `?? []` when an older backup lacks it. Nothing is
 * cross-checked between stores on the way in: they are independent whole
 * documents (a session's `training_location_id`, an instance's
 * `training_location_id` and so on are plain ids), so write order cannot
 * leave a reference dangling. */
export async function restoreBackup(
  document: AtlasBackupDocument,
  storage: AtlasStorage,
): Promise<RestoreBackupResult> {
  const { entities } = document;
  await storage.exercises.putMany(entities.exercises);
  await storage.workoutTemplates.putMany(entities.workout_templates);

  const optionalKeys = Object.keys(OPTIONAL_BACKUP_STORES) as OptionalBackupKey[];
  await Promise.all([
    storage.programs.putMany(entities.programs),
    storage.workoutSessions.putMany(entities.workout_sessions),
    storage.exerciseNotes.putMany(entities.exercise_notes),
    storage.programNotes.putMany(entities.program_notes),
    storage.personalRecords.putMany(entities.personal_records),
    storage.milestones.putMany(entities.milestones),
    storage.bodyMeasurements.putMany(entities.body_measurements),
    ...optionalKeys.map((key) =>
      (storage[OPTIONAL_BACKUP_STORES[key]] as Repository<SyncMeta>).putMany(
        (entities[key] ?? []) as SyncMeta[],
      ),
    ),
  ]);

  // A place is the default on at most one row. A backup brings its own default, so restoring onto an install
  // that already had one must not leave two: the restored default wins and any other is cleared.
  const restoredDefault = (entities.training_locations ?? []).find(
    (location) => location.is_default && !location.archived_at && location.deleted_at === null,
  );
  if (restoredDefault) {
    const others = (await storage.trainingLocations.getAll()).filter(
      (location) =>
        location.id !== restoredDefault.id && location.is_default && location.deleted_at === null,
    );
    await storage.trainingLocations.putMany(
      others.map((location) => ({
        ...location,
        is_default: false,
        updated_at: new Date().toISOString(),
        version: location.version + 1,
      })),
    );
  }

  // Exactly one program is active -- Today, Program and Progress each read "the" active one. A backup that has an
  // active program makes it the active one on this device, so any other active program is switched off: a restore
  // must never leave two.
  const restoredActive = entities.programs.find(
    (program) => program.is_active && program.deleted_at === null,
  );
  if (restoredActive) {
    const others = (await storage.programs.getAll()).filter(
      (program) => program.id !== restoredActive.id && program.is_active,
    );
    await storage.programs.putMany(
      others.map((program) => ({
        ...program,
        is_active: false,
        updated_at: new Date().toISOString(),
        version: program.version + 1,
      })),
    );
  }

  // Built-in milestones are seeded with a fresh id on every install, so matching by id alone leaves a device that has
  // already seeded its own holding each of them twice (the Milestones catalog listing "185 lb Bench Press" two times).
  // The backup's version wins -- it carries what was achieved, like any other record the restore brings -- and the
  // device's own copy of the same built-in is retired.
  const builtinKey = (m: { title: string; exercise_id: string | null; dimension: string }) =>
    JSON.stringify([m.title, m.exercise_id ?? null, m.dimension]);
  const restoredBuiltins = new Map(
    entities.milestones
      .filter((m) => m.is_builtin && m.deleted_at === null)
      .map((m) => [builtinKey(m), m.id]),
  );
  if (restoredBuiltins.size > 0) {
    const copies = (await storage.milestones.getAll()).filter(
      (m) =>
        m.is_builtin &&
        restoredBuiltins.has(builtinKey(m)) &&
        restoredBuiltins.get(builtinKey(m)) !== m.id,
    );
    for (const copy of copies) await storage.milestones.softDelete(copy.id);
  }

  const optionalCounts = Object.fromEntries(
    optionalKeys.map((key) => [key, (entities[key] ?? []).length]),
  );
  return {
    restored_counts: {
      exercises: entities.exercises.length,
      programs: entities.programs.length,
      workout_templates: entities.workout_templates.length,
      workout_sessions: entities.workout_sessions.length,
      exercise_notes: entities.exercise_notes.length,
      program_notes: entities.program_notes.length,
      personal_records: entities.personal_records.length,
      milestones: entities.milestones.length,
      body_measurements: entities.body_measurements.length,
      ...(optionalCounts as Record<OptionalBackupKey, number>),
    },
  };
}
