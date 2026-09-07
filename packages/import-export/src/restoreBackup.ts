import type { AtlasStorage } from '@atlas/storage';
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
 * the target database isn't already clean, is the caller's job. */
export async function restoreBackup(
  document: AtlasBackupDocument,
  storage: AtlasStorage,
): Promise<RestoreBackupResult> {
  const { entities } = document;
  await storage.exercises.putMany(entities.exercises);
  await storage.workoutTemplates.putMany(entities.workout_templates);
  await Promise.all([
    storage.programs.putMany(entities.programs),
    storage.workoutSessions.putMany(entities.workout_sessions),
    storage.exerciseNotes.putMany(entities.exercise_notes),
    storage.programNotes.putMany(entities.program_notes),
    storage.personalRecords.putMany(entities.personal_records),
    storage.milestones.putMany(entities.milestones),
    storage.bodyMeasurements.putMany(entities.body_measurements),
    storage.workoutOccurrences.putMany(entities.workout_occurrences ?? []),
  ]);

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
      workout_occurrences: (entities.workout_occurrences ?? []).length,
    },
  };
}
