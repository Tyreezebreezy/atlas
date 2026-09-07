import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import {
  FED_EXPLICIT_MEDIA_MAPPING,
  matchFreeExerciseDbMedia,
  type FreeExerciseDbEntry,
} from './matchFreeExerciseDbMedia';

function makeExercise(
  id: string,
  name: string,
  aliases: string[] = [],
  overrides: Partial<Pick<Exercise, 'equipment' | 'target_muscle'>> = {},
): Exercise {
  return {
    id,
    created_at: '2026-09-06T00:00:00.000Z',
    updated_at: '2026-09-06T00:00:00.000Z',
    version: 1,
    device_id: 'seed',
    deleted_at: null,
    name,
    aliases,
    category: null,
    equipment: overrides.equipment ?? [],
    target_muscle: overrides.target_muscle ?? null,
    secondary_muscles: [],
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
  };
}

function makeEntry(
  id: string,
  name: string,
  overrides: Partial<Pick<FreeExerciseDbEntry, 'equipment' | 'primaryMuscles' | 'images'>> = {},
): FreeExerciseDbEntry {
  return {
    id,
    name,
    force: null,
    level: 'beginner',
    mechanic: null,
    equipment: overrides.equipment ?? 'barbell',
    primaryMuscles: overrides.primaryMuscles ?? ['chest'],
    secondaryMuscles: [],
    instructions: [],
    category: 'strength',
    images: overrides.images ?? [`${id}/0.jpg`, `${id}/1.jpg`],
  };
}

