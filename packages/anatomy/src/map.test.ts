import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import {
  bodyPartOfGroup,
  deriveImportedMuscleMap,
  exercisesTargetingMuscles,
  getMuscle,
  getMuscleGroup,
  isKnownMuscle,
  mappedMuscleIds,
  MUSCLE_GROUPS,
  MUSCLES,
  MUSCLE_TAXONOMY_VERSION,
  muscleMapOf,
  musclesInGroup,
} from './index';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex',
    name: 'Machine chest press',
    aliases: [],
    category: 'chest',
    equipment: [],
    target_muscle: 'pectorals',
    secondary_muscles: ['triceps', 'deltoids'],
    instructions: [],
    movement_pattern: null,
    is_unilateral: null,
    measurement_type: 'reps_weight',
    default_rest_seconds: null,
    is_custom: false,
    source: null,
    source_id: null,
    user_notes: null,
    enrichment: null,
    created_at: '',
    updated_at: '',
    version: 1,
    device_id: '',
    deleted_at: null,
    ...overrides,
  };
}

describe('muscle taxonomy', () => {
  it('is versioned', () => {
    expect(MUSCLE_TAXONOMY_VERSION).toBe('1.0.0');
  });

  it('every muscle resolves to a known group and a non-empty svg_id', () => {
    for (const m of MUSCLES) {
      expect(getMuscleGroup(m.group_id), `group ${m.group_id} for ${m.id}`).toBeDefined();
      expect(m.svg_id.length).toBeGreaterThan(0);
      expect(['front', 'back', 'deep']).toContain(m.region);
    }
  });

  it('muscle and group ids are unique', () => {
    expect(new Set(MUSCLES.map((m) => m.id)).size).toBe(MUSCLES.length);
    expect(new Set(MUSCLE_GROUPS.map((g) => g.id)).size).toBe(MUSCLE_GROUPS.length);
  });

  it('lists muscles in a group and resolves lookups', () => {
    const shoulders = musclesInGroup('shoulders');
    expect(shoulders.map((m) => m.id)).toContain('shoulders.anterior');
    expect(getMuscle('back.lats')?.name).toBe('Lats');
    expect(isKnownMuscle('back.lats')).toBe(true);
    expect(isKnownMuscle('nope')).toBe(false);
  });
});

describe('bodyPartOfGroup (a custom exercise filters alongside the library)', () => {
  // The library's own body parts, as listed by the Library's body-part filter.
  const LIBRARY_BODY_PARTS = ['back', 'cardio', 'chest', 'lower arms', 'lower legs', 'neck', 'shoulders', 'upper arms', 'upper legs', 'waist'];

  it('gives every muscle group one of the library body parts, in its lowercase spelling', () => {
    for (const group of MUSCLE_GROUPS) {
      expect(LIBRARY_BODY_PARTS, group.id).toContain(bodyPartOfGroup(group.id));
    }
  });

  it('does not invent a body part for a group it does not know', () => {
    expect(bodyPartOfGroup('not-a-group')).toBeNull();
  });
});

describe('imported muscle mapping (normalization)', () => {
  it('maps target_muscle strings into primary muscle ids', () => {
    const map = deriveImportedMuscleMap(exercise({ target_muscle: 'pectorals' }));
    expect(map?.provenance).toBe('imported');
    expect(map?.primary).toEqual(['chest.upper', 'chest.mid', 'chest.lower']);
  });

  it('maps "delts" to all three deltoid heads', () => {
    const map = deriveImportedMuscleMap(exercise({ target_muscle: 'delts', secondary_muscles: [] }));
    expect(map?.primary).toEqual(['shoulders.anterior', 'shoulders.lateral', 'shoulders.posterior']);
  });

  it('drops secondary muscles that already appear as primary', () => {
    const map = deriveImportedMuscleMap(
      exercise({ target_muscle: 'biceps', secondary_muscles: ['biceps', 'brachialis'] }),
    );
    expect(map?.primary).toEqual(['arms.biceps']);
    expect(map?.secondary).toEqual(['arms.brachialis']);
  });

  it('falls back to category when target_muscle is absent', () => {
    const map = deriveImportedMuscleMap(exercise({ target_muscle: null, category: 'waist' }));
    expect(map?.primary).toEqual(['core.rectus_abdominis']);
  });

  it('returns null when nothing maps', () => {
    const map = deriveImportedMuscleMap(
      exercise({ target_muscle: 'cardiovascular system', secondary_muscles: [], category: 'cardio' }),
    );
    expect(map).toBeNull();
  });
});

