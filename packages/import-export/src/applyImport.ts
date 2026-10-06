import type {
  Exercise,
  ExerciseGroup,
  PlannedExercise,
  Program,
  WorkoutTemplate,
} from '@atlas/data-model';
import { newId } from '@atlas/core';
import { createCustomExercise } from '@atlas/exercise-library';
import { createProgram, createProgramDay, createProgramWeek } from '@atlas/program-engine';
import type { AtlasStorage } from '@atlas/storage';
import {
  createPlannedExercise,
  createWorkoutTemplate,
  mergeRepeatedExercises,
} from '@atlas/workout-engine';
import type {
  ImportPreviewExercise,
  ImportPreviewWorkout,
  ImportPreview,
  ImportResolutions,
} from './types';

export interface ApplyImportResult {
  created_exercises: Exercise[];
  workout_template: WorkoutTemplate | null;
  program: Program | null;
}

/**
 * Re-importing the same source (the owner re-uploading the same HTML,
 * accidentally applying an already-applied plan file) must not silently
 * duplicate a Program/WorkoutTemplate -- see docs/IMPORT_FORMAT.md "Import
 * idempotency." Checked by the caller BEFORE calling `applyImport` (which
 * always creates fresh rows unconditionally -- it has no opinion on
 * whether this is a duplicate, only on writing what it's told to), so the
 * preview step can warn the owner and let them choose, matching "preview
 * the result before applying."
 */
export function findExistingImportByFingerprint(
  fingerprint: string,
  programs: Program[],
  templates: WorkoutTemplate[],
): Program | WorkoutTemplate | null {
  return (
    programs.find((p) => p.import_fingerprint === fingerprint && !p.deleted_at) ??
    templates.find((t) => t.import_fingerprint === fingerprint && !t.deleted_at) ??
    null
  );
}

function resolveExerciseId(
  entry: ImportPreviewExercise,
  resolutions: ImportResolutions,
  createdExercises: Exercise[],
): string | null {
  if (entry.match.confidence !== 'unresolved' && entry.match.matched_exercise) {
    return entry.match.matched_exercise.id;
  }
  const resolution = resolutions[entry.key];
  if (!resolution || resolution.action === 'skip') return null;
  if (resolution.action === 'use_match') return resolution.exercise_id;
  const created = createCustomExercise({
    name: entry.planned.exercise_name,
    category: null,
    equipment: [],
    targetMuscle: null,
    secondaryMuscles: [],
    instructions: [],
    measurementType: entry.planned.target_duration_seconds !== null ? 'time' : 'reps_weight',
  });
  createdExercises.push(created);
  return created.id;
}

