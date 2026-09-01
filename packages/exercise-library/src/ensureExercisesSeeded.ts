import type { AtlasStorage } from '@atlas/storage';
import type { Exercise } from '@atlas/data-model';
import seedData from './data/atlas-exercises.json';
import workoutGuideManifest from './data/workoutGuideManifest.json';
import { applyCuratedEnrichment } from './curatedEnrichment';
import { applyWorkoutGuideMedia } from './applyWorkoutGuideMedia';
import type { WorkoutGuideEntry } from './matchWorkoutGuideMedia';

export const seedExercises = seedData as Exercise[];

/** Bulk-seeds the library on first run; no-ops once anything exists. */
export async function ensureExercisesSeeded(storage: AtlasStorage): Promise<void> {
  const existing = await storage.exercises.getAll();
  if (existing.length > 0) return;
  const enriched = applyCuratedEnrichment(seedExercises);
  const withMedia = applyWorkoutGuideMedia(enriched, workoutGuideManifest as WorkoutGuideEntry[]);
  await storage.exercises.putMany(withMedia);
}