describe('muscleMapOf read path', () => {
  it('prefers a stored user-defined mapping', () => {
    const stored = {
      primary: ['core.rectus_abdominis'],
      secondary: [],
      provenance: 'user' as const,
      taxonomy_version: '1.0.0',
    };
    const map = muscleMapOf(exercise({ muscle_map: stored }));
    expect(map).toBe(stored);
  });

  it('returns a curated mapping for a curated exercise name', () => {
    const map = muscleMapOf(exercise({ name: 'Barbell Bench Press' }));
    expect(map?.provenance).toBe('curated');
    expect(map?.primary).toContain('chest.mid');
    expect(map?.secondary).toContain('arms.triceps');
  });

  it('falls back to imported normalization otherwise', () => {
    const map = muscleMapOf(exercise({ name: 'Some exotic machine' }));
    expect(map?.provenance).toBe('imported');
  });

  it('collects all mapped muscle ids', () => {
    const ids = mappedMuscleIds(exercise({ name: 'Barbell Bench Press' }));
    expect(ids).toContain('chest.mid');
    expect(ids).toContain('shoulders.anterior');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('acceptance-pass corrections: mappings that were plainly wrong', () => {
  const custom = (name: string, category: string) =>
    exercise({ name, category, target_muscle: null, secondary_muscles: [], is_custom: true });

  it("the owner's starter exercises are mapped by name, where the category fallback gave nonsense", () => {
    // Fallback: a pressdown trained the biceps, a leg curl the quads, a face pull the lateral deltoid.
    expect(deriveImportedMuscleMap(custom('Rope pressdown', 'upper arms'))?.primary).toEqual(['arms.biceps', 'arms.triceps']);
    expect(muscleMapOf(custom('Rope pressdown', 'upper arms'))?.primary).toEqual(['arms.triceps']);
    expect(muscleMapOf(custom('Leg curl', 'upper legs'))?.primary).toEqual(['hamstrings.hamstrings']);
    expect(muscleMapOf(custom('Rope face pull', 'shoulders'))?.primary).toEqual(['shoulders.posterior']);
    expect(muscleMapOf(custom('Tibialis raise', 'lower legs'))?.primary).toEqual(['calves.tibialis']);
    expect(muscleMapOf(custom('Leg press', 'upper legs'))?.primary).toEqual(['quads.quadriceps', 'glutes.max']);
    expect(muscleMapOf(custom('Glute bridge', 'upper legs'))?.primary).toEqual(['glutes.max']);
    expect(muscleMapOf(custom('Farmer carry', 'upper legs'))?.primary).not.toContain('quads.quadriceps');
    expect(muscleMapOf(custom('Scapular push-ups', 'chest'))?.primary).toEqual(['core.serratus']);
    expect(muscleMapOf(custom('Incline dumbbell press', 'chest'))?.primary).toEqual(['chest.upper']);
    expect(muscleMapOf(custom('Neutral-grip cable row', 'back'))?.primary).toEqual(['back.rhomboids', 'back.lats']);
  });

  it('every curated name for them maps to real muscles, primary first (a typo would light nothing)', () => {
    const names = [
      'Machine chest press', 'Cable or machine chest press', 'Incline dumbbell press', 'Low-incline machine or dumbbell press',
      'Push-ups', 'Push-up progression', 'Assisted dip', 'Scapular push-ups', 'Scapular push-up',
      'Dumbbell or machine shoulder press', 'Rope face pull', 'Light face pull', 'Neutral-grip cable row',
      'Neutral-grip lat pulldown', 'Rope pressdown', 'Cable pressdown', 'Overhead cable triceps extension', 'Curl machine',
      'Leg press', 'Single-leg leg press', 'Leg curl', 'Seated or lying leg curl', 'Glute bridge', 'Cable pull-through',
      'Supported bodyweight squat', 'Supported step-up', 'Farmer carry', 'Standing or seated calf raise', 'Tibialis raise',
    ];
    for (const name of names) {
      const map = muscleMapOf(custom(name, 'chest'));
      expect(map?.provenance, name).toBe('curated');
      expect(map?.primary.length, name).toBeGreaterThan(0);
      for (const id of [...(map?.primary ?? []), ...(map?.secondary ?? [])]) expect(isKnownMuscle(id), `${name}: ${id}`).toBe(true);
    }
  });

  const glutesTarget = (name: string, secondary: string[]) =>
    exercise({ name, category: 'upper legs', target_muscle: 'glutes', secondary_muscles: secondary });

  it('a dataset squat, lunge, step-up or leg press trains the quads as a prime mover, not only the glutes', () => {
    for (const name of ['barbell full squat', 'dumbbell lunge', 'dumbbell step-up', 'sled 45° leg press (side pov)', 'walking lunge']) {
      const map = muscleMapOf(glutesTarget(name, ['quadriceps', 'hamstrings', 'calves']));
      expect(map?.primary, name).toEqual(['glutes.max', 'quads.quadriceps']);
      expect(map?.secondary, name).toEqual(['hamstrings.hamstrings', 'calves.gastrocnemius']);
    }
  });

  it('...but not a stretch or a bridge that merely shares the dataset signature', () => {
    expect(muscleMapOf(glutesTarget('exercise ball hip flexor stretch', ['quadriceps']))?.primary).toEqual(['glutes.max']);
    expect(muscleMapOf(glutesTarget('band hip lift', ['quadriceps']))?.primary).toEqual(['glutes.max']);
  });

  it('a dataset deadlift, good morning or pull-through trains the hamstrings as a prime mover; a bridge keeps them secondary', () => {
    for (const name of ['barbell romanian deadlift', 'dumbbell stiff leg deadlift', 'barbell stiff leg good morning', 'band pull through']) {
      const map = muscleMapOf(glutesTarget(name, ['hamstrings', 'lower back']));
      expect(map?.primary, name).toEqual(['glutes.max', 'hamstrings.hamstrings']);
      expect(map?.secondary, name).toEqual(['back.erectors']);
    }
    const bridge = muscleMapOf(glutesTarget('low glute bridge on floor', ['hamstrings', 'lower back']));
    expect(bridge?.primary).toEqual(['glutes.max']);
    expect(bridge?.secondary).toContain('hamstrings.hamstrings');
  });

  it('a dataset overhead press does not credit the rear deltoid; a raise keeps all three heads', () => {
    const press = exercise({ name: 'barbell seated overhead press', target_muscle: 'delts', secondary_muscles: ['triceps'] });
    expect(muscleMapOf(press)?.primary).toEqual(['shoulders.anterior', 'shoulders.lateral']);
    const raise = exercise({ name: 'cable raise', target_muscle: 'delts', secondary_muscles: [] });
    expect(muscleMapOf(raise)?.primary).toEqual(['shoulders.anterior', 'shoulders.lateral', 'shoulders.posterior']);
  });

  it('a bare "shoulders" secondary is the front deltoid for a chest exercise and the lateral head elsewhere', () => {
    const press = exercise({ name: 'Some chest press', target_muscle: 'pectorals', secondary_muscles: ['triceps', 'shoulders'] });
    expect(muscleMapOf(press)?.secondary).toEqual(['arms.triceps', 'shoulders.anterior']);
    const pressdown = exercise({ name: 'Some pressdown', target_muscle: 'triceps', secondary_muscles: ['shoulders'] });
    expect(muscleMapOf(pressdown)?.secondary).toEqual(['shoulders.lateral']);
  });
});

describe('exercisesTargetingMuscles', () => {
  const bench = exercise({ id: 'bench', name: 'Barbell Bench Press' });
  const curl = exercise({ id: 'curl', name: 'Barbell Curl', target_muscle: 'biceps', secondary_muscles: ['forearms'] });
  const squat = exercise({ id: 'squat', name: 'Leg extension x', target_muscle: 'quads', secondary_muscles: [] });
  const all = [bench, curl, squat];

  it('returns exercises that train any selected muscle, primary or secondary', () => {
    expect(exercisesTargetingMuscles(all, ['chest.mid']).map((e) => e.id)).toEqual(['bench']);
    // Triceps is only a secondary muscle of the bench press -- still trained by it.
    expect(exercisesTargetingMuscles(all, ['arms.triceps']).map((e) => e.id)).toContain('bench');
    expect(exercisesTargetingMuscles(all, ['arms.biceps', 'quads.quadriceps']).map((e) => e.id).sort()).toEqual([
      'curl',
      'squat',
    ]);
  });

  it('an empty selection matches nothing rather than everything', () => {
    expect(exercisesTargetingMuscles(all, [])).toEqual([]);
  });

  it('a muscle no exercise trains matches nothing', () => {
    expect(exercisesTargetingMuscles(all, ['calves.soleus'])).toEqual([]);
  });
});