function buildTemplate(
  preview: ImportPreviewWorkout,
  resolutions: ImportResolutions,
  createdExercises: Exercise[],
  isQuickWorkout: boolean,
): WorkoutTemplate {
  const template = createWorkoutTemplate(preview.name, isQuickWorkout);
  // A real id per source group key, assigned now rather than at parse time --
  // only once matching/resolution has run do we know which members actually
  // survive (a skipped/unresolved exercise is dropped below, same as ever).
  const groupIdByKey = new Map((preview.groups ?? []).map((g) => [g.key, newId()]));
  const exercises: PlannedExercise[] = [];
  let order = 1;
  for (const entry of preview.exercises) {
    const exerciseId = resolveExerciseId(entry, resolutions, createdExercises);
    if (!exerciseId) continue; // skipped, intentionally dropped rather than blocking the import
    const planned = createPlannedExercise(exerciseId, order);
    order += 1;
    const groupKey = entry.planned.group_key;
    exercises.push({
      ...planned,
      target_sets: entry.planned.target_sets,
      target_reps_min: entry.planned.target_reps_min,
      target_reps_max: entry.planned.target_reps_max,
      target_weight: entry.planned.target_weight,
      target_external_load: entry.planned.target_external_load ?? null,
      target_rpe: entry.planned.target_rpe,
      target_rir: entry.planned.target_rir,
      target_duration_seconds: entry.planned.target_duration_seconds,
      target_distance_meters: entry.planned.target_distance_meters,
      rest_seconds: entry.planned.rest_seconds,
      notes: entry.planned.notes,
      group_id: (groupKey && groupIdByKey.get(groupKey)) || null,
      progression_policy: entry.planned.progression_policy ?? null,
    });
  }

  // A group that lost members to skip/unresolved down to a single survivor
  // isn't a group any more (ATLAS's own authoring UI dissolves these the
  // same way -- see TemplateEditor's pruneEmptyGroups) -- ungroup that lone
  // exercise rather than shipping a one-member "superset."
  const memberCounts = new Map<string, number>();
  for (const ex of exercises) {
    if (ex.group_id) memberCounts.set(ex.group_id, (memberCounts.get(ex.group_id) ?? 0) + 1);
  }
  const groups: ExerciseGroup[] = [];
  for (const planGroup of preview.groups ?? []) {
    const groupId = groupIdByKey.get(planGroup.key);
    if (!groupId || (memberCounts.get(groupId) ?? 0) < 2) continue;
    groups.push({
      id: groupId,
      type: planGroup.type,
      rounds: planGroup.rounds,
      rest_after_seconds: planGroup.rest_after_seconds,
    });
  }
  const groupIds = new Set(groups.map((g) => g.id));
  for (const ex of exercises) {
    if (ex.group_id && !groupIds.has(ex.group_id)) ex.group_id = null;
  }

  // A workout holds one entry per exercise (see `mergeRepeatedExercises`): a repeat -- by name, or two names that
  // resolve to the same library exercise -- is folded into the first, keeping the volume.
  const unique = mergeRepeatedExercises(exercises, groups);
  return { ...template, exercises: unique.planned, groups: unique.groups };
}

/** Writes an approved (and possibly resolution-edited) preview to storage.
 * Nothing here runs until the user has explicitly approved the preview --
 * see docs/IMPORT_FORMAT.md's pipeline. Persists directly (storage-accepting
 * package function, same pattern as ensureExercisesSeeded/setActiveProgram)
 * so a resolved "create custom exercise" exists before the template that
 * references it is written. */
export async function applyImport(
  preview: ImportPreview,
  resolutions: ImportResolutions,
  storage: AtlasStorage,
  importFingerprint: string | null = null,
): Promise<ApplyImportResult> {
  const createdExercises: Exercise[] = [];

  if (preview.kind === 'workout') {
    // A standalone workout import has no Program to attach to -- without
    // is_quick_workout: true it would be an orphan template unreachable from
    // any screen (see docs/DATA_MODEL.md on how a template becomes visible).
    // Confirmed by manual testing, not assumed.
    const template = {
      ...buildTemplate(preview.workout, resolutions, createdExercises, true),
      import_fingerprint: importFingerprint,
    };
    for (const exercise of createdExercises) await storage.exercises.put(exercise);
    await storage.workoutTemplates.put(template);
    return { created_exercises: createdExercises, workout_template: template, program: null };
  }

  const program = createProgram(preview.program.name, preview.program.description);
  const weeks = [];
  for (const [weekIndex, week] of preview.program.weeks.entries()) {
    const programWeek = createProgramWeek(weekIndex + 1, week.label);
    const days = [];
    for (const [dayIndex, day] of week.days.entries()) {
      // Each day's template is reached through its ProgramDay, so it must
      // NOT also show up in the Quick Workout library.
      const template = buildTemplate(day.workout, resolutions, createdExercises, false);
      await storage.workoutTemplates.put(template);
      days.push(createProgramDay(dayIndex + 1, day.label, template.id));
    }
    weeks.push({ ...programWeek, days });
  }
  const finalProgram: Program = { ...program, weeks, import_fingerprint: importFingerprint };
  for (const exercise of createdExercises) await storage.exercises.put(exercise);
  await storage.programs.put(finalProgram);

  return { created_exercises: createdExercises, workout_template: null, program: finalProgram };
}
