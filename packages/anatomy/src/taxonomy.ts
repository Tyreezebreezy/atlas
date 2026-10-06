import type { Muscle, MuscleGroup } from '@atlas/data-model';

/**
 * v1.0.0 (H2). The canonical ATLAS muscle taxonomy. Static reference data --
 * not a synced entity, no `SyncMeta`, versioned by `MUSCLE_TAXONOMY_VERSION`
 * so exercise mappings can record which taxonomy produced them.
 *
 * Deliberately coarser than a medical atlas and finer than "shoulders"/"legs":
 * training-relevant distinctions only. Muscles that share one Body-Map region
 * (the three deltoid heads, the two calf muscles) carry the same `svg_id`.
 *
 * Bumping this version (after an intentional taxonomy edit) is a data
 * change, not a code change: existing `ExerciseMuscleMapping`s keep their old
 * `taxonomy_version` and are re-derived lazily rather than rewritten in place.
 */
export const MUSCLE_TAXONOMY_VERSION = '1.0.0';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: 'chest', name: 'Chest' },
  { id: 'shoulders', name: 'Shoulders' },
  { id: 'back', name: 'Back' },
  { id: 'biceps', name: 'Biceps' },
  { id: 'triceps', name: 'Triceps' },
  { id: 'forearms', name: 'Forearms' },
  { id: 'core', name: 'Core' },
  { id: 'glutes', name: 'Glutes' },
  { id: 'quads', name: 'Quadriceps' },
  { id: 'hamstrings', name: 'Hamstrings' },
  { id: 'calves', name: 'Calves' },
];

export const MUSCLES: Muscle[] = [
  // Chest
  { id: 'chest.upper', name: 'Upper Chest', group_id: 'chest', region: 'front', svg_id: 'chest-upper' },
  { id: 'chest.mid', name: 'Mid Chest', group_id: 'chest', region: 'front', svg_id: 'chest-mid' },
  { id: 'chest.lower', name: 'Lower Chest', group_id: 'chest', region: 'front', svg_id: 'chest-lower' },
  // Shoulders
  { id: 'shoulders.anterior', name: 'Front Deltoid', group_id: 'shoulders', region: 'front', svg_id: 'deltoid' },
  { id: 'shoulders.lateral', name: 'Lateral Deltoid', group_id: 'shoulders', region: 'front', svg_id: 'deltoid' },
  { id: 'shoulders.posterior', name: 'Rear Deltoid', group_id: 'shoulders', region: 'back', svg_id: 'deltoid' },
  { id: 'shoulders.rotator_cuff', name: 'Rotator Cuff', group_id: 'shoulders', region: 'deep', svg_id: 'deltoid' },
  // Back
  { id: 'back.lats', name: 'Lats', group_id: 'back', region: 'back', svg_id: 'lats' },
  { id: 'back.traps_upper', name: 'Upper Traps', group_id: 'back', region: 'back', svg_id: 'traps' },
  { id: 'back.traps_mid', name: 'Mid / Lower Traps', group_id: 'back', region: 'back', svg_id: 'traps' },
  { id: 'back.rhomboids', name: 'Rhomboids / Mid-Back', group_id: 'back', region: 'back', svg_id: 'mid-back' },
  { id: 'back.erectors', name: 'Spinal Erectors', group_id: 'back', region: 'back', svg_id: 'erectors' },
  // Arms
  { id: 'arms.biceps', name: 'Biceps', group_id: 'biceps', region: 'front', svg_id: 'biceps' },
  { id: 'arms.brachialis', name: 'Brachialis', group_id: 'biceps', region: 'front', svg_id: 'biceps' },
  { id: 'arms.triceps', name: 'Triceps', group_id: 'triceps', region: 'back', svg_id: 'triceps' },
  { id: 'arms.forearm_flexors', name: 'Forearm Flexors', group_id: 'forearms', region: 'front', svg_id: 'forearms' },
  { id: 'arms.forearm_extensors', name: 'Forearm Extensors', group_id: 'forearms', region: 'back', svg_id: 'forearms' },
  // Core
  { id: 'core.rectus_abdominis', name: 'Abs', group_id: 'core', region: 'front', svg_id: 'abs' },
  { id: 'core.obliques', name: 'Obliques', group_id: 'core', region: 'front', svg_id: 'obliques' },
  { id: 'core.serratus', name: 'Serratus Anterior', group_id: 'core', region: 'front', svg_id: 'serratus' },
  // Glutes
  { id: 'glutes.max', name: 'Glute Max', group_id: 'glutes', region: 'back', svg_id: 'glutes' },
  { id: 'glutes.med_min', name: 'Glute Med / Min', group_id: 'glutes', region: 'back', svg_id: 'glutes' },
  // Quads
  { id: 'quads.quadriceps', name: 'Quadriceps', group_id: 'quads', region: 'front', svg_id: 'quads' },
  { id: 'quads.hip_flexors', name: 'Hip Flexors', group_id: 'quads', region: 'front', svg_id: 'hip-flexors' },
  // Hamstrings / hip
  { id: 'hamstrings.hamstrings', name: 'Hamstrings', group_id: 'hamstrings', region: 'back', svg_id: 'hamstrings' },
  { id: 'hamstrings.adductors', name: 'Adductors (Inner Thigh)', group_id: 'hamstrings', region: 'front', svg_id: 'adductors' },
  // Labelled for what the art draws (the gluteus-medius hip pads), not "Outer Thigh" -- owner decision 2026-10-05.
  { id: 'hamstrings.abductors', name: 'Hip Abductors', group_id: 'hamstrings', region: 'back', svg_id: 'abductors' },
  // Calves
  { id: 'calves.gastrocnemius', name: 'Calves', group_id: 'calves', region: 'back', svg_id: 'calves' },
  { id: 'calves.soleus', name: 'Soleus', group_id: 'calves', region: 'back', svg_id: 'calves' },
  { id: 'calves.tibialis', name: 'Tibialis Anterior', group_id: 'calves', region: 'front', svg_id: 'tibialis' },
];

