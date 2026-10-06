import { useEffect, useRef, useState } from 'react';
import { newId } from '@atlas/core';
import {
  buildGymSlots,
  createPlannedExercise,
  createWorkoutTemplate,
  duplicateWorkoutTemplate,
  PLAN_LIMITS,
  reorder,
  repeatedExerciseIds,
  withSequentialOrder,
} from '@atlas/workout-engine';
import { plannedMuscleCoverage } from '@atlas/progress-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import { BodyMap } from '../anatomy/BodyMap';
import { ProgressionPolicyFields } from './ProgressionPolicyFields';
import type {
  Exercise,
  ExerciseGroupType,
  PlannedExercise,
  WorkoutTemplate,
} from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { ExercisePicker } from './ExercisePicker';
import { NumberField } from './NumberField';

interface TemplateEditorProps {
  storage: AtlasStorage;
  templateId: string | null;
  isQuickWorkoutDefault: boolean;
  onDone: () => void;
}

interface GroupingDraft {
  type: ExerciseGroupType;
  rounds: number;
  restSeconds: number | null;
}

export function TemplateEditor({
  storage,
  templateId,
  isQuickWorkoutDefault,
  onDone,
}: TemplateEditorProps) {
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [exercisesById, setExercisesById] = useState<Map<string, Exercise>>(new Map());
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupingDraft, setGroupingDraft] = useState<GroupingDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  // The confirmation replaces the action row at the bottom of a long page: bring all of it into view.
  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.scrollIntoView({ block: 'nearest' });
  }, [confirmingDelete]);

  useEffect(() => {
    void (async () => {
      const existing = templateId ? await storage.workoutTemplates.get(templateId) : undefined;
      setTemplate(existing ?? createWorkoutTemplate('', isQuickWorkoutDefault));
      const allExercises = await storage.exercises.getAll();
      setExerciseNames(new Map(allExercises.map((e) => [e.id, formatExerciseName(e.name)])));
      setExercisesById(new Map(allExercises.map((e) => [e.id, e])));
    })();
  }, [storage, templateId, isQuickWorkoutDefault]);

  if (!template) {
    return (
      <div className="atlas-empty-screen">
        <h1>Workout</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  /** Dissolves any group left with fewer than 2 members after a change --
   * a "superset" of one exercise isn't a group anymore. */
  function pruneEmptyGroups(exercises: PlannedExercise[], groups: WorkoutTemplate['groups']) {
    const counts = new Map<string, number>();
    for (const e of exercises) {
      if (e.group_id) counts.set(e.group_id, (counts.get(e.group_id) ?? 0) + 1);
    }
    const dissolved = new Set([...counts.entries()].filter(([, n]) => n < 2).map(([id]) => id));
    return {
      exercises: exercises.map((e) =>
        e.group_id && dissolved.has(e.group_id) ? { ...e, group_id: null } : e,
      ),
      groups: groups.filter((g) => !dissolved.has(g.id)),
    };
  }

  function updateExercise(id: string, patch: Partial<PlannedExercise>) {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      };
    });
  }

  function removeExercise(id: string) {
    setTemplate((prev) => {
      if (!prev) return prev;
      const remaining = withSequentialOrder(prev.exercises.filter((e) => e.id !== id));
      const pruned = pruneEmptyGroups(remaining, prev.groups);
      return { ...prev, ...pruned };
    });
  }

  /** Moving a grouped member is only allowed within its own group's
   * contiguous block -- otherwise it would break the "members are
   * consecutive" invariant buildGymSlots relies on. Repositioning a whole
   * group relative to other exercises isn't supported yet; ungroup,
   * reorder, and regroup instead (see docs/DATA_MODEL.md). */
  function moveExercise(index: number, direction: -1 | 1) {
    setTemplate((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.exercises.length) return prev;
      const current = prev.exercises[index];
      const other = prev.exercises[target];
      if (current?.group_id && current.group_id !== other?.group_id) return prev;
      if (other?.group_id && other.group_id !== current?.group_id) return prev;
      return { ...prev, exercises: withSequentialOrder(reorder(prev.exercises, index, target)) };
    });
  }

  function handleExercisePicked(exercise: Exercise) {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: [...prev.exercises, createPlannedExercise(exercise.id, prev.exercises.length)],
      };
    });
    setExerciseNames((prev) => new Map(prev).set(exercise.id, formatExerciseName(exercise.name)));
    setPicking(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmGrouping() {
    if (!groupingDraft || selected.size < 2) return;
    setTemplate((prev) => {
      if (!prev) return prev;
      const groupId = newId();
      const exercises = prev.exercises.map((e) =>
        selected.has(e.id) ? { ...e, group_id: groupId } : e,
      );
      const groups = [
        ...prev.groups,
        {
          id: groupId,
          type: groupingDraft.type,
          rounds: groupingDraft.rounds,
          rest_after_seconds: groupingDraft.restSeconds,
        },
      ];
      return { ...prev, ...pruneEmptyGroups(exercises, groups) };
    });
    setSelected(new Set());
    setGroupingDraft(null);
  }

  function ungroup(groupId: string) {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.group_id === groupId ? { ...e, group_id: null } : e,
        ),
        groups: prev.groups.filter((g) => g.id !== groupId),
      };
    });
  }

  async function handleSave() {
    if (!template) return;
    const backwards = template.exercises.filter(
      (e) =>
        e.target_reps_min != null &&
        e.target_reps_max != null &&
        e.target_reps_min > e.target_reps_max,
    );
    if (backwards.length > 0) {
      setSaveError(
        `${backwards.map((e) => exerciseNames.get(e.exercise_id) ?? 'An exercise').join(', ')}: reps min is above reps max. Fix the range, then save.`,
      );
      return;
    }
    setSaveError(null);
    const now = new Date().toISOString();
    await storage.workoutTemplates.put({
      ...template,
      name: template.name.trim() || 'Untitled Workout',
      updated_at: now,
      version: template.version + 1,
    });
    onDone();
  }

  async function handleDuplicate() {
    if (!template) return;
    await storage.workoutTemplates.put(duplicateWorkoutTemplate(template));
    onDone();
  }

  async function handleDelete() {
    if (!template) return;
    await storage.workoutTemplates.softDelete(template.id);
    onDone();
  }

  if (picking) {
    return (
      <ExercisePicker
        storage={storage}
        onPick={handleExercisePicked}
        onCancel={() => setPicking(false)}
        unavailableIds={new Set(template.exercises.map((e) => e.exercise_id))}
      />
    );
  }

  function exerciseRow(exercise: PlannedExercise, index: number, inGroup: boolean) {
    const other = template!.exercises[index + 1];
    const prevEx = template!.exercises[index - 1];
    return (
      <li key={exercise.id} className="atlas-template-editor__exercise">
        <div className="atlas-template-editor__exercise-header">
          <label className="atlas-template-editor__exercise-select">
            <input
              type="checkbox"
              checked={selected.has(exercise.id)}
              onChange={() => toggleSelected(exercise.id)}
              aria-label={`Select ${exerciseNames.get(exercise.exercise_id) ?? 'exercise'} for grouping`}
            />
            <span>{exerciseNames.get(exercise.exercise_id) ?? 'Unknown exercise'}</span>
          </label>
          <div className="atlas-template-editor__exercise-actions">
            <button
              type="button"
              aria-label="Move up"
              disabled={index === 0 || (prevEx?.group_id ?? null) !== (exercise.group_id ?? null)}
              onClick={() => moveExercise(index, -1)}
            >
              &uarr;
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={
                index === template!.exercises.length - 1 ||
                (other?.group_id ?? null) !== (exercise.group_id ?? null)
              }
              onClick={() => moveExercise(index, 1)}
            >
              &darr;
            </button>
            <button
              type="button"
              aria-label={`Remove ${exerciseNames.get(exercise.exercise_id) ?? 'exercise'}`}
              onClick={() => removeExercise(exercise.id)}
            >
              &times;
            </button>
          </div>
        </div>
        <div className="atlas-template-editor__exercise-fields">
          <NumberField
            label="Sets"
            min={0}
            max={PLAN_LIMITS.sets}
            value={exercise.target_sets}
            onChange={(v) => updateExercise(exercise.id, { target_sets: v })}
          />
          <NumberField
            label="Reps min"
            min={0}
            max={PLAN_LIMITS.reps}
            value={exercise.target_reps_min}
            onChange={(v) => updateExercise(exercise.id, { target_reps_min: v })}
          />
          <NumberField
            label="Reps max"
            min={0}
            max={PLAN_LIMITS.reps}
            value={exercise.target_reps_max}
            onChange={(v) => updateExercise(exercise.id, { target_reps_max: v })}
          />
          <NumberField
            label="Weight"
            min={0}
            max={PLAN_LIMITS.load}
            value={exercise.target_weight}
            onChange={(v) => updateExercise(exercise.id, { target_weight: v })}
          />
          <NumberField
            label="RPE"
            min={0}
            max={PLAN_LIMITS.effort}
            value={exercise.target_rpe}
            onChange={(v) => updateExercise(exercise.id, { target_rpe: v })}
          />
          <NumberField
            label="RIR"
            min={0}
            max={PLAN_LIMITS.effort}
            value={exercise.target_rir}
            onChange={(v) => updateExercise(exercise.id, { target_rir: v })}
          />
          {!inGroup && (
            <NumberField
              label="Rest (sec)"
              min={0}
              max={PLAN_LIMITS.seconds}
              value={exercise.rest_seconds}
              onChange={(v) => updateExercise(exercise.id, { rest_seconds: v })}
            />
          )}
          <NumberField
            label="Duration (sec)"
            min={0}
            max={PLAN_LIMITS.seconds}
            value={exercise.target_duration_seconds}
            onChange={(v) => updateExercise(exercise.id, { target_duration_seconds: v })}
          />
          <NumberField
            label="Distance (m)"
            min={0}
            max={PLAN_LIMITS.meters}
            value={exercise.target_distance_meters}
            onChange={(v) => updateExercise(exercise.id, { target_distance_meters: v })}
          />
        </div>
        <ProgressionPolicyFields
          idPrefix={`exercise-progression-${exercise.id}`}
          policy={exercise.progression_policy}
          onChange={(policy) => updateExercise(exercise.id, { progression_policy: policy })}
        />
      </li>
    );
  }

  const slots = buildGymSlots(template.exercises, template.groups);
  // A template saved before a workout was limited to one entry per exercise may still repeat one.
  const repeated = repeatedExerciseIds(template.exercises);
  const coverage = plannedMuscleCoverage(template.exercises, exercisesById);
  const coverageStates = coverage.byMuscle.map((m) => ({
    muscleId: m.muscleId,
    state: (m.directSets > 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
  }));

  return (
    <div className="atlas-template-editor">
      <button type="button" className="atlas-template-editor__back" onClick={onDone}>
        &larr; Back
      </button>

      <label htmlFor="template-name">Name</label>
      <input
        id="template-name"
        placeholder="New Workout"
        value={template.name}
        onChange={(e) => setTemplate({ ...template, name: e.target.value })}
      />

      <label className="atlas-template-editor__quick-toggle">
        <input
          type="checkbox"
          checked={template.is_quick_workout}
          onChange={(e) => setTemplate({ ...template, is_quick_workout: e.target.checked })}
        />
        Show in Quick Workouts
      </label>

      {repeated.length > 0 && (
        <p className="atlas-template-editor__repeat-warning" role="alert">
          {repeated.map((id) => exerciseNames.get(id) ?? 'An exercise').join(', ')}{' '}
          {repeated.length === 1 ? 'appears' : 'appear'} more than once. A workout keeps one entry
          per exercise, so a repeat is merged into the first when the workout starts, adding up the
          sets. Remove the repeat to keep its own reps and load.
        </p>
      )}

      {coverage.byGroup.length > 0 && (
        <section className="atlas-template-editor__coverage">
          <h2>Planned Muscle Coverage</h2>
          <BodyMap states={coverageStates} />
          <ul
            className="atlas-template-editor__muscle-preview"
            aria-label="Planned working sets by muscle group"
          >
            {coverage.byGroup.map((entry) => (
              <li key={entry.label}>
                {entry.label} <strong>{entry.workingSets}</strong>{' '}
                {entry.workingSets === 1 ? 'set' : 'sets'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {slots.map((slot) =>
        slot.kind === 'single' ? (
          <ul key={slot.planned.id} className="atlas-template-editor__exercises">
            {exerciseRow(slot.planned, template.exercises.indexOf(slot.planned), false)}
          </ul>
        ) : (
          <div key={slot.group.id} className="atlas-template-editor__group">
            <div className="atlas-template-editor__group-header">
              <span>
                {slot.group.type === 'superset' ? 'Superset' : 'Circuit'} &middot;{' '}
                {slot.group.rounds} rounds
                {slot.group.rest_after_seconds != null &&
                  ` · Rest ${slot.group.rest_after_seconds}s after`}
              </span>
              <button type="button" onClick={() => ungroup(slot.group.id)}>
                Ungroup
              </button>
            </div>
            <ul className="atlas-template-editor__exercises">
              {slot.members.map((member) =>
                exerciseRow(member, template.exercises.indexOf(member), true),
              )}
            </ul>
          </div>
        ),
      )}

      <div className="atlas-template-editor__toolbar">
        <button type="button" className="atlas-library__create" onClick={() => setPicking(true)}>
          + Add Exercise
        </button>
        {selected.size >= 2 && !groupingDraft && (
          <button
            type="button"
            className="atlas-btn atlas-btn--secondary"
            onClick={() => setGroupingDraft({ type: 'superset', rounds: 3, restSeconds: 90 })}
          >
            Group Selected ({selected.size})
          </button>
        )}
      </div>

      {groupingDraft && (
        <div className="atlas-template-editor__group-draft">
          <label>
            Type
            <select
              value={groupingDraft.type}
              onChange={(e) =>
                setGroupingDraft({ ...groupingDraft, type: e.target.value as ExerciseGroupType })
              }
            >
              <option value="superset">Superset</option>
              <option value="circuit">Circuit</option>
            </select>
          </label>
          <NumberField
            label="Rounds"
            min={1}
            max={PLAN_LIMITS.sets}
            value={groupingDraft.rounds}
            onChange={(v) => setGroupingDraft({ ...groupingDraft, rounds: v ?? 1 })}
          />
          <NumberField
            label="Rest after (sec)"
            min={0}
            max={PLAN_LIMITS.seconds}
            value={groupingDraft.restSeconds}
            onChange={(v) => setGroupingDraft({ ...groupingDraft, restSeconds: v })}
          />
          <div className="atlas-template-editor__group-draft-actions">
            <button
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={() => setGroupingDraft(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="atlas-btn atlas-btn--primary"
              onClick={confirmGrouping}
            >
              Confirm Group
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <p className="atlas-template-editor__repeat-warning" role="alert">
          {saveError}
        </p>
      )}

      {confirmingDelete ? (
        <div
          ref={confirmRef}
          className="atlas-inline-confirm"
          role="group"
          aria-label={`Delete ${template.name.trim() || 'this workout'}?`}
        >
          <p>
            Delete {template.name.trim() || 'this workout'}? Past workouts stay in your history; a
            program day that uses it will have no workout. This can&rsquo;t be undone.
          </p>
          <button
            type="button"
            className="atlas-btn atlas-btn--secondary"
            onClick={() => setConfirmingDelete(false)}
          >
            Keep it
          </button>
          <button
            type="button"
            className="atlas-btn atlas-btn--primary"
            onClick={() => void handleDelete()}
          >
            Delete {template.name.trim() || 'workout'}
          </button>
        </div>
      ) : (
        <div className="atlas-template-editor__actions">
          {templateId && (
            <>
              <button type="button" onClick={() => void handleDuplicate()}>
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-expanded={confirmingDelete}
              >
                Delete…
              </button>
            </>
          )}
          <button
            type="button"
            className="atlas-template-editor__save"
            onClick={() => void handleSave()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
