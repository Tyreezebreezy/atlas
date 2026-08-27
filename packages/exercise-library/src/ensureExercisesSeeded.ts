import type { AtlasStorage } from '@atlas/storage';
import type { Exercise } from '@atlas/data-model';
import seedData from './data/atlas-exercises.json';

export const seedExercises = seedData as Exercise[];

/** Bulk-seeds the library on first run; no-ops once anything exists. */
export async function ensureExercisesSeeded(storage: AtlasStorage): Promise<void> {
  const existing = await storage.exercises.getAll();
  if (existing.length > 0) return;
  await storage.exercises.putMany(seedExercises);
}
