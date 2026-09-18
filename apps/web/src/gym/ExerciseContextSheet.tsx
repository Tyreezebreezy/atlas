import { useState } from 'react';
import { calculatePlateBreakdown, DEFAULT_AVAILABLE_PLATES } from '@atlas/workout-engine';
import { suggestSubstitutes } from '@atlas/substitution-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, PlannedExercise, WorkoutSession } from '@atlas/data-model';
import { loadSettings } from '../settings/settings';

type SheetView = 'menu' | 'history' | 'plates' | 'why' | 'alternatives';

interface ExerciseContextSheetProps {
  exercise: Exercise;
  planned: PlannedExercise;
  allSessions: WorkoutSession[];
  library: Exercise[];
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
  canGroupWithNext,
  onGroupWithNext,
  onClose,
}: ExerciseContextSheetProps) {
  const [view, setView] = useState<SheetView>('menu');
  const isWeighted = exercise.measurement_type === 'reps_weight';
  const decision = planned.progression_decision;

  const [plateTarget, setPlateTarget] = useState(String(planned.target_weight ?? 135));
  const [barWeight, setBarWeight] = useState('45');
  const breakdown = calculatePlateBreakdown(
    Number(plateTarget) || 0,
    Number(barWeight) || 0,
    DEFAULT_AVAILABLE_PLATES,
  );

  const settings = loadSettings();
  const activeProfile = settings.equipmentProfiles.find(
    (p) => p.id === settings.activeEquipmentProfileId,
  );
  // No profile active: equipment-aware substitutions are simply off (see
  // settings.ts's doc comment) -- every exercise is "available."
  const equipmentUnavailable =
    !!activeProfile &&
    exercise.equipment.length > 0 &&
    !exercise.equipment.some((eq) => activeProfile.equipment.includes(eq));
  const alternatives = activeProfile
    ? suggestSubstitutes(exercise, library, {
        availableEquipment: activeProfile.equipment,
        limit: 5,
      })
    : [];

  return (
    <div
      className="atlas-context-sheet"
      role="dialog"
      aria-label={`${formatExerciseName(exercise.name)} options`}
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
            {equipmentUnavailable && (
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
        )}

        {view === 'history' && (
          <div>
            <h3>History &middot; {formatExerciseName(exercise.name)}</h3>
            {recentHistory(allSessions, exercise.id).length === 0 && <p>No prior sessions yet.</p>}
            {recentHistory(allSessions, exercise.id).map(({ session, sets }) => (
              <div key={session.id} className="atlas-context-sheet__history-row">
                <span className="atlas-library__item-meta">
                  {new Date(session.completed_at ?? session.started_at).toLocaleDateString(
                    undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                    },
                  )}
                </span>
                <span>{sets.map(formatSetLine).join(', ')}</span>
              </div>
            ))}
            <button type="button" onClick={() => setView('menu')}>
              Back
            </button>
          </div>
        )}

        {view === 'plates' && (
          <div>
            <h3>Plate Calculator</h3>
            <label>
              Total weight
              <input
                type="number"
                inputMode="decimal"
                value={plateTarget}
                onChange={(e) => setPlateTarget(e.target.value)}
              />
            </label>
            <label>
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
            <button type="button" onClick={() => setView('menu')}>
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
            <button type="button" onClick={() => setView('menu')}>
              Back
            </button>
          </div>
        )}

        {view === 'alternatives' && activeProfile && (
          <div>
            <h3>Alternatives -- {activeProfile.name}</h3>
            <p>
              {formatExerciseName(exercise.name)} needs {exercise.equipment.join(', ')}, not in your
              active equipment profile.
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
            <button type="button" onClick={() => setView('menu')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
