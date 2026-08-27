import { useEffect, useState } from 'react';
import {
  createPlannedExercise,
  createWorkoutTemplate,
  duplicateWorkoutTemplate,
  reorder,
  withSequentialOrder,
} from '@atlas/workout-engine';
import type { Exercise, PlannedExercise, WorkoutTemplate } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { ExercisePicker } from './ExercisePicker';
import { NumberField } from './NumberField';

interface TemplateEditorProps {
  storage: AtlasStorage;
  templateId: string | null;
  isQuickWorkoutDefault: boolean;
  onDone: () => void;
}

export function TemplateEditor({
  storage,
  templateId,
  isQuickWorkoutDefault,
  onDone,
}: TemplateEditorProps) {
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    void (async () => {
      const existing = templateId ? await storage.workoutTemplates.get(templateId) : undefined;
      setTemplate(existing ?? createWorkoutTemplate('', isQuickWorkoutDefault));
      const allExercises = await storage.exercises.getAll();
      setExerciseNames(new Map(allExercises.map((e) => [e.id, e.name])));
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

  function updateExercise(index: number, patch: Partial<PlannedExercise>) {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)),
      };
    });
  }

  function removeExercise(index: number) {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: withSequentialOrder(prev.exercises.filter((_, i) => i !== index)),
      };
    });
  }

  function moveExercise(index: number, direction: -1 | 1) {
    setTemplate((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.exercises.length) return prev;
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
    setExerciseNames((prev) => new Map(prev).set(exercise.id, exercise.name));
    setPicking(false);
  }

  async function handleSave() {
    if (!template) return;
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
      />
    );
  }

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

      <ul className="atlas-template-editor__exercises">
        {template.exercises.map((exercise, index) => (
          <li key={exercise.id} className="atlas-template-editor__exercise">
            <div className="atlas-template-editor__exercise-header">
              <span>{exerciseNames.get(exercise.exercise_id) ?? 'Unknown exercise'}</span>
              <div className="atlas-template-editor__exercise-actions">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveExercise(index, -1)}
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === template.exercises.length - 1}
                  onClick={() => moveExercise(index, 1)}
                >
                  &darr;
                </button>
                <button
                  type="button"
                  aria-label="Remove exercise"
                  onClick={() => removeExercise(index)}
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="atlas-template-editor__exercise-fields">
              <NumberField
                label="Sets"
                min={0}
                value={exercise.target_sets}
                onChange={(v) => updateExercise(index, { target_sets: v })}
              />
              <NumberField
                label="Reps min"
                min={0}
                value={exercise.target_reps_min}
                onChange={(v) => updateExercise(index, { target_reps_min: v })}
              />
              <NumberField
                label="Reps max"
                min={0}
                value={exercise.target_reps_max}
                onChange={(v) => updateExercise(index, { target_reps_max: v })}
              />
              <NumberField
                label="Weight"
                min={0}
                value={exercise.target_weight}
                onChange={(v) => updateExercise(index, { target_weight: v })}
              />
              <NumberField
                label="RPE"
                min={0}
                max={10}
                value={exercise.target_rpe}
                onChange={(v) => updateExercise(index, { target_rpe: v })}
              />
              <NumberField
                label="RIR"
                min={0}
                value={exercise.target_rir}
                onChange={(v) => updateExercise(index, { target_rir: v })}
              />
              <NumberField
                label="Rest (sec)"
                min={0}
                value={exercise.rest_seconds}
                onChange={(v) => updateExercise(index, { rest_seconds: v })}
              />
              <NumberField
                label="Duration (sec)"
                min={0}
                value={exercise.target_duration_seconds}
                onChange={(v) => updateExercise(index, { target_duration_seconds: v })}
              />
              <NumberField
                label="Distance (m)"
                min={0}
                value={exercise.target_distance_meters}
                onChange={(v) => updateExercise(index, { target_distance_meters: v })}
              />
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="atlas-library__create" onClick={() => setPicking(true)}>
        + Add Exercise
      </button>

      <div className="atlas-template-editor__actions">
        {templateId && (
          <>
            <button type="button" onClick={() => void handleDuplicate()}>
              Duplicate
            </button>
            <button type="button" onClick={() => void handleDelete()}>
              Delete
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
    </div>
  );
}
