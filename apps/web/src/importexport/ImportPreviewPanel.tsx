import { useState } from 'react';
import type { Exercise } from '@atlas/data-model';
import type {
  ImportPreview,
  ImportPreviewExercise,
  ImportPreviewWorkout,
  ImportResolutions,
} from '@atlas/import-export';
import { ExercisePicker } from '../program/ExercisePicker';
import { useStorage } from '../storage/StorageContext';

interface ExerciseRowProps {
  entry: ImportPreviewExercise;
  resolution: ImportResolutions[string] | undefined;
  onResolve: (key: string, resolution: ImportResolutions[string]) => void;
}

function targetSummary(entry: ImportPreviewExercise): string {
  const { planned } = entry;
  const parts: string[] = [];
  if (planned.target_sets != null) {
    const reps =
      planned.target_reps_min != null && planned.target_reps_max != null
        ? planned.target_reps_min === planned.target_reps_max
          ? `${planned.target_reps_min}`
          : `${planned.target_reps_min}-${planned.target_reps_max}`
        : null;
    parts.push(reps ? `${planned.target_sets} × ${reps}` : `${planned.target_sets} sets`);
  }
  if (planned.target_weight != null) parts.push(`${planned.target_weight} lb`);
  if (planned.target_duration_seconds != null) parts.push(`${planned.target_duration_seconds}s`);
  if (planned.target_distance_meters != null) parts.push(`${planned.target_distance_meters}m`);
  if (planned.rest_seconds != null) parts.push(`rest ${planned.rest_seconds}s`);
  if (planned.target_rpe != null) parts.push(`RPE ${planned.target_rpe}`);
  if (planned.target_rir != null) parts.push(`RIR ${planned.target_rir}`);
  return parts.join(' · ') || 'No targets parsed';
}

function ExerciseRow({ entry, resolution, onResolve }: ExerciseRowProps) {
  const storage = useStorage();
  const [showPicker, setShowPicker] = useState(false);
  const isUnresolved = entry.match.confidence === 'unresolved';
  const effective: ImportResolutions[string] | null =
    resolution ??
    (isUnresolved ? null : { action: 'use_match', exercise_id: entry.match.matched_exercise!.id });

  if (showPicker && storage) {
    return (
      <li className="atlas-importexport__row atlas-importexport__row--picking">
        <ExercisePicker
          storage={storage}
          onPick={(exercise: Exercise) => {
            onResolve(entry.key, { action: 'use_match', exercise_id: exercise.id });
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
        />
      </li>
    );
  }

  return (
    <li className="atlas-importexport__row">
      <div className="atlas-importexport__row-main">
        <span className="atlas-importexport__row-name">{entry.planned.exercise_name}</span>
        <span className="atlas-importexport__row-targets">{targetSummary(entry)}</span>
        {entry.warnings.map((warning) => (
          <span key={warning.message} className="atlas-importexport__row-warning">
            {warning.message}
          </span>
        ))}
      </div>

      {!isUnresolved ? (
        <span className="atlas-importexport__row-match">
          Matched: {entry.match.matched_exercise?.name}
          {entry.match.confidence !== 'exact' && ` (${entry.match.confidence})`}
        </span>
      ) : (
        <div className="atlas-importexport__row-resolve">
          <span className="atlas-importexport__row-warning">
            Not matched to the exercise library.
          </span>
          {entry.match.candidates.length > 0 && (
            <div className="atlas-importexport__candidates">
              {entry.match.candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={
                    effective?.action === 'use_match' && effective.exercise_id === candidate.id
                  }
                  onClick={() =>
                    onResolve(entry.key, { action: 'use_match', exercise_id: candidate.id })
                  }
                >
                  Use &ldquo;{candidate.name}&rdquo;
                </button>
              ))}
            </div>
          )}
          <div className="atlas-importexport__candidates">
            <button type="button" onClick={() => setShowPicker(true)}>
              Search library…
            </button>
            <button
              type="button"
              aria-pressed={effective?.action === 'create_custom'}
              onClick={() => onResolve(entry.key, { action: 'create_custom' })}
            >
              Create custom exercise
            </button>
            <button
              type="button"
              aria-pressed={effective?.action === 'skip'}
              onClick={() => onResolve(entry.key, { action: 'skip' })}
            >
              Skip this exercise
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function WorkoutPreview({
  workout,
  resolutions,
  onResolve,
}: {
  workout: ImportPreviewWorkout;
  resolutions: ImportResolutions;
  onResolve: (key: string, resolution: ImportResolutions[string]) => void;
}) {
  return (
    <div className="atlas-importexport__workout">
      {workout.warnings.map((warning) => (
        <p key={warning.message} className="atlas-importexport__warning-banner">
          {warning.message}
        </p>
      ))}
      <ul className="atlas-importexport__row-list">
        {workout.exercises.map((entry) => (
          <ExerciseRow
            key={entry.key}
            entry={entry}
            resolution={resolutions[entry.key]}
            onResolve={onResolve}
          />
        ))}
      </ul>
    </div>
  );
}

interface ImportPreviewPanelProps {
  preview: ImportPreview;
  resolutions: ImportResolutions;
  onResolve: (key: string, resolution: ImportResolutions[string]) => void;
  onApprove: () => void;
  onCancel: () => void;
  saving: boolean;
}

/** Nothing is saved by this component -- it only lets the user inspect the
 * parsed/matched structure and resolve unresolved exercises before choosing
 * Approve, per docs/IMPORT_FORMAT.md's pipeline. */
export function ImportPreviewPanel({
  preview,
  resolutions,
  onResolve,
  onApprove,
  onCancel,
  saving,
}: ImportPreviewPanelProps) {
  const unresolvedRemaining =
    preview.kind === 'workout'
      ? preview.workout.exercises.filter(
          (e) => e.match.confidence === 'unresolved' && !resolutions[e.key],
        ).length
      : preview.program.weeks
          .flatMap((w) => w.days)
          .flatMap((d) => d.workout.exercises)
          .filter((e) => e.match.confidence === 'unresolved' && !resolutions[e.key]).length;

  return (
    <div className="atlas-importexport__preview">
      <h1>Review Import</h1>
      {preview.kind === 'workout' ? (
        <>
          <h2>{preview.workout.name}</h2>
          <WorkoutPreview
            workout={preview.workout}
            resolutions={resolutions}
            onResolve={onResolve}
          />
        </>
      ) : (
        <>
          <h2>{preview.program.name}</h2>
          {preview.program.warnings.map((warning) => (
            <p key={warning.message} className="atlas-importexport__warning-banner">
              {warning.message}
            </p>
          ))}
          {preview.program.weeks.map((week, weekIndex) => (
            <section key={weekIndex}>
              {week.label && <h3>{week.label}</h3>}
              {week.days.map((day, dayIndex) => (
                <div key={dayIndex} className="atlas-importexport__day">
                  <h4>{day.label}</h4>
                  <WorkoutPreview
                    workout={day.workout}
                    resolutions={resolutions}
                    onResolve={onResolve}
                  />
                </div>
              ))}
            </section>
          ))}
        </>
      )}

      <div className="atlas-importexport__actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="atlas-importexport__approve"
          onClick={onApprove}
          disabled={saving || unresolvedRemaining > 0}
        >
          {saving ? 'Saving…' : 'Approve & Save'}
        </button>
      </div>
      {unresolvedRemaining > 0 && (
        <p className="atlas-importexport__row-warning">
          Resolve {unresolvedRemaining} remaining unmatched exercise
          {unresolvedRemaining === 1 ? '' : 's'} before saving.
        </p>
      )}
    </div>
  );
}
