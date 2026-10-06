import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import { listBodyParts, listEquipment, searchExercises } from './search';

function makeExercise(overrides: Partial<Exercise>): Exercise {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    version: 1,
    device_id: 'test',
    deleted_at: null,
    name: 'Test Exercise',
    aliases: [],
    category: 'chest',
    equipment: ['barbell'],
    target_muscle: 'chest',
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
    ...overrides,
  };
}

const bench = makeExercise({ name: 'Bench Press', category: 'chest', equipment: ['barbell'] });
const squat = makeExercise({ name: 'Back Squat', category: 'upper legs', equipment: ['barbell'] });
const pushup = makeExercise({ name: 'Push-Up', category: 'chest', equipment: ['body weight'] });
const all = [bench, squat, pushup];

describe('searchExercises', () => {
  it('filters by name substring, case-insensitively', () => {
    expect(searchExercises(all, { query: 'bench' })).toEqual([bench]);
    expect(searchExercises(all, { query: 'PUSH' })).toEqual([pushup]);
  });

  it('filters by body part', () => {
    expect(searchExercises(all, { bodyPart: 'chest' })).toEqual([bench, pushup]);
  });

  it('treats "Shoulders" and "shoulders" as one body part (a custom exercise spelled it with a capital)', () => {
    const press = makeExercise({ name: 'Landmine Press', category: 'Shoulders', is_custom: true });
    const raise = makeExercise({ name: 'Lateral Raise', category: 'shoulders' });
    expect(searchExercises([press, raise], { bodyPart: 'shoulders' })).toEqual(
      [raise, press].sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(searchExercises([press, raise], { bodyPart: 'Shoulders' })).toHaveLength(2);
    expect(listBodyParts([raise, press])).toEqual(['shoulders']);
    expect(searchExercises([press, raise], { bodyPart: 'chest' })).toEqual([]);
  });

  it('finds the "sled 45° ..." presses by their degree sign even though the stored name is garbled', () => {
    const sled = makeExercise({ name: 'sled 45в° leg press', category: 'upper legs' });
    expect(searchExercises([sled, bench], { query: '45° leg' })).toEqual([sled]);
    expect(searchExercises([sled, bench], { query: 'sled' })).toEqual([sled]);
  });

  it('filters by equipment', () => {
    expect(searchExercises(all, { equipment: 'body weight' })).toEqual([pushup]);
  });

  it('combines filters', () => {
    expect(searchExercises(all, { bodyPart: 'chest', equipment: 'barbell' })).toEqual([bench]);
  });

  it('defaults to alphabetical order (A-Z), never source/insertion order', () => {
    // Input order is bench, squat, pushup -- alphabetically it's Back Squat,
    // Bench Press, Push-Up, a different order, so this actually proves
    // sorting happens rather than passing by coincidence.
    expect(searchExercises(all, {})).toEqual([squat, bench, pushup]);
  });

  it('sorts favorites first, alphabetical within each group -- not insertion order', () => {
    // squatFav ("Back Squat") would sort before bench ("Bench Press") on
    // name alone, but favorite status still wins the top-level split; among
    // the two non-favorites, pushup ("Push-Up") still comes after bench
    // alphabetically, proving the non-favorite group isn't just "whatever
    // was left in input order."
    const squatFav = { ...squat, is_favorite: true };
    const result = searchExercises([pushup, bench, squatFav], {});
    expect(result).toEqual([squatFav, bench, pushup]);
  });

  it('treats a missing is_favorite the same as false (pre-v0.2.0 exercises), still alphabetical', () => {
    expect(searchExercises(all, {})).toEqual([squat, bench, pushup]); // none set is_favorite at all
  });

  it('sorts custom exercises alphabetically alongside library ones, not segregated by creation date', () => {
    const customAaron = makeExercise({ name: 'Aaron Press', is_custom: true });
    const result = searchExercises([bench, customAaron, squat], {});
    expect(result).toEqual([customAaron, squat, bench]);
  });
});

describe('listBodyParts / listEquipment', () => {
  it('returns distinct alphabetically sorted values', () => {
    expect(listBodyParts(all)).toEqual(['chest', 'upper legs']);
    expect(listEquipment(all)).toEqual(['barbell', 'body weight']);
  });

  it('sorts case-insensitively', () => {
    const mixed = [
      makeExercise({ category: 'zebra' }),
      makeExercise({ category: 'Apple' }),
      makeExercise({ category: 'banana' }),
    ];
    expect(listBodyParts(mixed)).toEqual(['Apple', 'banana', 'zebra']);
  });
});