describe('matchFreeExerciseDbMedia', () => {
  it('matches on exact name', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const report = matchFreeExerciseDbMedia([bench], [makeEntry('Bench_Press', 'Bench Press')]);
    expect(report.matched).toEqual([
      { freeExerciseDbId: 'Bench_Press', atlasExerciseId: 'e-1', tier: 'exact' },
    ]);
  });

  it('falls back to normalized-name matching', () => {
    const pullup = makeExercise('e-1', 'pull up');
    const report = matchFreeExerciseDbMedia([pullup], [makeEntry('Pull-Up', 'Pull-Up')]);
    expect(report.matched).toEqual([
      { freeExerciseDbId: 'Pull-Up', atlasExerciseId: 'e-1', tier: 'normalized' },
    ]);
  });

  it('falls back to the fuzzy tier for word-order/plural differences', () => {
    const row = makeExercise('e-1', 'Lateral Raises Dumbbell');
    const report = matchFreeExerciseDbMedia([row], [makeEntry('DLR', 'Dumbbell Lateral Raise')]);
    expect(report.matched).toEqual([
      { freeExerciseDbId: 'DLR', atlasExerciseId: 'e-1', tier: 'fuzzy' },
    ]);
  });

  it('resolves the equipment-superset tier: ATLAS name = entry name + its own confirmed equipment', () => {
    const goodMorning = makeExercise('e-1', 'barbell good morning', [], { equipment: ['barbell'] });
    const report = matchFreeExerciseDbMedia(
      [goodMorning],
      [makeEntry('Good_Morning', 'Good Morning', { equipment: 'barbell' })],
    );
    expect(report.matched).toEqual([
      { freeExerciseDbId: 'Good_Morning', atlasExerciseId: 'e-1', tier: 'equipment-superset' },
    ]);
  });

  it('does not let the equipment-superset tier bridge a real equipment difference (EZ-bar vs. plain barbell)', () => {
    const ezVariant = makeExercise('e-1', 'ez barbell anti gravity press', [], {
      equipment: ['ez barbell'],
    });
    const report = matchFreeExerciseDbMedia(
      [ezVariant],
      [makeEntry('Anti-Gravity_Press', 'Anti-Gravity Press', { equipment: 'barbell' })],
    );
    expect(report.matched).toEqual([]);
    expect(report.unresolved).toEqual([
      { freeExerciseDbId: 'Anti-Gravity_Press', name: 'Anti-Gravity Press' },
    ]);
  });

  it('never lets the equipment-superset tier bridge a different (non-equipment) extra word', () => {
    // "Incline" is a real position qualifier, not an equipment word -- must
    // stay unresolved rather than being absorbed as if it were equipment.
    const incline = makeExercise('e-1', 'barbell incline bench press', [], {
      equipment: ['barbell'],
    });
    const report = matchFreeExerciseDbMedia(
      [incline],
      [makeEntry('Bench_Press', 'Bench Press', { equipment: 'barbell' })],
    );
    expect(report.matched).toEqual([]);
    expect(report.unresolved).toEqual([{ freeExerciseDbId: 'Bench_Press', name: 'Bench Press' }]);
  });

  it('falls back to an ATLAS alias when name/normalized/fuzzy/equipment-superset all miss', () => {
    // Deliberately worded so it's reachable ONLY via the alias -- the
    // canonical name shares no meaningful token overlap with the entry.
    const row = makeExercise('e-1', 'Pendlay Row', ['Bent-Over Row'], { equipment: ['barbell'] });
    const report = matchFreeExerciseDbMedia(
      [row],
      [makeEntry('Bent_Over_Row', 'Bent-Over Row', { equipment: 'barbell' })],
    );
    expect(report.matched).toEqual([
      { freeExerciseDbId: 'Bent_Over_Row', atlasExerciseId: 'e-1', tier: 'alias' },
    ]);
  });

  it('resolves via the explicit mapping table when nothing else matches', () => {
    FED_EXPLICIT_MEDIA_MAPPING['Some_Id'] = 'a truly custom-named atlas exercise';
    const press = makeExercise('e-1', 'a truly custom-named atlas exercise');
    const report = matchFreeExerciseDbMedia(
      [press],
      [makeEntry('Some_Id', 'Totally Different Name')],
    );
    expect(report.matched).toEqual([
      { freeExerciseDbId: 'Some_Id', atlasExerciseId: 'e-1', tier: 'explicit' },
    ]);
    delete FED_EXPLICIT_MEDIA_MAPPING['Some_Id'];
  });

  it('never auto-resolves an ambiguous match', () => {
    const a = makeExercise('e-1', 'Lever Chest Press');
    const b = makeExercise('e-2', 'Lever Chest Press');
    const report = matchFreeExerciseDbMedia(
      [a, b],
      [makeEntry('Lever_Chest_Press', 'Lever Chest Press')],
    );
    expect(report.matched).toEqual([]);
    expect(report.ambiguous).toEqual([
      {
        freeExerciseDbId: 'Lever_Chest_Press',
        name: 'Lever Chest Press',
        atlasExerciseIds: ['e-1', 'e-2'],
      },
    ]);
  });

  it('treats a zero-image entry as unmatchable regardless of name', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const report = matchFreeExerciseDbMedia(
      [bench],
      [makeEntry('Bench_Press', 'Bench Press', { images: [] })],
    );
    expect(report.matched).toEqual([]);
    expect(report.unresolved).toEqual([{ freeExerciseDbId: 'Bench_Press', name: 'Bench Press' }]);
  });

  it('reports a genuinely unresolvable name as unresolved, not a guess', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const report = matchFreeExerciseDbMedia([bench], [makeEntry('Zercher_Squat', 'Zercher Squat')]);
    expect(report.matched).toEqual([]);
    expect(report.unresolved).toEqual([
      { freeExerciseDbId: 'Zercher_Squat', name: 'Zercher Squat' },
    ]);
  });

  it('counts every ATLAS exercise that did not receive a match from either provider tier', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const squat = makeExercise('e-2', 'Squat');
    const report = matchFreeExerciseDbMedia(
      [bench, squat],
      [makeEntry('Bench_Press', 'Bench Press')],
    );
    expect(report.atlasWithoutMediaCount).toBe(1);
    expect(report.sourceExerciseCount).toBe(1);
  });
});
