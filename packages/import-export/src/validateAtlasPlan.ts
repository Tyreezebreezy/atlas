import { OPTIONAL_BACKUP_STORES, type OptionalBackupKey } from './backupStores';
import {
  ATLAS_PLAN_FORMAT,
  type AtlasBackupDocument,
  type AtlasPlanDocument,
  type PlanExerciseTarget,
  type PlanProgram,
  type PlanWorkout,
  type ValidationIssue,
  type ValidationResult,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNonNegativeOrNull(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

class Issues {
  list: ValidationIssue[] = [];
  add(path: string, message: string): void {
    this.list.push({ path, message });
  }
}

function validateExerciseTarget(
  value: unknown,
  path: string,
  issues: Issues,
): PlanExerciseTarget | null {
  if (!isRecord(value)) {
    issues.add(path, 'must be an object');
    return null;
  }
  let ok = true;
  if (typeof value.order !== 'number' || !Number.isFinite(value.order)) {
    issues.add(`${path}.order`, 'must be a finite number');
    ok = false;
  }
  if (!(value.exercise_id === null || typeof value.exercise_id === 'string')) {
    issues.add(`${path}.exercise_id`, 'must be a string or null');
    ok = false;
  }
  if (!isNonEmptyString(value.exercise_name)) {
    issues.add(`${path}.exercise_name`, 'must be a non-empty string');
    ok = false;
  }
  const numericFields = [
    'target_sets',
    'target_reps_min',
    'target_reps_max',
    'target_weight',
    'target_rpe',
    'target_rir',
    'target_duration_seconds',
    'target_distance_meters',
    'rest_seconds',
  ] as const;
  for (const field of numericFields) {
    if (!isFiniteNonNegativeOrNull(value[field])) {
      issues.add(`${path}.${field}`, 'must be a non-negative finite number or null');
      ok = false;
    }
  }
  if (!isStringOrNull(value.notes)) {
    issues.add(`${path}.notes`, 'must be a string or null');
    ok = false;
  }
  if (!ok) return null;
  return {
    order: value.order as number,
    exercise_id: (value.exercise_id ?? null) as string | null,
    exercise_name: (value.exercise_name as string).trim(),
    target_sets: value.target_sets as number | null,
    target_reps_min: value.target_reps_min as number | null,
    target_reps_max: value.target_reps_max as number | null,
    target_weight: value.target_weight as number | null,
    target_rpe: value.target_rpe as number | null,
    target_rir: value.target_rir as number | null,
    target_duration_seconds: value.target_duration_seconds as number | null,
    target_distance_meters: value.target_distance_meters as number | null,
    rest_seconds: value.rest_seconds as number | null,
    notes: (value.notes ?? null) as string | null,
  };
}

function validateWorkout(value: unknown, path: string, issues: Issues): PlanWorkout | null {
  if (!isRecord(value)) {
    issues.add(path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isNonEmptyString(value.name)) {
    issues.add(`${path}.name`, 'must be a non-empty string');
    ok = false;
  }
  if (typeof value.is_quick_workout !== 'boolean') {
    issues.add(`${path}.is_quick_workout`, 'must be a boolean');
    ok = false;
  }
  if (!Array.isArray(value.exercises)) {
    issues.add(`${path}.exercises`, 'must be an array');
    return null;
  }
  const exercises: PlanExerciseTarget[] = [];
  value.exercises.forEach((raw, index) => {
    const exercise = validateExerciseTarget(raw, `${path}.exercises[${index}]`, issues);
    if (exercise) exercises.push(exercise);
    else ok = false;
  });
  if (!ok) return null;
  return {
    name: (value.name as string).trim(),
    is_quick_workout: value.is_quick_workout as boolean,
    exercises,
  };
}

function validateProgram(value: unknown, path: string, issues: Issues): PlanProgram | null {
  if (!isRecord(value)) {
    issues.add(path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isNonEmptyString(value.name)) {
    issues.add(`${path}.name`, 'must be a non-empty string');
    ok = false;
  }
  if (!isStringOrNull(value.description)) {
    issues.add(`${path}.description`, 'must be a string or null');
    ok = false;
  }
  if (!Array.isArray(value.weeks)) {
    issues.add(`${path}.weeks`, 'must be an array');
    return null;
  }
  const weeks: PlanProgram['weeks'] = [];
  value.weeks.forEach((rawWeek, weekIndex) => {
    const weekPath = `${path}.weeks[${weekIndex}]`;
    if (!isRecord(rawWeek)) {
      issues.add(weekPath, 'must be an object');
      ok = false;
      return;
    }
    if (!isStringOrNull(rawWeek.label)) {
      issues.add(`${weekPath}.label`, 'must be a string or null');
      ok = false;
    }
    if (!Array.isArray(rawWeek.days)) {
      issues.add(`${weekPath}.days`, 'must be an array');
      ok = false;
      return;
    }
    const days: PlanProgram['weeks'][number]['days'] = [];
    rawWeek.days.forEach((rawDay, dayIndex) => {
      const dayPath = `${weekPath}.days[${dayIndex}]`;
      if (!isRecord(rawDay)) {
        issues.add(dayPath, 'must be an object');
        ok = false;
        return;
      }
      if (!isNonEmptyString(rawDay.label)) {
        issues.add(`${dayPath}.label`, 'must be a non-empty string');
        ok = false;
      }
      const workout = validateWorkout(rawDay.workout, `${dayPath}.workout`, issues);
      if (!workout) {
        ok = false;
        return;
      }
      days.push({ label: (rawDay.label as string).trim(), workout });
    });
    weeks.push({ label: (rawWeek.label ?? null) as string | null, days });
  });
  if (!ok) return null;
  return {
    name: (value.name as string).trim(),
    description: (value.description ?? null) as string | null,
    weeks,
  };
}

function hasSyncMetaShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.version === 'number' &&
    typeof value.device_id === 'string' &&
    (value.deleted_at === null || typeof value.deleted_at === 'string')
  );
}

function validateEntityArray(value: unknown, path: string, issues: Issues): unknown[] | null {
  if (!Array.isArray(value)) {
    issues.add(path, 'must be an array');
    return null;
  }
  let ok = true;
  value.forEach((item, index) => {
    if (!hasSyncMetaShape(item)) {
      issues.add(
        `${path}[${index}]`,
        'must have id/created_at/updated_at/version/device_id/deleted_at',
      );
      ok = false;
    }
  });
  return ok ? value : null;
}

function validateBackup(
  value: unknown,
  path: string,
  issues: Issues,
): { device_id: string; entities: AtlasBackupDocument['entities'] } | null {
  if (!isRecord(value)) {
    issues.add(path, 'must be an object');
    return null;
  }
  if (!isNonEmptyString(value.device_id)) {
    issues.add(`${path}.device_id`, 'must be a non-empty string');
    return null;
  }
  if (!isRecord(value.entities)) {
    issues.add(`${path}.entities`, 'must be an object');
    return null;
  }
  const keys = [
    'exercises',
    'programs',
    'workout_templates',
    'workout_sessions',
    'exercise_notes',
    'program_notes',
    'personal_records',
    'milestones',
    'body_measurements',
  ] as const;
  const entities: Partial<Record<(typeof keys)[number], unknown[]>> = {};
  let ok = true;
  for (const key of keys) {
    const validated = validateEntityArray(value.entities[key], `${path}.entities.${key}`, issues);
    if (validated === null) ok = false;
    else entities[key] = validated;
  }
  if (!ok) return null;

  // Optional, unlike every key above (`OPTIONAL_BACKUP_STORES`): absent
  // entirely on a backup exported before that store was part of backups (v0.2.0
  // occurrences, 04A.1 PR events, 04B locations/equipment/aliases/protocols),
  // which must still validate and restore cleanly (see restoreBackup.ts's own
  // `?? []`) -- never rejected just for missing a key that didn't exist yet.
  // When a key IS present it is validated like any other entity array.
  const optional: Partial<Record<OptionalBackupKey, unknown[]>> = {};
  for (const key of Object.keys(OPTIONAL_BACKUP_STORES) as OptionalBackupKey[]) {
    optional[key] = [];
    if (value.entities[key] === undefined) continue;
    const validated = validateEntityArray(value.entities[key], `${path}.entities.${key}`, issues);
    if (validated === null) return null;
    optional[key] = validated;
  }

  return {
    device_id: value.device_id,
    entities: { ...entities, ...optional } as AtlasBackupDocument['entities'],
  };
}

/** Strictly validates an unknown parsed-JSON value against the atlas-plan-v1
 * envelope. Never coerces or guesses at a wrong/missing format -- an
 * unsupported or absent `format` is always rejected, per
 * docs/IMPORT_FORMAT.md's "reject unsupported structured versions cleanly." */
export function validateAtlasPlan(input: unknown): ValidationResult<AtlasPlanDocument> {
  const issues = new Issues();
  if (!isRecord(input)) {
    return { valid: false, issues: [{ path: '$', message: 'top-level value must be an object' }] };
  }
  if (input.format !== ATLAS_PLAN_FORMAT) {
    return {
      valid: false,
      issues: [
        {
          path: '$.format',
          message: `expected "${ATLAS_PLAN_FORMAT}", got ${JSON.stringify(input.format ?? null)}`,
        },
      ],
    };
  }
  if (!isNonEmptyString(input.exported_at)) {
    issues.add('$.exported_at', 'must be a non-empty string');
  }

  if (input.kind === 'workout') {
    const workout = validateWorkout(input.workout, '$.workout', issues);
    if (!workout || issues.list.length > 0) return { valid: false, issues: issues.list };
    return {
      valid: true,
      value: {
        format: ATLAS_PLAN_FORMAT,
        kind: 'workout',
        exported_at: input.exported_at as string,
        workout,
      },
    };
  }

  if (input.kind === 'program') {
    const program = validateProgram(input.program, '$.program', issues);
    if (!program || issues.list.length > 0) return { valid: false, issues: issues.list };
    return {
      valid: true,
      value: {
        format: ATLAS_PLAN_FORMAT,
        kind: 'program',
        exported_at: input.exported_at as string,
        program,
      },
    };
  }

  if (input.kind === 'backup') {
    const backup = validateBackup(input, '$', issues);
    if (!backup || issues.list.length > 0) return { valid: false, issues: issues.list };
    return {
      valid: true,
      value: {
        format: ATLAS_PLAN_FORMAT,
        kind: 'backup',
        exported_at: input.exported_at as string,
        device_id: backup.device_id,
        entities: backup.entities,
      },
    };
  }

  return {
    valid: false,
    issues: [
      {
        path: '$.kind',
        message: `must be "workout", "program", or "backup", got ${JSON.stringify(input.kind ?? null)}`,
      },
    ],
  };
}
