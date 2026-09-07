import { getOrCreateDeviceId } from '@atlas/core';
import type { AtlasStorage } from '@atlas/storage';
import { ATLAS_PLAN_FORMAT, type AtlasBackupDocument } from './types';

/** Exports every entity needed to restore ATLAS onto a clean installation.
 *
 * Deliberately excluded, both fully re-derivable and carrying no user state:
 * - Canonical (non-custom) exercises with no user_notes -- recreated by
 *   ensureExercisesSeeded from the bundled seed on first run of a clean
 *   install, using the same fixed IDs baked into that seed file.
 * - Benchmarks -- pure population reference data with no per-user mutable
 *   field at all, recreated by ensureBenchmarksSeeded.
 *
 * Everything else is included in full, including built-in milestones: unlike
 * benchmarks, a built-in milestone's achieved_at/origin_session_id/
 * origin_set_id IS user state a reseed would not restore. */
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
    workoutOccurrences,
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
    storage.workoutOccurrences.getAll(),
  ]);

  return {
    format: ATLAS_PLAN_FORMAT,
    kind: 'backup',
    exported_at: new Date().toISOString(),
    device_id: getOrCreateDeviceId(),
    entities: {
      exercises: exercises.filter((exercise) => exercise.is_custom || exercise.user_notes !== null),
      programs,
      workout_templates: workoutTemplates,
      workout_sessions: workoutSessions,
      exercise_notes: exerciseNotes,
      program_notes: programNotes,
      personal_records: personalRecords,
      milestones,
      body_measurements: bodyMeasurements,
      workout_occurrences: workoutOccurrences,
    },
  };
}
