import { useEffect, useRef, useState } from 'react';
import { calculatePlateBreakdown, DEFAULT_AVAILABLE_PLATES } from '@atlas/workout-engine';
import { equipmentUnavailable } from '@atlas/equipment-engine';
import { suggestSubstitutes } from '@atlas/substitution-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, PlannedExercise, WorkoutSession } from '@atlas/data-model';
import { formatSessionDate } from '../history/formatSessionDate';
import { useModalFocus } from '../a11y/useModalFocus';

type SheetView = 'menu' | 'history' | 'plates' | 'why' | 'alternatives';

interface ExerciseContextSheetProps {
  exercise: Exercise;
  planned: PlannedExercise;
  allSessions: WorkoutSession[];
  library: Exercise[];
  /** vNext Handoff 04B. The kinds of equipment known to be at the workout's place -- the legacy list unioned with the kinds of the structured equipment configured there -- or null when nothing is known yet (then nothing is ever flagged unavailable). */
  equipmentInventory: string[] | null;
  /** The workout's place, for the alternatives heading. */
  locationName: string | null;
  canGroupWithNext?: boolean;
  onGroupWithNext?: () => void;
  onClose: () => void;
}

function formatSetLine(set: WorkoutSession['performed_sets'][number]): string {
  if (set.weight != null && set.reps != null) return `${set.weight} × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.duration_seconds != null) return `${set.duration_seconds}s`;
  if (set.distance_meters != null) return `${set.distance_meters}m`;
  return '—';
}

/** Recent sessions' sets for this exercise, most recent first -- unlike
 * `previousPerformance` (which stops at the first match, for prefill),
 * this keeps several sessions for a genuine "history" view. */
function recentHistory(sessions: WorkoutSession[], exerciseId: string, limit = 5) {
  return sessions
    .filter(
      (s) =>
        s.status === 'completed' && s.performed_sets.some((set) => set.exercise_id === exerciseId),
    )
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, limit)
    .map((session) => ({
      session,
      sets: session.performed_sets
        .filter((set) => set.exercise_id === exerciseId)
        .sort((a, b) => a.set_index - b.set_index),
    }));
}

/** History / Plate Calculator / Why(progression) -- a bottom-sheet overlay
 * reached from ExerciseLogger's "..." menu (v0.2.0 item 31), so secondary
 * info doesn't compete with primary set-logging controls but also never
 * requires leaving the active workout to see. */
export function ExerciseContextSheet({
  exercise,
  planned,
  allSessions,
  library,
  equipmentInventory,
  locationName,
  canGroupWithNext,
  onGroupWithNext,
  onClose,
}: ExerciseContextSheetProps) {
  const [view, setView] = useState<SheetView>('menu');
  // A modal dialog: focus moves in and stays in, Escape closes it, and focus returns to the "..." that opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, onClose);
  // The control just activated is replaced by the next view -- put focus on that view's first control (not Close).
  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>(
        '.atlas-context-sheet__panel :is(button, input):not(.atlas-context-sheet__close)',
      )
      ?.focus();
  }, [view]);
  const isWeighted = exercise.measurement_type === 'reps_weight';
  const decision = planned.progression_decision;

  const [plateTarget, setPlateTarget] = useState(String(planned.target_weight ?? 135));
  const [barWeight, setBarWeight] = useState('45');
  const breakdown = calculatePlateBreakdown(
    Number(plateTarget) || 0,
    Number(barWeight) || 0,
    DEFAULT_AVAILABLE_PLATES,
  );

  // No known inventory (no place, or a place that is only a name): equipment-aware
  // substitutions are simply off -- every exercise is "available".
  const unavailable = equipmentUnavailable(exercise.equipment, equipmentInventory);
  const alternatives = equipmentInventory
    ? suggestSubstitutes(exercise, library, {
        availableEquipment: equipmentInventory,
        limit: 5,
      })
    : [];

  return (
    <div
      ref={dialogRef}
      className="atlas-context-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`${formatExerciseName(exercise.name)} options`}
      tabIndex={-1}
    >
      <div className="atlas-context-sheet__panel">
        <button
          type="button"
          className="atlas-context-sheet__close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        {view === 'menu' && (
          <>
            <h3>{formatExerciseName(exercise.name)}</h3>
            <ul className="atlas-program-screen__list">
              <li>
                <button type="button" onClick={() => setView('history')}>
                  History
                </button>
              </li>
              {canGroupWithNext && onGroupWithNext && (
                <li>
                  <button type="button" onClick={onGroupWithNext}>
                    Create Superset with Next
                  </button>
                </li>
              )}
              {unavailable && (
                <li>
                  <button type="button" onClick={() => setView('alternatives')}>
                    Equipment unavailable — see alternatives
                  </button>
                </li>
              )}
              {isWeighted && (
                <li>
                  <button type="button" onClick={() => setView('plates')}>
                    Plate Calculator
                  </button>
                </li>
              )}
              {decision && (
                <li>
                  <button type="button" onClick={() => setView('why')}>
                    Why this target?
                  </button>
                </li>
              )}
            </ul>
          </>
        )}

        {view === 'history' && (
          <div>
            <h3>History &middot; {formatExerciseName(exercise.name)}</h3>
            {recentHistory(allSessions, exercise.id).length === 0 && <p>No prior sessions yet.</p>}
            {recentHistory(allSessions, exercise.id).map(({ session, sets }) => (
              <div key={session.id} className="atlas-context-sheet__history-row">
                <span className="atlas-library__item-meta">{formatSessionDate(session)}</span>
                <span>{sets.map(formatSetLine).join(', ')}</span>
              </div>
            ))}
            <button
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={() => setView('menu')}
            >
              Back
            </button>
          </div>
        )}

        {view === 'plates' && (
          <div>
            <h3>Plate Calculator</h3>
            <label className="atlas-context-sheet__field">
              Total weight
              <input
                type="number"
                inputMode="decimal"
                value={plateTarget}
                onChange={(e) => setPlateTarget(e.target.value)}
              />
            </label>
            <label className="atlas-context-sheet__field">
              Bar weight
              <input
                type="number"
                inputMode="decimal"
                value={barWeight}
                onChange={(e) => setBarWeight(e.target.value)}
              />
            </label>
            <p>Per side: {breakdown.perSide.length > 0 ? breakdown.perSide.join(' + ') : 'none'}</p>
            <p>
              Total: {breakdown.actualTotal} lb
              {!breakdown.exact && ` (closest to ${breakdown.requestedTotal} with your plates)`}
            </p>
            <button
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={() => setView('menu')}
            >
              Back
            </button>
          </div>
        )}

        {view === 'why' && decision && (
          <div>
            <h3>Target</h3>
            <p>
              {[
                planned.target_weight != null ? `${planned.target_weight} lb` : null,
                planned.target_reps_min != null
                  ? `× ${planned.target_reps_min}${
                      planned.target_reps_max && planned.target_reps_max !== planned.target_reps_min
                        ? `–${planned.target_reps_max}`
                        : ''
                    }`
                  : null,
                planned.target_duration_seconds != null
                  ? `${planned.target_duration_seconds}s`
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
            <h4>Why?</h4>
            {decision.previous_target && (
              <p>
                Last session:{' '}
                {[
                  decision.previous_target.target_weight != null
                    ? `${decision.previous_target.target_weight} lb`
                    : null,
                  decision.previous_target.target_reps_min != null
                    ? `× ${decision.previous_target.target_reps_min}${
                        decision.previous_target.target_reps_max &&
                        decision.previous_target.target_reps_max !==
                          decision.previous_target.target_reps_min
                          ? `–${decision.previous_target.target_reps_max}`
                          : ''
                      }`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </p>
            )}
            <p>Policy: {decision.policy.replace('_', ' ')}</p>
            <p>{decision.decision_summary}</p>
            <button
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={() => setView('menu')}
            >
              Back
            </button>
          </div>
        )}

        {view === 'alternatives' && equipmentInventory && (
          <div>
            <h3>Alternatives{locationName ? ` -- ${locationName}` : ''}</h3>
            <p>
              {formatExerciseName(exercise.name)} needs {exercise.equipment.join(', ')}, which
              isn&rsquo;t among the equipment you&rsquo;ve set up here.
            </p>
            {alternatives.length === 0 ? (
              <p>No alternative found with your available equipment.</p>
            ) : (
              <ul className="atlas-program-screen__list">
                {alternatives.map((candidate) => (
                  <li key={candidate.exercise.id}>
                    <span className="atlas-library__item-name" aria-hidden="true">
                      {formatExerciseName(candidate.exercise.name)}
                    </span>
                    <span className="atlas-library__item-meta" aria-hidden="true">
                      {candidate.reasons.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="atlas-settings__hint">
              Suggestions only -- switching exercises here doesn't change the plan; use Replace from
              the exercise menu if you want to swap it in.
            </p>
            <button
              type="button"
              className="atlas-btn atlas-btn--secondary"
              onClick={() => setView('menu')}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
