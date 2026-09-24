import type { Exercise, ExerciseMuscleMapping } from '@atlas/data-model';
import { MUSCLE_TAXONOMY_VERSION } from './taxonomy';

/**
 * v1.0.0 (H2). Exercise -> muscle mapping. Two layers:
 *
 * 1. CURATED (provenance 'curated'): a hand-reviewed table for common
 *    exercises, giving real primary/secondary precision (e.g. the deltoid
 *    heads, chest regions) the source dataset's coarse strings can't.
 * 2. IMPORTED (provenance 'imported'): a deterministic normalization of the
 *    source dataset's free-form `target_muscle`/`secondary_muscles`/`category`
 *    strings into taxonomy muscle ids. Where a string can't be mapped
 *    confidently it is dropped rather than guessed -- an unmappable exercise
 *    simply has fewer (or no) muscles, never invented ones.
 *
 * `muscleMapOf()` is the single read path: a stored user-defined mapping wins,
 * then the curated table, then imported normalization. It never rewrites the
 * legacy string fields or the stored record.
 */

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

const TARGET_MUSCLE_MAP: Record<string, string[]> = {
  abductors: ['hamstrings.abductors'],
  abs: ['core.rectus_abdominis'],
  adductors: ['hamstrings.adductors'],
  biceps: ['arms.biceps'],
  calves: ['calves.gastrocnemius', 'calves.soleus'],
  delts: ['shoulders.anterior', 'shoulders.lateral', 'shoulders.posterior'],
  forearms: ['arms.forearm_flexors', 'arms.forearm_extensors'],
  glutes: ['glutes.max'],
  hamstrings: ['hamstrings.hamstrings'],
  lats: ['back.lats'],
  pectorals: ['chest.upper', 'chest.mid', 'chest.lower'],
  quads: ['quads.quadriceps'],
  'serratus anterior': ['core.serratus'],
  spine: ['back.erectors'],
  traps: ['back.traps_upper', 'back.traps_mid'],
  triceps: ['arms.triceps'],
  'upper back': ['back.rhomboids', 'back.lats'],
};

const SECONDARY_MUSCLE_MAP: Record<string, string[]> = {
  abdominals: ['core.rectus_abdominis'],
  back: ['back.lats'],
  biceps: ['arms.biceps'],
  brachialis: ['arms.brachialis'],
  calves: ['calves.gastrocnemius'],
  chest: ['chest.mid'],
  core: ['core.rectus_abdominis'],
  deltoids: ['shoulders.anterior', 'shoulders.lateral', 'shoulders.posterior'],
  forearms: ['arms.forearm_flexors'],
  glutes: ['glutes.max'],
  'grip muscles': ['arms.forearm_flexors'],
  groin: ['hamstrings.adductors'],
  hamstrings: ['hamstrings.hamstrings'],
  'hip flexors': ['quads.hip_flexors'],
  'inner thighs': ['hamstrings.adductors'],
  'latissimus dorsi': ['back.lats'],
  lats: ['back.lats'],
  'lower abs': ['core.rectus_abdominis'],
  'lower back': ['back.erectors'],
  obliques: ['core.obliques'],
  quadriceps: ['quads.quadriceps'],
  'rear deltoids': ['shoulders.posterior'],
  rhomboids: ['back.rhomboids'],
  'rotator cuff': ['shoulders.rotator_cuff'],
  shins: ['calves.tibialis'],
  shoulders: ['shoulders.lateral'],
  soleus: ['calves.soleus'],
  trapezius: ['back.traps_upper'],
  traps: ['back.traps_upper'],
  triceps: ['arms.triceps'],
  'upper back': ['back.rhomboids'],
  'upper chest': ['chest.upper'],
  'wrist extensors': ['arms.forearm_extensors'],
  'wrist flexors': ['arms.forearm_flexors'],
};

/** Coarse `category` fallback used only when `target_muscle` is absent. */
const CATEGORY_FALLBACK: Record<string, string[]> = {
  chest: ['chest.mid'],
  back: ['back.lats'],
  shoulders: ['shoulders.lateral'],
  'upper arms': ['arms.biceps', 'arms.triceps'],
  'lower arms': ['arms.forearm_flexors'],
  waist: ['core.rectus_abdominis'],
  'upper legs': ['quads.quadriceps', 'hamstrings.hamstrings'],
  'lower legs': ['calves.gastrocnemius'],
};

