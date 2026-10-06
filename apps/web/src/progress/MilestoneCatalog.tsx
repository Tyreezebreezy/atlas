import { useMemo, useState } from 'react';
import { formatExerciseName } from '@atlas/exercise-library';
import { groupMilestones } from '@atlas/milestone-engine';
import type { Exercise, Milestone } from '@atlas/data-model';

interface MilestoneCatalogProps {
  /** Built-in, not-yet-achieved milestones only -- the caller filters
   * (ProgressScreen already computes similar filters for its own sections,
   * and an achieved built-in has nothing left to "add"). */
  milestones: Milestone[];
  exercises: Map<string, Exercise>;
  /** Pre-fills the search box -- used for "Choose Next Goal" after
   * achieving one, to land already narrowed to the same exercise. */
  initialQuery?: string;
  onToggle: (milestone: Milestone, nextActive: boolean) => void;
  onCreateCustom: () => void;
  onBack: () => void;
}

/**
 * Browse/search the built-in catalog and toggle any target on or off "My
 * Milestones" (v0.2.3 Part K) -- this is the ONLY place hundreds of
 * possible built-in targets are shown; Progress itself only ever lists
 * what the owner actually selected. "Create Custom Milestone" reuses the
 * existing MilestoneForm creation flow unchanged.
 */
export function MilestoneCatalog({
  milestones,
  exercises,
  initialQuery,
  onToggle,
  onCreateCustom,
  onBack,
}: MilestoneCatalogProps) {
  const [query, setQuery] = useState(initialQuery ?? '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return milestones;
    return milestones.filter((m) => {
      const exerciseName = m.exercise_id ? (exercises.get(m.exercise_id)?.name ?? '') : '';
      return m.title.toLowerCase().includes(q) || exerciseName.toLowerCase().includes(q);
    });
  }, [milestones, exercises, query]);

  const groups = useMemo(() => groupMilestones(filtered, exercises), [filtered, exercises]);

  return (
    <div className="atlas-milestone-catalog">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Add Milestone</h1>
      <p className="atlas-milestone-form__hint">
        These are available goals, not requirements -- add only what you're actually pursuing.
      </p>
      <input
        type="search"
        aria-label="Search milestones"
        placeholder="Search by exercise or goal"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="atlas-library__search"
      />

      {groups.length === 0 && (
        <p className="atlas-program-screen__empty">No matching built-in goals.</p>
      )}
      {groups.map((group) => (
        <div
          key={group.exerciseId ?? group.displayName}
          className="atlas-progress__milestone-group"
        >
          <h3 className="atlas-progress__milestone-group-title">
            {formatExerciseName(group.displayName)}
          </h3>
          <ul className="atlas-progress__milestone-list">
            {group.milestones.map((m) => (
              <li key={m.id}>
                <span className="atlas-progress__milestone-title">{m.title}</span>
                <button
                  type="button"
                  className="atlas-progress__milestone-toggle"
                  aria-pressed={m.active}
                  aria-label={`${m.active ? 'Added' : 'Add'} ${m.title}`}
                  onClick={() => onToggle(m, !m.active)}
                >
                  {m.active ? 'Added' : 'Add'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <button type="button" className="atlas-milestone-catalog__create" onClick={onCreateCustom}>
        + Create Custom Milestone
      </button>
    </div>
  );
}
