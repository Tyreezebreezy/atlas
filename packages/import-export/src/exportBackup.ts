import { getOrCreateDeviceId } from '@atlas/core';
import type { SyncMeta } from '@atlas/data-model';
import type { AtlasStorage, Repository } from '@atlas/storage';
import { OPTIONAL_BACKUP_STORES, type OptionalBackupKey } from './backupStores';
import { ATLAS_PLAN_FORMAT, type AtlasBackupDocument } from './types';

/** Exports every entity needed to restore ATLAS onto a clean installation.
 *
 * Deliberately excluded, both fully re-derivable and carrying no user state:
 * - Canonical exercises the owner never touched (not custom, no user_notes, not
 *   a favorite) -- recreated by ensureExercisesSeeded from the bundled seed on
 *   first run of a clean install, using the same fixed IDs baked into that seed
 *   file. A FAVORITE is user state a reseed would not bring back (it is a flag
 *   on the exercise's own row), so a favorited canonical exercise rides along.
 * - Benchmarks -- pure population reference data with no per-user mutable
 *   field at all, recreated by ensureBenchmarksSeeded.
 *
 * Everything else is included in full, including built-in milestones: unlike
 * benchmarks, a built-in milestone's achieved_at/origin_session_id/
 * origin_set_id IS user state a reseed would not restore.
 *
 * vNext Handoff 04B: which stores are covered is `backupStores.ts` -- training
 * locations (with their default and archived state), equipment definitions,
 * the equipment configured at each location, remembered exercise-to-machine
 * mappings, exercise aliases and test protocols now ride along with the rest,
 * so nothing the owner configures about their gyms is lost to a restore. Like
 * every store, rows come from `getAll()`, which omits soft-deleted tombstones;
 * an ARCHIVED location or machine is an ordinary live row and is kept. */
export async function exportBackup(storage: AtlasStorage): Promise<AtlasBackupDocument> {
  const [
    exercises,
    programs,
    workoutTemplates,
    workoutSessions,
    exerciseNotes,
    programNotes,
    personalRecords,
    milestones,
    bodyMeasurements,
  ] = await Promise.all([
    storage.exercises.getAll(),
    storage.programs.getAll(),
    storage.workoutTemplates.getAll(),
    storage.workoutSessions.getAll(),
    storage.exerciseNotes.getAll(),
    storage.programNotes.getAll(),
    storage.personalRecords.getAll(),
    storage.milestones.getAll(),
    storage.bodyMeasurements.getAll(),
  ]);

  const optional = await Promise.all(
    (Object.entries(OPTIONAL_BACKUP_STORES) as [OptionalBackupKey, keyof AtlasStorage][]).map(
      async ([key, store]) =>
        [key, await (storage[store] as Repository<SyncMeta>).getAll()] as const,
    ),
  );

  return {
    format: ATLAS_PLAN_FORMAT,
    kind: 'backup',
    exported_at: new Date().toISOString(),
    device_id: getOrCreateDeviceId(),
    entities: {
      exercises: exercises.filter(
        (exercise) =>
          exercise.is_custom || exercise.user_notes !== null || exercise.is_favorite === true,
      ),
      programs,
      workout_templates: workoutTemplates,
      workout_sessions: workoutSessions,
      exercise_notes: exerciseNotes,
      program_notes: programNotes,
      personal_records: personalRecords,
      milestones,
      body_measurements: bodyMeasurements,
      ...(Object.fromEntries(optional) as Pick<AtlasBackupDocument['entities'], OptionalBackupKey>),
    },
  };
}