/** Hand-curated precision for common exercises, keyed by lowercase name. */
const CURATED_MUSCLE_MAP: Record<string, { primary: string[]; secondary: string[] }> = {
  'barbell bench press': {
    primary: ['chest.mid', 'chest.upper'],
    secondary: ['shoulders.anterior', 'arms.triceps'],
  },
  'dumbbell bench press': {
    primary: ['chest.mid'],
    secondary: ['shoulders.anterior', 'arms.triceps'],
  },
  'incline barbell bench press': {
    primary: ['chest.upper'],
    secondary: ['shoulders.anterior', 'arms.triceps'],
  },
  'decline barbell bench press': {
    primary: ['chest.lower'],
    secondary: ['shoulders.anterior', 'arms.triceps'],
  },
  'overhead press': {
    primary: ['shoulders.anterior', 'shoulders.lateral'],
    secondary: ['arms.triceps'],
  },
  'seated dumbbell press': {
    primary: ['shoulders.anterior', 'shoulders.lateral'],
    secondary: ['arms.triceps'],
  },
  'dumbbell lateral raise': {
    primary: ['shoulders.lateral'],
    secondary: ['shoulders.anterior'],
  },
  'cable lateral raise': { primary: ['shoulders.lateral'], secondary: [] },
  'rear delt fly': { primary: ['shoulders.posterior'], secondary: ['back.rhomboids'] },
  'barbell row': { primary: ['back.lats', 'back.rhomboids'], secondary: ['arms.biceps'] },
  'dumbbell bent-over row': {
    primary: ['back.lats', 'back.rhomboids'],
    secondary: ['arms.biceps'],
  },
  'seated cable row': { primary: ['back.rhomboids', 'back.lats'], secondary: ['arms.biceps'] },
  'lat pulldown': { primary: ['back.lats'], secondary: ['arms.biceps', 'back.rhomboids'] },
  'pull-up': { primary: ['back.lats'], secondary: ['arms.biceps', 'back.rhomboids'] },
  'chin-up': { primary: ['back.lats', 'arms.biceps'], secondary: ['back.rhomboids'] },
  'shrug': { primary: ['back.traps_upper'], secondary: [] },
  'dumbbell shrug': { primary: ['back.traps_upper'], secondary: [] },
  'barbell deadlift': {
    primary: ['hamstrings.hamstrings', 'glutes.max', 'back.erectors'],
    secondary: ['back.traps_mid', 'arms.forearm_flexors'],
  },
  'romanian deadlift': {
    primary: ['hamstrings.hamstrings', 'glutes.max'],
    secondary: ['back.erectors'],
  },
  'barbell squat': { primary: ['quads.quadriceps', 'glutes.max'], secondary: ['back.erectors'] },
  'goblet squat': { primary: ['quads.quadriceps', 'glutes.max'], secondary: ['core.rectus_abdominis'] },
  'leg extension': { primary: ['quads.quadriceps'], secondary: [] },
  'lying leg curl': { primary: ['hamstrings.hamstrings'], secondary: [] },
  'barbell curl': { primary: ['arms.biceps'], secondary: ['arms.brachialis'] },
  'dumbbell curl': { primary: ['arms.biceps'], secondary: ['arms.brachialis'] },
  'hammer curl': { primary: ['arms.brachialis'], secondary: ['arms.biceps'] },
  'tricep pushdown': { primary: ['arms.triceps'], secondary: [] },
  'skull crusher': { primary: ['arms.triceps'], secondary: [] },
  'chest dip': { primary: ['chest.lower'], secondary: ['arms.triceps', 'shoulders.anterior'] },
  'push-up': { primary: ['chest.mid'], secondary: ['arms.triceps', 'shoulders.anterior'] },
  'plank': { primary: ['core.rectus_abdominis'], secondary: ['shoulders.anterior'] },
  'hanging leg raise': { primary: ['core.rectus_abdominis'], secondary: ['quads.hip_flexors'] },
  'calf raise': { primary: ['calves.gastrocnemius', 'calves.soleus'], secondary: [] },
  'hip thrust': { primary: ['glutes.max'], secondary: ['hamstrings.hamstrings'] },
};

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

function mapStrings(strings: string[], table: Record<string, string[]>): string[] {
  return dedupe(strings.flatMap((s) => table[s.trim().toLowerCase()] ?? []));
}

export function deriveImportedMuscleMap(exercise: Exercise): ExerciseMuscleMapping | null {
  const target = exercise.target_muscle?.trim().toLowerCase() ?? null;
  const primary = target ? mapStrings([target], TARGET_MUSCLE_MAP) : [];
  const primaryFallback =
    primary.length === 0 && exercise.category
      ? mapStrings([exercise.category.toLowerCase()], CATEGORY_FALLBACK)
      : [];
  const secondary = mapStrings(exercise.secondary_muscles, SECONDARY_MUSCLE_MAP).filter(
    (id) => !primary.includes(id) && !primaryFallback.includes(id),
  );
  const resultPrimary = primary.length > 0 ? primary : primaryFallback;
  if (resultPrimary.length === 0 && secondary.length === 0) return null;
  return {
    primary: resultPrimary,
    secondary,
    provenance: 'imported',
    taxonomy_version: MUSCLE_TAXONOMY_VERSION,
  };
}

/**
 * The single read path for an exercise's structured muscle mapping:
 * stored user-defined mapping, then curated, then imported normalization.
 */
export function muscleMapOf(exercise: Exercise): ExerciseMuscleMapping | null {
  if (exercise.muscle_map) return exercise.muscle_map;
  const curated = CURATED_MUSCLE_MAP[normalizeName(exercise.name)];
  if (curated) {
    return { ...curated, provenance: 'curated', taxonomy_version: MUSCLE_TAXONOMY_VERSION };
  }
  return deriveImportedMuscleMap(exercise);
}

/** All muscles touched by an exercise's mapping (primary + secondary, deduped). */
export function mappedMuscleIds(exercise: Exercise): string[] {
  const map = muscleMapOf(exercise);
  if (!map) return [];
  return dedupe([...map.primary, ...map.secondary]);
}

/**
 * vNext Handoff 03B. The Library's body browse: every exercise that trains
 * (as a primary OR secondary muscle) at least one of `muscleIds`. An empty
 * selection matches nothing -- "no muscle picked" is not "every exercise".
 */
export function exercisesTargetingMuscles(exercises: Exercise[], muscleIds: string[]): Exercise[] {
  if (muscleIds.length === 0) return [];
  const wanted = new Set(muscleIds);
  return exercises.filter((exercise) => mappedMuscleIds(exercise).some((id) => wanted.has(id)));
}
