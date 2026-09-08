import { useEffect, useMemo, useState } from 'react';
import {
  estimated1RMSeries,
  trainingDistribution,
  trainingRecency,
  type DistributionEntry,
} from '@atlas/progress-engine';
import {
  describeMilestoneProgress,
  ensureBuiltInMilestonesSeeded,
  groupMilestones,
  migrateBuiltInMilestonesToCatalog,
} from '@atlas/milestone-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import {
  ensureBenchmarksSeeded,
  findBenchmark,
  interpolatePercentile,
  formatPercentileDisplay,
} from '@atlas/benchmark-engine';
import type {
  Benchmark,
  Exercise,
  Milestone,
  PersonalRecord,
  PrKind,
  WorkoutSession,
} from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { ActivityHeatmap } from './ActivityHeatmap';
import { describePR } from './formatPR';
import { evaluateMilestonesForSession } from './evaluateMilestonesForSession';
import { MilestoneCatalog } from './MilestoneCatalog';
import { MilestoneForm } from './MilestoneForm';

interface ProgressScreenProps {
  onViewExercises: () => void;
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Plain proportional bar list -- no charting dependency for a handful of
 * category totals. Assumes non-empty entries; callers gate on that. */
function DistributionList({ entries }: { entries: DistributionEntry[] }) {
  const max = Math.max(...entries.map((e) => e.workingSets));
  return (
    <ul className="atlas-progress__distribution-list">
      {entries.map((e) => (
        <li key={e.label} className="atlas-progress__distribution-item">
          <span className="atlas-progress__distribution-label">{e.label}</span>
          <span className="atlas-progress__distribution-bar-track">
            <span
              className="atlas-progress__distribution-bar"
              style={{ width: `${(e.workingSets / max) * 100}%` }}
            />
          </span>
          <span className="atlas-progress__distribution-count">{e.workingSets}</span>
        </li>
      ))}
    </ul>
  );
}

// Which PR kind demonstrates a benchmark metric, e.g. "pushups" is measured
// by the exercise's `bodyweight`-kind PR (most reps in one set). Benchmarks
// with no exerciseName (e.g. grip strength -- no ATLAS exercise for it) have
// no entry here and are simply not shown, since there's no PR to compare.
const BENCHMARK_PR_KIND: Record<string, PrKind> = {
  pushups: 'bodyweight',
  pullups: 'bodyweight',
  bench_press_1rm_lb: 'estimated_1rm',
  plank_seconds: 'timed',
};

interface RecentItem {
  key: string;
  kind: 'pr' | 'milestone';
  date: string;
  exerciseName: string;
  title: string;
  value: string | null;
}

/**
 * Reads the persisted (recalculated-on-finish) personalRecords table rather
 * than recomputing PRs live for every exercise the user has ever touched --
 * unlike ExerciseProgress (scoped to one exercise, cheap to recompute live),
 * this screen aggregates across potentially dozens of exercises, so a plain
 * indexed read of already-materialized data is the right tradeoff. See
 * docs/PRS.md "Performance."
 */
export function ProgressScreen({ onViewExercises }: ProgressScreenProps) {
  const storage = useStorage();
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  /** Null when the catalog is closed; a string (possibly empty) is its initial search text. */
  const [catalogQuery, setCatalogQuery] = useState<string | null>(null);

  useEffect(() => {
    if (!storage) return;
    void loadAll();

    async function loadAll() {
      if (!storage) return;
      // Order doesn't matter for correctness (migration only touches
      // existing rows, seeding only creates ones with a name it hasn't
      // seen), but demoting old data before a fresh seed reads clearer.
      await migrateBuiltInMilestonesToCatalog(storage);
      await Promise.all([ensureBuiltInMilestonesSeeded(storage), ensureBenchmarksSeeded(storage)]);
      const [allPRs, allMilestones, allBenchmarks, allExercises, allSessions] = await Promise.all([
        storage.personalRecords.getAll(),
        storage.milestones.getAll(),
        storage.benchmarks.getAll(),
        storage.exercises.getAll(),
        storage.workoutSessions.getAll(),
      ]);
      setPrs(allPRs);
      setMilestones(allMilestones);
      setBenchmarks(allBenchmarks);
      setExercises(new Map(allExercises.map((e) => [e.id, e])));
      setSessions(allSessions);
      setLoading(false);
    }
  }, [storage]);

  const thisMonthPRs = useMemo(() => prs.filter((p) => isThisMonth(p.achieved_at)).length, [prs]);
  const thisMonthMilestones = useMemo(
    () => milestones.filter((m) => m.achieved_at != null && isThisMonth(m.achieved_at)).length,
    [milestones],
  );

  const recent = useMemo<RecentItem[]>(() => {
    const prItems: RecentItem[] = prs.map((pr) => {
      const { title, value } = describePR(pr);
      return {
        key: `pr:${pr.id}`,
        kind: 'pr',
        date: pr.achieved_at,
        exerciseName: formatExerciseName(exercises.get(pr.exercise_id)?.name ?? 'Exercise'),
        title,
        value,
      };
    });
    const milestoneItems: RecentItem[] = milestones
      .filter((m): m is Milestone & { achieved_at: string } => m.achieved_at != null)
      .map((m) => ({
        key: `milestone:${m.id}`,
        kind: 'milestone',
        date: m.achieved_at,
        exerciseName: m.exercise_id
          ? formatExerciseName(exercises.get(m.exercise_id)?.name ?? 'Exercise')
          : '',
        title: m.title,
        value: null,
      }));
    return [...prItems, ...milestoneItems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [prs, milestones, exercises]);

  const distribution = useMemo(
    () => trainingDistribution(sessions, exercises),
    [sessions, exercises],
  );

  const recency = useMemo(() => trainingRecency(sessions, exercises), [sessions, exercises]);

  const strengthTrends = useMemo(() => {
    const trends: { exerciseId: string; first: number; last: number }[] = [];
    for (const pr of prs) {
      if (pr.kind !== 'estimated_1rm') continue;
      const series = estimated1RMSeries(sessions, pr.exercise_id);
      const firstPoint = series[0];
      const lastPoint = series[series.length - 1];
      if (series.length < 2 || !firstPoint || !lastPoint) continue;
      trends.push({ exerciseId: pr.exercise_id, first: firstPoint.value, last: lastPoint.value });
    }
    return trends.slice(0, 3);
  }, [prs, sessions]);

  // Grouped by movement and ordered by increasing target (v0.2.2) -- not by
  // achieved_at, which scrambles different movements together the moment
  // two milestones are hit on different days. See docs/DATA_MODEL.md
  // "Milestone grouping."
  //
  // v0.2.3 Part B/C: "active" now means "the owner selected this as a
  // goal" (built-ins seed inactive -- see ensureBuiltInMilestonesSeeded.ts
  // -- and evaluateMilestone already skips `!active` entirely, so an
  // unselected catalog target is never even evaluated). My Milestones and
  // Achieved are mutually exclusive: a goal graduates out of "in progress"
  // the moment it's achieved, regardless of its active flag from then on.
  const myMilestoneGroups = useMemo(
    () =>
      groupMilestones(
        milestones.filter((m) => m.active && m.achieved_at == null),
        exercises,
      ),
    [milestones, exercises],
  );
  const achievedMilestoneGroups = useMemo(
    () => groupMilestones(milestones.filter((m) => m.achieved_at != null), exercises),
    [milestones, exercises],
  );
  // The catalog only ever shows built-ins still worth pursuing -- an
  // already-achieved one has nothing left to "add" (it's in Achieved
  // regardless of this list), and this is the ONLY screen the full set of
  // dozens of built-ins is ever rendered on (Part K).
  const catalogMilestones = useMemo(
    () => milestones.filter((m) => m.is_builtin && m.achieved_at == null),
    [milestones],
  );

  const benchmarkComparisons = useMemo(() => {
    const results: { benchmark: Benchmark; exerciseName: string; display: string }[] = [];
    for (const benchmark of benchmarks) {
      if (!benchmark.exercise_id) continue;
      const prKind = BENCHMARK_PR_KIND[benchmark.metric];
      if (!prKind) continue;
      const pr = prs.find((p) => p.exercise_id === benchmark.exercise_id && p.kind === prKind);
      if (!pr) continue;
      const found = findBenchmark(benchmarks, benchmark.metric);
      if (!found) continue;
      const percentile = interpolatePercentile(pr.value, found.percentile_thresholds);
      results.push({
        benchmark: found,
        exerciseName: formatExerciseName(exercises.get(benchmark.exercise_id)?.name ?? 'Exercise'),
        display: formatPercentileDisplay(percentile, found.comparison_population),
      });
    }
    return results;
  }, [benchmarks, prs, exercises]);

  async function handleMilestoneSaved(saved: Milestone) {
    if (!storage) return;
    await storage.milestones.put(saved);
    // MilestoneForm forks a substantially-edited built-in into a new custom
    // milestone rather than rewriting the shared template (Part F) -- it
    // signals that here by handing back a different id than what this
    // screen passed in as `editingMilestone`. Demote the original so it
    // doesn't also linger as a second active goal alongside the fork.
    if (editingMilestone?.is_builtin && editingMilestone.id !== saved.id) {
      await storage.milestones.put({
        ...editingMilestone,
        active: false,
        updated_at: new Date().toISOString(),
        version: editingMilestone.version + 1,
      });
    }
    // A freshly-activated goal (new custom, or forked-then-active) may
    // already be satisfied by existing history -- credit it immediately
    // rather than waiting for the next workout to finish.
    await evaluateMilestonesForSession(storage);
    setMilestones(await storage.milestones.getAll());
    setShowMilestoneForm(false);
    setEditingMilestone(null);
  }

  async function handleToggleCatalogMilestone(milestone: Milestone, nextActive: boolean) {
    if (!storage) return;
    await storage.milestones.put({
      ...milestone,
      active: nextActive,
      updated_at: new Date().toISOString(),
      version: milestone.version + 1,
    });
    if (nextActive) await evaluateMilestonesForSession(storage);
    setMilestones(await storage.milestones.getAll());
  }

  // Removing a not-yet-achieved goal from My Milestones: a built-in just
  // returns to catalog-only (the shared row stays, achievable again later
  // from the catalog); a custom milestone has no catalog to return to, so
  // it's soft-deleted outright -- either way, achieved history elsewhere
  // is untouched by construction (this only ever runs on achieved_at ==
  // null rows, since that's all My Milestones ever shows).
  async function handleRemoveMilestone(milestone: Milestone) {
    if (!storage) return;
    if (milestone.is_builtin) {
      await storage.milestones.put({
        ...milestone,
        active: false,
        updated_at: new Date().toISOString(),
        version: milestone.version + 1,
      });
    } else {
      await storage.milestones.softDelete(milestone.id);
    }
    setMilestones(await storage.milestones.getAll());
  }

  // After achieving a goal, offer the catalog pre-filtered to the same
  // exercise rather than a bespoke "next rung" picker -- one browse
  // surface, and the owner decides (Part J: no automatic replacement).
  function handleChooseNextGoal(milestone: Milestone) {
    const exerciseName = milestone.exercise_id
      ? (exercises.get(milestone.exercise_id)?.name ?? '')
      : '';
    setCatalogQuery(exerciseName);
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Progress</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (catalogQuery != null) {
    return (
      <MilestoneCatalog
        milestones={catalogMilestones}
        exercises={exercises}
        initialQuery={catalogQuery}
        onToggle={(m, next) => void handleToggleCatalogMilestone(m, next)}
        onCreateCustom={() => {
          setCatalogQuery(null);
          setShowMilestoneForm(true);
        }}
        onBack={() => setCatalogQuery(null)}
      />
    );
  }

  if (showMilestoneForm || editingMilestone) {
    return (
      <MilestoneForm
        storage={storage}
        existingMilestone={editingMilestone ?? undefined}
        existingExercise={
          editingMilestone?.exercise_id ? exercises.get(editingMilestone.exercise_id) : undefined
        }
        onSaved={(m) => void handleMilestoneSaved(m)}
        onCancel={() => {
          setShowMilestoneForm(false);
          setEditingMilestone(null);
        }}
      />
    );
  }

  return (
    <div className="atlas-progress">
      <h1>Progress</h1>

      <section className="atlas-progress__month">
        <h2>This Month</h2>
        <div className="atlas-progress__month-row">
          <div className="atlas-progress__month-stat">
            <span className="atlas-progress__month-count">{thisMonthPRs}</span>
            <span className="atlas-progress__month-label">{thisMonthPRs === 1 ? 'PR' : 'PRs'}</span>
          </div>
          <div className="atlas-progress__month-stat">
            <span className="atlas-progress__month-count atlas-progress__month-count--milestone">
              {thisMonthMilestones}
            </span>
            <span className="atlas-progress__month-label">
              {thisMonthMilestones === 1 ? 'Milestone' : 'Milestones'}
            </span>
          </div>
        </div>
      </section>

      <ActivityHeatmap sessions={sessions} />

      <section>
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="atlas-program-screen__empty">
            Finish a workout to start tracking personal records and milestones.
          </p>
        ) : (
          <ul className="atlas-progress__recent-list">
            {recent.map((item) => (
              <li
                key={item.key}
                className={
                  item.kind === 'milestone' ? 'atlas-progress__recent-item--milestone' : undefined
                }
              >
                <span className="atlas-progress__recent-exercise">{item.exerciseName}</span>
                {item.value && <span className="atlas-progress__recent-value">{item.value}</span>}
                <span className="atlas-progress__recent-meta">
                  {item.kind === 'milestone' ? 'Milestone' : 'New'} {item.title} &middot;{' '}
                  {formatDate(item.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {distribution.byMuscleGroup.length > 0 && (
        <section className="atlas-progress__distribution">
          <h2>Training Distribution</h2>
          <p className="atlas-progress__distribution-window">Last {distribution.windowDays} days</p>
          <h3>By Muscle Group</h3>
          <DistributionList entries={distribution.byMuscleGroup} />
          {distribution.byMovementFamily.length > 0 && (
            <>
              <h3>By Movement Family</h3>
              <DistributionList entries={distribution.byMovementFamily} />
              {distribution.uncategorizedMovementFamilySets > 0 && (
                <p className="atlas-progress__distribution-note">
                  +{distribution.uncategorizedMovementFamilySets} working set
                  {distribution.uncategorizedMovementFamilySets === 1 ? '' : 's'} not yet classified
                  by movement family.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {recency.length > 0 && (
        <section className="atlas-progress__distribution">
          <h2>Training Recency</h2>
          <p className="atlas-progress__distribution-window">
            Days since each muscle group was last trained -- a plain tally, not a recovery estimate.
          </p>
          <ul className="atlas-progress__recency-list">
            {recency.map((entry) => (
              <li key={entry.label}>
                <span>{entry.label}</span>
                <span>
                  {entry.daysSinceTrained === 0 ? 'Today' : `${entry.daysSinceTrained}d ago`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {strengthTrends.length > 0 && (
        <section>
          <h2>Estimated Strength</h2>
          <ul className="atlas-progress__trend-list">
            {strengthTrends.map((t) => (
              <li key={t.exerciseId}>
                <span className="atlas-progress__trend-exercise">
                  {formatExerciseName(exercises.get(t.exerciseId)?.name ?? 'Exercise')}
                </span>
                <span className="atlas-progress__trend-value">
                  {Math.round(t.first)} &rarr; {Math.round(t.last)} e1RM
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="atlas-progress__milestones">
        <h2>My Milestones</h2>
        {myMilestoneGroups.length === 0 && (
          <p className="atlas-program-screen__empty">
            No active goals yet -- add one from the catalog below.
          </p>
        )}
        {myMilestoneGroups.map((group) => (
          <div
            key={group.exerciseId ?? group.displayName}
            className="atlas-progress__milestone-group"
          >
            <h3 className="atlas-progress__milestone-group-title">
              {formatExerciseName(group.displayName)}
            </h3>
            <ul className="atlas-progress__milestone-list">
              {group.milestones.map((m) => {
                const progress = describeMilestoneProgress(m, prs);
                return (
                  <li key={m.id}>
                    <div className="atlas-progress__milestone-main">
                      <span className="atlas-progress__milestone-title">{m.title}</span>
                      <span className="atlas-progress__milestone-date">{progress.text}</span>
                    </div>
                    <div className="atlas-progress__milestone-actions">
                      <button type="button" onClick={() => setEditingMilestone(m)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => void handleRemoveMilestone(m)}>
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <button type="button" onClick={() => setCatalogQuery('')}>
          + Add Milestone
        </button>
      </section>

      <section className="atlas-progress__milestones">
        <h2>Achieved</h2>
        {achievedMilestoneGroups.length === 0 ? (
          <p className="atlas-program-screen__empty">Nothing achieved yet.</p>
        ) : (
          achievedMilestoneGroups.map((group) => (
            <div
              key={group.exerciseId ?? group.displayName}
              className="atlas-progress__milestone-group"
            >
              <h3 className="atlas-progress__milestone-group-title">
                {formatExerciseName(group.displayName)}
              </h3>
              <ul className="atlas-progress__milestone-list">
                {group.milestones.map((m) => (
                  <li key={m.id} className="atlas-progress__milestone--achieved">
                    <div className="atlas-progress__milestone-main">
                      <span className="atlas-progress__milestone-title">{m.title}</span>
                      <span className="atlas-progress__milestone-date">
                        {formatDate(m.achieved_at!)}
                      </span>
                    </div>
                    <div className="atlas-progress__milestone-actions">
                      <button type="button" onClick={() => handleChooseNextGoal(m)}>
                        Choose Next Goal
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {benchmarkComparisons.length > 0 && (
        <section className="atlas-progress__benchmarks">
          <h2>Benchmarks</h2>
          <ul className="atlas-progress__benchmark-list">
            {benchmarkComparisons.map(({ benchmark, exerciseName, display }) => (
              <li key={benchmark.id}>
                <span className="atlas-progress__benchmark-exercise">{exerciseName}</span>
                <span className="atlas-progress__benchmark-display">{display}</span>
                <details className="atlas-progress__benchmark-details">
                  <summary>Source</summary>
                  <p>{benchmark.source}</p>
                  {benchmark.sample_description && <p>{benchmark.sample_description}</p>}
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="atlas-progress__view-exercises" onClick={onViewExercises}>
        View Exercises
      </button>
    </div>
  );
}
