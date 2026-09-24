import { useMemo, useState } from 'react';
import {
  describeMilestoneProgress,
  describeMilestoneTarget,
  groupMilestonesByCategory,
  isMilestoneVisible,
} from '@atlas/milestone-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Milestone } from '@atlas/data-model';
import { BenchmarkList, benchmarkComparisons } from './BenchmarkComparisons';
import type { ProgressData } from './progressData';

interface MilestonesViewProps {
  data: ProgressData;
  onAdd: () => void;
  onEdit: (milestone: Milestone) => void;
  onRemove: (milestone: Milestone) => void;
  onChooseNextGoal: (milestone: Milestone) => void;
}

type Pane = 'progress' | 'achieved' | 'benchmarks';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * vNext Handoff 03B (§15). Goals in progress and goals reached, each laid out
 * by category (only categories that have something in them). Program
 * completion is not surfaced -- see `isMilestoneVisible`. "How you compare"
 * benchmark cards live on their own pane so their language never mixes with
 * PR and milestone language.
 */
export function MilestonesView({ data, onAdd, onEdit, onRemove, onChooseNextGoal }: MilestonesViewProps) {
  const { milestones, exercises, prs, benchmarks } = data;

  const visible = useMemo(() => milestones.filter((m) => isMilestoneVisible(m)), [milestones]);
  const inProgress = useMemo(() => visible.filter((m) => m.active && m.achieved_at == null), [visible]);
  const achieved = useMemo(() => visible.filter((m) => m.achieved_at != null), [visible]);
  const comparisons = useMemo(
    () => benchmarkComparisons(benchmarks, prs, exercises),
    [benchmarks, prs, exercises],
  );

  const [chosen, setChosen] = useState<Pane | null>(null);
  const pane: Pane = chosen ?? (inProgress.length > 0 || achieved.length === 0 ? 'progress' : 'achieved');

  const panes: { key: Pane; label: string }[] = [
    { key: 'progress', label: `In progress (${inProgress.length})` },
    { key: 'achieved', label: `Achieved (${achieved.length})` },
    ...(comparisons.length > 0 ? [{ key: 'benchmarks' as const, label: 'Benchmarks' }] : []),
  ];

  const shown = pane === 'achieved' ? achieved : inProgress;
  const categories = useMemo(() => groupMilestonesByCategory(shown, exercises), [shown, exercises]);

  return (
    <div className="atlas-milestones">
      <div className="atlas-milestones__bar">
        <div className="atlas-segmented" role="group" aria-label="Milestones">
          {panes.map((p) => (
            <button
              key={p.key}
              type="button"
              className="atlas-segmented__option"
              aria-pressed={pane === p.key}
              onClick={() => setChosen(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="atlas-btn atlas-btn--secondary atlas-milestones__add" onClick={onAdd}>
          + Add milestone
        </button>
      </div>

      {pane === 'benchmarks' ? (
        <section aria-label="Benchmarks">
          <p className="atlas-milestones__note">
            How your best compares with a reference group. These are comparisons, not goals or records.
          </p>
          <BenchmarkList comparisons={comparisons} />
        </section>
      ) : categories.length === 0 ? (
        <p className="atlas-panel atlas-milestones__empty">
          {pane === 'achieved'
            ? 'Nothing achieved yet. Reached goals collect here.'
            : 'No active goals yet. Add one from the catalog.'}
        </p>
      ) : (
        categories.map((group) => (
          <section
            key={group.category}
            className={`atlas-milestone-category atlas-milestone-category--${group.category}`}
            aria-labelledby={`milestone-category-${group.category}`}
          >
            <h2 id={`milestone-category-${group.category}`}>
              {group.label}
              <span className="atlas-milestone-category__count">{group.count}</span>
            </h2>
            {group.sections.map((section) => (
              <div key={section.exerciseId ?? section.milestones[0]?.id} className="atlas-milestone-ladder">
                {section.heading && <h3>{formatExerciseName(section.heading)}</h3>}
                <ul className="atlas-milestone-list">
                  {section.milestones.map((m) => {
                    const progress = describeMilestoneProgress(m, prs);
                    const target = describeMilestoneTarget(m);
                    const isAchieved = m.achieved_at != null;
                    const total =
                      progress.current != null && progress.remaining != null
                        ? progress.current + progress.remaining
                        : null;
                    const fraction =
                      total && total > 0 && progress.current != null ? Math.min(1, progress.current / total) : null;
                    const meta = isAchieved
                      ? `Achieved ${formatDate(m.achieved_at as string)}`
                      : progress.remaining != null
                        ? progress.text
                        : (target ?? progress.text);
                    return (
                      <li
                        key={m.id}
                        className={`atlas-milestone-card${isAchieved ? ' atlas-milestone-card--achieved' : ''}`}
                      >
                        <div className="atlas-milestone-card__main">
                          <span className="atlas-milestone-card__title">{m.title}</span>
                          {/* A goal whose title already states the target ("Reach 185 lb") needs no second line. */}
                          {meta.toLowerCase() !== m.title.toLowerCase() && (
                            <span className="atlas-milestone-card__meta">{meta}</span>
                          )}
                          {!isAchieved && fraction != null && (
                            <span className="atlas-milestone-card__bar" aria-hidden="true">
                              <span style={{ width: `${Math.round(fraction * 100)}%` }} />
                            </span>
                          )}
                        </div>
                        <div className="atlas-milestone-card__actions">
                          {isAchieved ? (
                            m.exercise_id && (
                              <button type="button" onClick={() => onChooseNextGoal(m)}>
                                Next goal
                              </button>
                            )
                          ) : (
                            <>
                              <button type="button" onClick={() => onEdit(m)}>
                                Edit
                              </button>
                              <button type="button" onClick={() => onRemove(m)}>
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
