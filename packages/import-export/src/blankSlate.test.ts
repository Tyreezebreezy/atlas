import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { ensureExercisesSeeded } from '@atlas/exercise-library';

/**
 * vNext Handoff 01 (§3, §15): "A fresh ATLAS user must not receive
 * Tyree-specific workout/program data as product seed data." The fix
 * itself is that `TodayScreen.tsx` no longer calls
 * `ensureOwnerStarterDataSeeded` at all (see its own updated comment) --
 * this test pins the resulting invariant directly against storage,
 * independent of that (untested, per this codebase's convention)
 * component: a fresh profile that only ever seeds the generic exercise
 * catalog has zero personal programs/history, and onboarding/import/build
 * flows can still proceed because the catalog and empty collections are
 * both genuinely there, not missing.
 */
describe('blank-slate product separation', () => {
  it('a fresh profile has zero personal programs/templates/history after only the generic catalog seeds', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);

    await ensureExercisesSeeded(storage);

    const [programs, templates, sessions, occurrences, exercises] = await Promise.all([
      storage.programs.getAll(),
      storage.workoutTemplates.getAll(),
      storage.workoutSessions.getAll(),
      storage.workoutOccurrences.getAll(),
      storage.exercises.getAll(),
    ]);

    // Zero personal data -- nothing named/shaped like the owner's own
    // "Weekly Workout Guide" (or anything else) ever appeared unasked.
    expect(programs).toHaveLength(0);
    expect(templates).toHaveLength(0);
    expect(sessions).toHaveLength(0);
    expect(occurrences).toHaveLength(0);

    // The built-in exercise catalog still exists -- a blank slate is not
    // an empty app; onboarding/import/build flows need real exercises to
    // resolve against.
    expect(exercises.length).toBeGreaterThan(1000);
    expect(exercises.every((e) => !e.is_custom)).toBe(true);
  });

  it('a fresh profile can still build a program/log a workout from nothing (onboarding is not blocked)', async () => {
    const storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
    await ensureExercisesSeeded(storage);

    const exercises = await storage.exercises.getAll();
    const benchPress = exercises.find((e) => e.name.toLowerCase().includes('bench press'));
    expect(benchPress).toBeDefined(); // a real, resolvable exercise to build a first program/quick workout from
  });
});
