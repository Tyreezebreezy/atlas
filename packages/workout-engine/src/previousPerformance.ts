import type { PerformedSet, WorkoutSession } from '@atlas/data-model';

/**
 * Most recent completed session's sets for this exercise, most-recent first.
 * O(sessions) scan -- fine at personal-app scale; index by exercise_id if this
 * ever needs to run over thousands of sessions.
 */
export function previousPerformance(
  sessions: WorkoutSession[],
  exerciseId: string,
  excludeSessionId?: string,
): PerformedSet[] {
  const completed = sessions
    .filter((s) => s.status === 'completed' && s.id !== excludeSessionId)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  for (const session of completed) {
    const sets = session.performed_sets
      .filter((s) => s.exercise_id === exerciseId)
      .sort((a, b) => a.set_index - b.set_index);
    if (sets.length > 0) return sets;
  }
  return [];
}
