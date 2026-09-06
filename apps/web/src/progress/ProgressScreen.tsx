import { useEffect, useMemo, useState } from 'react';
import {
  estimated1RMSeries,
  trainingDistribution,
  type DistributionEntry,
} from '@atlas/progress-engine';
import { ensureBuiltInMilestonesSeeded } from '@atlas/milestone-engine';
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
import { describePR } from './formatPR';
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

  useEffect(() => {
    if (!storage) return;
    void loadAll();

    async function loadAll() {
      if (!storage) return;
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
        exerciseName: exercises.get(pr.exercise_id)?.name ?? 'Exercise',
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
        exerciseName: m.exercise_id ? (exercises.get(m.exercise_id)?.name ?? 'Exercise') : '',
        title: m.title,
        value: null,
      }));
    return [...prItems, ...milestoneItems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [prs, milestones, exercises]);

  const distribution = useMemo(
    () => trainingDistribution(sessions, exercises),
    [sessions, exercises],
  );

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

  const achievedMilestones = useMemo(
    () =>
      milestones
        .filter((m) => m.achieved_at != null)
        .sort((a, b) => (b.achieved_at ?? '').localeCompare(a.achieved_at ?? '')),
    [milestones],
  );
  const activeMilestones = useMemo(
    () => milestones.filter((m) => m.achieved_at == null && m.active),
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
        exerciseName: exercises.get(benchmark.exercise_id)?.name ?? 'Exercise',
        display: formatPercentileDisplay(percentile, found.comparison_population),
      });
    }
    return results;
  }, [benchmarks, prs, exercises]);

  async function handleMilestoneCreated(milestone: Milestone) {
    if (!storage) return;
    await storage.milestones.put(milestone);
    setMilestones(await storage.milestones.getAll());
    setShowMilestoneForm(false);
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Progress</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (showMilestoneForm) {
    return (
      <MilestoneForm
        storage={storage}
        onCreated={(m) => void handleMilestoneCreated(m)}
        onCancel={() => setShowMilestoneForm(false)}
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

      {strengthTrends.length > 0 && (
        <section>
          <h2>Estimated Strength</h2>
          <ul className="atlas-progress__trend-list">
            {strengthTrends.map((t) => (
              <li key={t.exerciseId}>
                <span className="atlas-progress__trend-exercise">
                  {exercises.get(t.exerciseId)?.name ?? 'Exercise'}
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
        <h2>Milestones</h2>
        {achievedMilestones.length > 0 && (
          <ul className="atlas-progress__milestone-list atlas-progress__milestone-list--achieved">
            {achievedMilestones.map((m) => (
              <li key={m.id}>
                <span className="atlas-progress__milestone-title">{m.title}</span>
                <span className="atlas-progress__milestone-date">
                  {m.achieved_at ? formatDate(m.achieved_at) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {activeMilestones.length > 0 && (
          <ul className="atlas-progress__milestone-list">
            {activeMilestones.map((m) => (
              <li key={m.id}>
                <span className="atlas-progress__milestone-title">{m.title}</span>
                <span className="atlas-progress__milestone-exercise">
                  {m.exercise_id ? (exercises.get(m.exercise_id)?.name ?? '') : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {achievedMilestones.length === 0 && activeMilestones.length === 0 && (
          <p className="atlas-program-screen__empty">No milestones yet.</p>
        )}
        <button type="button" onClick={() => setShowMilestoneForm(true)}>
          + New Milestone
        </button>
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
