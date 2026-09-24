import { useEffect, useMemo, useState } from 'react';
import {
  ensureBuiltInMilestonesSeeded,
  migrateBuiltInMilestonesToCatalog,
} from '@atlas/milestone-engine';
import { ensureBenchmarksSeeded } from '@atlas/benchmark-engine';
import type { Milestone } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { BodyScreen } from '../body/BodyScreen';
import { HistoryScreen } from '../history/HistoryScreen';
import { evaluateMilestonesForSession } from './evaluateMilestonesForSession';
import { MilestoneCatalog } from './MilestoneCatalog';
import { MilestoneForm } from './MilestoneForm';
import { MilestonesView } from './MilestonesView';
import { MusclesView } from './MusclesView';
import { OverviewView } from './OverviewView';
import { panelId, ProgressNav, tabId } from './ProgressNav';
import { PROGRESS_SEGMENTS, type ProgressData, type ProgressSegment } from './progressData';
import { StrengthView } from './StrengthView';

interface ProgressScreenProps {
  onViewExercises: () => void;
}

const NAV_ID = 'progress';

/**
 * vNext Handoff 03B. Progress is six sections -- Overview, Strength, Muscles,
 * Body, History, Milestones -- switched by a scrollable tab row. This screen
 * owns loading and the milestone editing flows; each section is its own view
 * and reads domain functions, never re-deriving PR / e1RM / stagnation /
 * weekly-review / muscle math itself.
 *
 * Reads the persisted (recalculated-on-finish) personalRecords table rather
 * than recomputing PRs live for every exercise the user has ever touched --
 * unlike the per-exercise Strength chart (scoped to one exercise, cheap to
 * recompute live), Overview and Milestones aggregate across dozens of
 * exercises, so a plain indexed read of already-materialized data is the
 * right tradeoff. See docs/PRS.md "Performance."
 */
export function ProgressScreen({ onViewExercises }: ProgressScreenProps) {
  const storage = useStorage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProgressData | null>(null);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  /** Null when the catalog is closed; a string (possibly empty) is its initial search text. */
  const [catalogQuery, setCatalogQuery] = useState<string | null>(null);
  const [segment, setSegment] = useState<ProgressSegment>('overview');
  /** Set when another section (Overview, History) sends the user to one exercise's Strength view. */
  const [strengthExerciseId, setStrengthExerciseId] = useState<string | null>(null);

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
      const [
        prs,
        milestones,
        benchmarks,
        exercises,
        sessions,
        bodyMeasurements,
        programs,
        templates,
        occurrences,
      ] = await Promise.all([
        storage.personalRecords.getAll(),
        storage.milestones.getAll(),
        storage.benchmarks.getAll(),
        storage.exercises.getAll(),
        storage.workoutSessions.getAll(),
        storage.bodyMeasurements.getAll(),
        storage.programs.getAll(),
        storage.workoutTemplates.getAll(),
        storage.workoutOccurrences.getAll(),
      ]);
      setData({
        prs,
        milestones,
        benchmarks,
        exercises: new Map(exercises.map((e) => [e.id, e])),
        sessions,
        bodyMeasurements,
        activeProgram: programs.find((p) => p.is_active) ?? null,
        templates: new Map(templates.map((t) => [t.id, t])),
        occurrences,
      });
      setLoading(false);
    }
  }, [storage]);

  const exercises = data?.exercises;
  const milestones = data?.milestones;

  // The catalog only ever shows built-ins still worth pursuing -- an
  // already-achieved one has nothing left to "add" (it's in Achieved
  // regardless of this list), and this is the ONLY screen the full set of
  // dozens of built-ins is ever rendered on (Part K).
  const catalogMilestones = useMemo(
    () => (milestones ?? []).filter((m) => m.is_builtin && m.achieved_at == null),
    [milestones],
  );

  async function refreshMilestones() {
    if (!storage) return;
    const fresh = await storage.milestones.getAll();
    setData((prev) => (prev ? { ...prev, milestones: fresh } : prev));
  }

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
    await refreshMilestones();
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
    await refreshMilestones();
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
    await refreshMilestones();
  }

  // After achieving a goal, offer the catalog pre-filtered to the same
  // exercise rather than a bespoke "next rung" picker -- one browse
  // surface, and the owner decides (Part J: no automatic replacement).
  function handleChooseNextGoal(milestone: Milestone) {
    const exerciseName = milestone.exercise_id
      ? (exercises?.get(milestone.exercise_id)?.name ?? '')
      : '';
    setCatalogQuery(exerciseName);
  }

  function openStrength(exerciseId: string | null) {
    setStrengthExerciseId(exerciseId);
    setSegment('strength');
  }

  if (!storage || loading || !data) {
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
        exercises={data.exercises}
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
          editingMilestone?.exercise_id ? data.exercises.get(editingMilestone.exercise_id) : undefined
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
      <h1 className="atlas-progress__title">Progress</h1>
      <ProgressNav
        items={PROGRESS_SEGMENTS}
        active={segment}
        onChange={setSegment}
        idPrefix={NAV_ID}
        label="Progress sections"
      />

      <div
        className="atlas-progress__panel"
        role="tabpanel"
        id={panelId(NAV_ID, segment)}
        aria-labelledby={tabId(NAV_ID, segment)}
      >
        {segment === 'overview' && (
          <OverviewView
            data={data}
            onOpenStrength={openStrength}
            onOpenSegment={setSegment}
            onViewExercises={onViewExercises}
          />
        )}
        {segment === 'strength' && (
          <StrengthView
            data={data}
            exerciseId={strengthExerciseId}
            onSelectExercise={setStrengthExerciseId}
            onViewExercises={onViewExercises}
          />
        )}
        {segment === 'muscles' && <MusclesView data={data} />}
        {segment === 'body' && <BodyScreen embedded />}
        {segment === 'history' && <HistoryScreen embedded onOpenExercise={openStrength} />}
        {segment === 'milestones' && (
          <MilestonesView
            data={data}
            onAdd={() => setCatalogQuery('')}
            onEdit={setEditingMilestone}
            onRemove={(m) => void handleRemoveMilestone(m)}
            onChooseNextGoal={handleChooseNextGoal}
          />
        )}
      </div>
    </div>
  );
}
