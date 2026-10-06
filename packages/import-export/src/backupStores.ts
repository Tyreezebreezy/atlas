import type { AtlasStorage } from '@atlas/storage';

/**
 * vNext Handoff 04B. The single answer to "which durable stores does a backup
 * carry?". Export, restore, validation and the parity test all read these
 * tables, so they cannot drift apart -- and a test walks every repository the
 * storage adapter has and fails unless each one is listed here or in
 * `STORES_NOT_IN_BACKUP`. Adding a store without deciding about its backup is
 * therefore a failing test, not a silent gap discovered after a restore.
 *
 * Device-local settings (timer preferences, onboarding flags in localStorage)
 * are not an `AtlasStorage` repository and are not backed up: they describe
 * this device, not the owner's data. Nothing the owner configures about their
 * gyms lives there any more -- the default location is a flag on the
 * `TrainingLocation` entity, so it is in the backup.
 */

/** Stores that every backup carries (an older file lacking one is not a valid backup). Keys are the backup document's `entities` keys. */
export const REQUIRED_BACKUP_STORES = {
  exercises: 'exercises',
  programs: 'programs',
  workout_templates: 'workoutTemplates',
  workout_sessions: 'workoutSessions',
  exercise_notes: 'exerciseNotes',
  program_notes: 'programNotes',
  personal_records: 'personalRecords',
  milestones: 'milestones',
  body_measurements: 'bodyMeasurements',
} as const satisfies Record<string, keyof AtlasStorage>;

/** Stores added to backups after the first format: optional in the document, so an older backup still validates and restores. */
export const OPTIONAL_BACKUP_STORES = {
  workout_occurrences: 'workoutOccurrences',
  personal_record_events: 'personalRecordEvents',
  training_locations: 'trainingLocations',
  equipment_definitions: 'equipmentDefinitions',
  gym_equipment: 'gymEquipment',
  exercise_equipment_contexts: 'exerciseEquipmentContext',
  exercise_aliases: 'exerciseAliases',
  test_protocols: 'testProtocols',
} as const satisfies Record<string, keyof AtlasStorage>;

/**
 * Repositories deliberately left out of a backup, with the reason. Benchmarks
 * are pure reference data with no per-user field; `ensureBenchmarksSeeded`
 * recreates them from the bundled dataset under the same ids on any install.
 */
export const STORES_NOT_IN_BACKUP = [
  'benchmarks',
] as const satisfies readonly (keyof AtlasStorage)[];

export type RequiredBackupKey = keyof typeof REQUIRED_BACKUP_STORES;
export type OptionalBackupKey = keyof typeof OPTIONAL_BACKUP_STORES;
