import { describe, expect, it } from 'vitest';
import type { Exercise } from '@atlas/data-model';
import {
  EXPLICIT_MEDIA_MAPPING,
  matchWorkoutGuideMedia,
  type WorkoutGuideEntry,
} from './matchWorkoutGuideMedia';

function makeExercise(
  id: string,
  name: string,
  aliases: string[] = [],
  overrides: Partial<Pick<Exercise, 'equipment' | 'target_muscle'>> = {},
): Exercise {
  return {
    id,
    created_at: '2026-08-27T00:00:00.000Z',
    updated_at: '2026-08-27T00:00:00.000Z',
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
  slug: string,
  name: string,
  overrides: Partial<Pick<WorkoutGuideEntry, 'equipment' | 'primaryMuscle'>> = {},
): WorkoutGuideEntry {
  return {
    id: `exercise-${slug}`,
    slug,
    name,
    exerciseType: 'weight_reps',
    equipment: overrides.equipment ?? 'Barbell',
    primaryMuscle: overrides.primaryMuscle ?? 'Chest',
    secondaryMuscles: [],
    isStretch: false,
    frames: [1, 2, 3].map((index) => ({
      index,
      path: `assets/${slug}/frame-${index}.png`,
      width: 512,
      height: 512,
      format: 'png',
      attribution: {
        creator: 'Bryl Lim',
        creatorUrl: 'https://bryllim.com',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'x',
      },
    })),
    attribution: {
      creator: 'Bryl Lim',
      creatorUrl: 'https://bryllim.com',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'x',
    },
  };
}

describe('matchWorkoutGuideMedia', () => {
  it('matches on exact name', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const report = matchWorkoutGuideMedia([bench], [makeEntry('bench-press', 'Bench Press')]);
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'bench-press', atlasExerciseId: 'e-1', tier: 'exact' },
    ]);
    expect(report.unresolved).toEqual([]);
    expect(report.ambiguous).toEqual([]);
  });

  it('falls back to normalized-name matching (case/punctuation-insensitive)', () => {
    const pullup = makeExercise('e-1', 'pull up');
    const report = matchWorkoutGuideMedia([pullup], [makeEntry('pull-up', 'Pull-Up')]);
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'pull-up', atlasExerciseId: 'e-1', tier: 'normalized' },
    ]);
  });

  it('falls back to an ATLAS alias when name/normalized both miss', () => {
    const row = makeExercise('e-1', 'Barbell Bent Over Row', ['Bent-Over Row']);
    const report = matchWorkoutGuideMedia([row], [makeEntry('bent-over-row', 'Bent-Over Row')]);
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'bent-over-row', atlasExerciseId: 'e-1', tier: 'alias' },
    ]);
  });

  it('resolves via the explicit mapping table when nothing else matches', () => {
    EXPLICIT_MEDIA_MAPPING['db-press'] = 'Dumbbell Overhead Press (Seated)';
    const press = makeExercise('e-1', 'Dumbbell Overhead Press (Seated)');
    const report = matchWorkoutGuideMedia([press], [makeEntry('db-press', 'DB Press')]);
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'db-press', atlasExerciseId: 'e-1', tier: 'explicit' },
    ]);
    delete EXPLICIT_MEDIA_MAPPING['db-press'];
  });

  it('never auto-resolves an ambiguous match -- two ATLAS exercises sharing a name', () => {
    const a = makeExercise('e-1', 'Lever Chest Press');
    const b = makeExercise('e-2', 'Lever Chest Press');
    const report = matchWorkoutGuideMedia(
      [a, b],
      [makeEntry('lever-chest-press', 'Lever Chest Press')],
    );
    expect(report.matched).toEqual([]);
    expect(report.ambiguous).toEqual([
      {
        workoutGuideSlug: 'lever-chest-press',
        workoutGuideName: 'Lever Chest Press',
        atlasExerciseIds: ['e-1', 'e-2'],
      },
    ]);
  });

  it('reports a genuinely unresolvable name as unresolved, not a guess', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const report = matchWorkoutGuideMedia([bench], [makeEntry('zercher-squat', 'Zercher Squat')]);
    expect(report.matched).toEqual([]);
    expect(report.unresolved).toEqual([
      { workoutGuideSlug: 'zercher-squat', workoutGuideName: 'Zercher Squat' },
    ]);
  });

  it('counts every ATLAS exercise that did not receive a match', () => {
    const bench = makeExercise('e-1', 'Bench Press');
    const squat = makeExercise('e-2', 'Squat');
    const report = matchWorkoutGuideMedia(
      [bench, squat],
      [makeEntry('bench-press', 'Bench Press')],
    );
    expect(report.atlasWithoutMediaCount).toBe(1);
    expect(report.sourceExerciseCount).toBe(1);
  });

  it('falls back to the fuzzy tier for word-order and plural differences', () => {
    const row = makeExercise('e-1', 'Lateral Raises Dumbbell');
    const report = matchWorkoutGuideMedia([row], [makeEntry('dlr', 'Dumbbell Lateral Raise')]);
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'dlr', atlasExerciseId: 'e-1', tier: 'fuzzy' },
    ]);
  });

  it('folds DB/BB equipment shorthand at the fuzzy tier', () => {
    const row = makeExercise('e-1', 'Dumbbell Row');
    const report = matchWorkoutGuideMedia([row], [makeEntry('db-row', 'DB Row')]);
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'db-row', atlasExerciseId: 'e-1', tier: 'fuzzy' },
    ]);
  });

  it('drops the stray possessive token so "World\'s X" fuzzy-matches "World X"', () => {
    const stretch = makeExercise('e-1', 'World Greatest Stretch');
    const report = matchWorkoutGuideMedia(
      [stretch],
      [makeEntry('wgs', "World's Greatest Stretch")],
    );
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'wgs', atlasExerciseId: 'e-1', tier: 'fuzzy' },
    ]);
  });

  it('disambiguates a fuzzy-ambiguous match using workout-guide equipment metadata', () => {
    // Same word-order-reordered name (both fuzzy-key-equal to the entry, so
    // neither hits 'exact'/'normalized'), differing only by equipment.
    const dumbbellPress = makeExercise('e-1', 'Press Shoulder', [], { equipment: ['dumbbell'] });
    const barbellPress = makeExercise('e-2', 'Press Shoulder', [], { equipment: ['barbell'] });
    const report = matchWorkoutGuideMedia(
      [dumbbellPress, barbellPress],
      [makeEntry('shoulder-press', 'Shoulder Press', { equipment: 'Dumbbell' })],
    );
    expect(report.matched).toEqual([
      { workoutGuideSlug: 'shoulder-press', atlasExerciseId: 'e-1', tier: 'metadata' },
    ]);
    expect(report.ambiguous).toEqual([]);
  });

  it('stays ambiguous at the fuzzy tier when metadata cannot narrow to one candidate', () => {
    const a = makeExercise('e-1', 'Press Shoulder', [], { equipment: ['cable'] });
    const b = makeExercise('e-2', 'Press Shoulder', [], { equipment: ['machine'] });
    const report = matchWorkoutGuideMedia(
      [a, b],
      [makeEntry('shoulder-press', 'Shoulder Press', { equipment: 'Dumbbell' })],
    );
    expect(report.matched).toEqual([]);
    expect(report.ambiguous).toEqual([
      {
        workoutGuideSlug: 'shoulder-press',
        workoutGuideName: 'Shoulder Press',
        atlasExerciseIds: ['e-1', 'e-2'],
      },
    ]);
  });

  it('never uses equipment metadata as a primary match signal on its own', () => {
    // Same equipment, but the fuzzy tier already found zero candidates --
    // metadata must never manufacture a match the name doesn't support.
    const bench = makeExercise('e-1', 'Bench Press', [], { equipment: ['barbell'] });
    const report = matchWorkoutGuideMedia(
      [bench],
      [makeEntry('zercher-squat', 'Zercher Squat', { equipment: 'Barbell' })],
    );
    expect(report.matched).toEqual([]);
    expect(report.unresolved).toEqual([
      { workoutGuideSlug: 'zercher-squat', workoutGuideName: 'Zercher Squat' },
    ]);
  });
});
