import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import {
  deriveImportedMuscleMap,
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