const muscleById = new Map(MUSCLES.map((m) => [m.id, m]));
const groupById = new Map(MUSCLE_GROUPS.map((g) => [g.id, g]));

export function getMuscle(id: string): Muscle | undefined {
  return muscleById.get(id);
}

export function getMuscleGroup(id: string): MuscleGroup | undefined {
  return groupById.get(id);
}

export function musclesInGroup(groupId: string): Muscle[] {
  return MUSCLES.filter((m) => m.group_id === groupId);
}

export function groupName(groupId: string): string {
  return groupById.get(groupId)?.name ?? groupId;
}

/**
 * The exercise library's own body-part vocabulary (`Exercise.category`, what the Library's body-part filter lists)
 * for each muscle group. A custom exercise takes its category from here, not from the group's display name: a
 * category of "Shoulders" next to the library's "shoulders" would be a second filter option that the first never
 * finds.
 */
const BODY_PART_BY_GROUP: Record<string, string> = {
  chest: 'chest',
  shoulders: 'shoulders',
  back: 'back',
  biceps: 'upper arms',
  triceps: 'upper arms',
  forearms: 'lower arms',
  core: 'waist',
  glutes: 'upper legs',
  quads: 'upper legs',
  hamstrings: 'upper legs',
  calves: 'lower legs',
};

export function bodyPartOfGroup(groupId: string): string | null {
  return BODY_PART_BY_GROUP[groupId] ?? null;
}

export function muscleName(id: string): string {
  return muscleById.get(id)?.name ?? id;
}

/** True if a muscle id exists in the current taxonomy. */
export function isKnownMuscle(id: string): boolean {
  return muscleById.has(id);
}

/** Muscle ids that share one Body-Map region (`svg_id`). */
export function musclesForSvgId(svgId: string): string[] {
  return MUSCLES.filter((m) => m.svg_id === svgId).map((m) => m.id);
}
