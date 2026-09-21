import { Fragment, useEffect, useState } from 'react';
import {
  type LogSetInput,
  remainingSeconds,
  restTimerEnabled,
  setPhaseOf,
  setTypeOf,
} from '@atlas/workout-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type {
  Exercise,
  PersonalRecord,
  PerformedSet,
  PlannedExercise,
  SetPhase,
  SetType,
  TimerState,
  WorkoutSession,
} from '@atlas/data-model';
import { describePR } from '../progress/formatPR';
import { loadSettings } from '../settings/settings';
import { ExerciseMedia } from '../library/ExerciseMedia';
import { ExerciseContextSheet } from './ExerciseContextSheet';
import { initialDraftValues, type DraftSetKind, type DraftValues } from './draftValues';

/** One user-facing choice per row, covering both the phase (warmup/work)
 * and sub-type (normal/amrap/drop/failure/rest_pause) dimensions the
 * v0.2.0 data model splits apart -- kept as a single dropdown since the
 * owner never needs to pick phase and type independently in practice: a
 * warm-up set is never also an AMRAP or drop set. See
 * docs/PROGRESSION.md "Set phase migration." */

const DRAFT_KIND_LABELS: Record<DraftSetKind, string> = {
  normal: 'Working',
  warmup: 'Warm-up',
  drop: 'Drop',
  amrap: 'AMRAP',
  failure: 'Failure',
  rest_pause: 'Rest-Pause',
};

function phaseAndTypeForKind(kind: DraftSetKind): { phase: SetPhase; setType: SetType } {
  if (kind === 'warmup') return { phase: 'warmup', setType: 'normal' };
  return { phase: 'work', setType: kind };
}

/** Inverse of `phaseAndTypeForKind`, for displaying an already-completed set. */
function draftKindOf(set: PerformedSet): DraftSetKind {
  if (setPhaseOf(set) === 'warmup') return 'warmup';
  return setTypeOf(set) as DraftSetKind;
}

// ponytail: TimerState always needs a fixed duration/ends_at, so a timed
// exercise with no target duration still needs *some* ceiling to start a
// timer against. No real working set runs an hour; revisit if a genuinely
// open-ended stopwatch mode is ever requested.
const OPEN_ENDED_EXERCISE_SECONDS = 3600;

interface TimedDurationCellProps {
  targetSeconds: number | null;
  activeTimer: TimerState | null;
  draftValue: string;
  onStart: (durationSeconds: number) => void;
  onStop: () => void;
  onManualChange: (value: string) => void;
}

/** Not started -> optional local pre-countdown (ephemeral, never persisted) -> running (persisted TimerState, timestamp-derived) -> stopped, draft pre-filled with elapsed seconds. */
function TimedDurationCell({
  targetSeconds,
  activeTimer,
  draftValue,
  onStart,
  onStop,
  onManualChange,
}: TimedDurationCellProps) {
  const [settings] = useState(loadSettings);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onStart(targetSeconds ?? OPEN_ENDED_EXERCISE_SECONDS);
      return;
    }
    const timeout = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(timeout);
  }, [countdown, onStart, targetSeconds]);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  if (countdown !== null) {
    return (
      <span className="atlas-timed-cell__countdown" aria-live="polite">
        {countdown}&hellip;
      </span>
    );
  }

  if (activeTimer) {
    const remaining = remainingSeconds(activeTimer);
    const elapsed = activeTimer.duration_seconds - remaining;
    const display = targetSeconds != null ? remaining : elapsed;
    return (
      <span className="atlas-timed-cell__running">
        <span aria-live="polite">{display}s</span>
        <button type="button" onClick={onStop}>
          Stop
        </button>
      </span>
    );
  }

  return (
    <span className="atlas-timed-cell__idle">
      <input
        type="number"
        inputMode="numeric"
        aria-label="Seconds"
        value={draftValue}
        onChange={(e) => onManualChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        onClick={() =>
          settings.preCountdownEnabled
            ? setCountdown(settings.preCountdownSeconds)
            : onStart(targetSeconds ?? OPEN_ENDED_EXERCISE_SECONDS)
        }
      >
        Start
      </button>
    </span>
  );
}

interface ExerciseLoggerProps {
  exercise: Exercise;
  planned: PlannedExercise;
  performedSets: PerformedSet[];
  previousSets: PerformedSet[];
  bestPR: PersonalRecord | null;
  activeTimer: TimerState | null;
  allSessions: WorkoutSession[];
  library: Exercise[];
  /** v0.2.5. Optional-exercise status badge. */
  isOptional?: boolean;
  /** v0.2.5. Size of this exercise's OR-slot ("Choose 1 of N"), if any. */
  orGroupCount?: number | null;
  /** v0.2.5. Explicit work-timer length, if this slot has one. */
  workTimerSeconds?: number | null;
  /** v0.2.5. Paired-block position label ("A1", "B2", ...) when this
   * exercise is a member of a superset/circuit group. */
  pairLabel?: string | null;
  /** v0.2.5. Persist the owner's editable goal (reps or duration) for this
   * exercise, separately from logged actuals. */
  onSetGoal?: (goal: { goal_reps?: number | null; goal_duration_seconds?: number | null }) => void;
  canGroupWithNext?: boolean;
  onGroupWithNext?: () => void;
  onCompleteSet: (input: LogSetInput) => void;
  onRemoveCompletedSet: (setId: string) => void;
  onStartExerciseTimer: (durationSeconds: number) => void;
  onStopExerciseTimer: () => void;
}

function formatSet(set: PerformedSet): string {
  if (set.weight != null && set.reps != null) return `${set.weight} × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.duration_seconds != null) return `${set.duration_seconds}s`;
  if (set.distance_meters != null) return `${set.distance_meters}m`;
  return '—';
}

function formatSeconds(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}:00` : `${minutes}:${String(rest).padStart(2, '0')}`;
  }
  return `0:${String(seconds).padStart(2, '0')}`;
}

/** v0.2.5. The Program prescription as a plain range/target string -- the
 * "Program: 6–10 reps" or "Program: 30 sec" line, distinct from the owner's
 * editable Goal and from the Actual they actually hit. */
function programRange(planned: PlannedExercise): string {
  if (planned.target_duration_seconds != null) return `${planned.target_duration_seconds} sec`;
  if (planned.target_distance_meters != null) return `${planned.target_distance_meters} m`;
  const min = planned.target_reps_min;
  const max = planned.target_reps_max;
  if (min != null && max != null && max !== min) return `${min}–${max} reps`;
  if (min != null) return `${min} reps`;
  if (max != null) return `${max} reps`;
  return '—';
}

export function ExerciseLogger({
  exercise,
  planned,
  performedSets,
  previousSets,
  bestPR,
  activeTimer,
  allSessions,
  library,
  isOptional,
  orGroupCount,
  workTimerSeconds,
  pairLabel,
  onSetGoal,
  canGroupWithNext,
  onGroupWithNext,
  onCompleteSet,
  onRemoveCompletedSet,
  onStartExerciseTimer,
  onStopExerciseTimer,
}: ExerciseLoggerProps) {
  const plannedRowCount = planned.target_sets ?? Math.max(performedSets.length, 1);
  const [extraRows, setExtraRows] = useState(0);
  const [showContextSheet, setShowContextSheet] = useState(false);
  const totalRows = Math.max(plannedRowCount, performedSets.length) + extraRows;
  // Only one timer can run at a time (session.active_timer is a single slot),
  // so only the next not-yet-completed row ever offers Start/Stop; any extra
  // draft rows beyond it fall back to plain manual entry.
  const nextDraftIndex = performedSets.length;

  const [drafts, setDrafts] = useState<Record<number, DraftValues>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** v1.0.0 (H1). Which draft row's optional details (RPE / RIR / notes) are
   * expanded, if any -- kept collapsed by default so the primary
   * weight/reps logging path stays fast on a phone. */
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  const showsWeight = exercise.measurement_type === 'reps_weight';
  const showsExternalLoad = exercise.measurement_type === 'reps_bodyweight';
  const showsReps =
    exercise.measurement_type === 'reps_weight' ||
    exercise.measurement_type === 'reps' ||
    exercise.measurement_type === 'reps_bodyweight';
  const showsDuration =
    exercise.measurement_type === 'time' || exercise.measurement_type === 'distance_time';
  const showsDistance =
    exercise.measurement_type === 'distance' || exercise.measurement_type === 'distance_time';

  // v0.2.5. Editable Goal, kept as local string state for smooth typing and
  // committed to the session on each change via onSetGoal. Initialized from
  // the plan's own goal (goal_reps for reps, goal_duration_seconds for
  // timed); empty = "no goal chosen yet", never silently defaulted to the
  // top of the rep range.
  const [goalDraft, setGoalDraft] = useState<string>(() => {
    if (showsDuration) {
      return planned.goal_duration_seconds != null ? String(planned.goal_duration_seconds) : '';
    }
    return planned.goal_reps != null ? String(planned.goal_reps) : '';
  });

  function handleGoalChange(value: string) {
    setGoalDraft(value);
    if (!onSetGoal) return;
    const parsed = value === '' ? null : Number(value);
    const goal = Number.isFinite(parsed) ? parsed : null;
    if (showsDuration) onSetGoal({ goal_duration_seconds: goal });
    else onSetGoal({ goal_reps: goal });
  }

  /** v0.2.5. The goal shown per row (shared, one goal per exercise). */
  function goalForRow(): string {
    if (showsDuration) {
      return planned.goal_duration_seconds != null ? String(planned.goal_duration_seconds) : '—';
    }
    return planned.goal_reps != null ? String(planned.goal_reps) : '—';
  }

  function draftFor(index: number): DraftValues {
    const existing = drafts[index];
    if (existing) return existing;
    return initialDraftValues(exercise, planned, performedSets, previousSets);
  }

  function updateDraft(index: number, patch: Partial<DraftValues>) {
    setDrafts((prev) => ({ ...prev, [index]: { ...draftFor(index), ...patch } }));
  }

  function handleComplete(index: number) {
    const draft = draftFor(index);
    // Completing a timed set while its own exercise timer is still running
    // (never hit "Stop" first) must not silently log a null duration -- fall
    // back to the live elapsed time from the timer itself, same calculation
    // "Stop" already does. A manually-entered/edited draft value still wins.
    const runningTimer =
      index === nextDraftIndex &&
      activeTimer?.kind === 'exercise' &&
      activeTimer.exercise_id === exercise.id
        ? activeTimer
        : null;
    const durationFromTimer = runningTimer
      ? runningTimer.duration_seconds - remainingSeconds(runningTimer)
      : null;
    const durationValue = draft.duration !== '' ? Number(draft.duration) : durationFromTimer;
    const { phase, setType } = phaseAndTypeForKind(draft.kind);

    onCompleteSet({
      exerciseId: exercise.id,
      setIndex: index,
      phase,
      setType,
      weight: showsWeight && draft.weight !== '' ? Number(draft.weight) : null,
      externalLoad:
        showsExternalLoad && draft.externalLoad !== '' ? Number(draft.externalLoad) : null,
      reps: showsReps && draft.reps !== '' ? Number(draft.reps) : null,
      durationSeconds: showsDuration ? durationValue : null,
      distanceMeters: showsDistance && draft.distance !== '' ? Number(draft.distance) : null,
      rpe: draft.rpe !== '' ? Number(draft.rpe) : null,
      rir: draft.rir !== '' ? Number(draft.rir) : null,
      notes: draft.notes.trim() !== '' ? draft.notes.trim() : null,
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  return (
    <div className="atlas-gym-exercise">
      <div className="atlas-gym-exercise__header">
        <h2>{formatExerciseName(exercise.name)}</h2>
        <button
          type="button"
          className="atlas-gym-exercise__menu-button"
          aria-label={`${formatExerciseName(exercise.name)} options`}
          onClick={() => setShowContextSheet(true)}
        >
          &hellip;
        </button>
      </div>
      {(isOptional ||
        orGroupCount ||
        planned.warmup_execution ||
        workTimerSeconds != null ||
        !restTimerEnabled(planned) ||
        pairLabel) && (
        <div className="atlas-gym-exercise__status">
          {pairLabel && <span className="atlas-gym-exercise__chip">{pairLabel}</span>}
          {isOptional && <span className="atlas-gym-exercise__chip">Optional</span>}
          {orGroupCount != null && (
            <span className="atlas-gym-exercise__chip">Choose 1 of {orGroupCount}</span>
          )}
          {planned.warmup_execution && <span className="atlas-gym-exercise__chip">Warm-Up</span>}
          {workTimerSeconds != null && (
            <span className="atlas-gym-exercise__chip">Work {formatSeconds(workTimerSeconds)}</span>
          )}
          {!restTimerEnabled(planned) && (
            <span className="atlas-gym-exercise__chip">No rest timer</span>
          )}
        </div>
      )}
      {showContextSheet && (
        <ExerciseContextSheet
          exercise={exercise}
          planned={planned}
          allSessions={allSessions}
          library={library}
          canGroupWithNext={canGroupWithNext}
          onGroupWithNext={
            onGroupWithNext
              ? () => {
                  onGroupWithNext();
                  setShowContextSheet(false);
                }
              : undefined
          }
          onClose={() => setShowContextSheet(false)}
        />
      )}
      <ExerciseMedia exercise={exercise} compact />

      {(() => {
        const lastSet = previousSets[0];
        const targetSummary =
          (planned.target_sets ?? planned.target_reps_min ?? planned.target_weight) != null
            ? `${planned.target_sets ?? '?'} × ${planned.target_reps_min ?? '?'}${
                planned.target_reps_max && planned.target_reps_max !== planned.target_reps_min
                  ? `–${planned.target_reps_max}`
                  : ''
              }${planned.target_weight ? ` @ ${planned.target_weight} lb` : ''}`
            : null;
        if (!lastSet && !bestPR && !targetSummary) return null;
        // One compact row, not three separate blocks -- phone readability
        // over showing every possible metric at once (handoff sec. 3.6).
        return (
          <div className="atlas-gym-stats">
            {lastSet && (
              <div className="atlas-gym-stats__cell">
                <span className="atlas-gym-stats__label">Last</span>
                <span className="atlas-gym-stats__value">{formatSet(lastSet)}</span>
              </div>
            )}
            {bestPR && (
              <div className="atlas-gym-stats__cell">
                <span className="atlas-gym-stats__label">Best</span>
                <span className="atlas-gym-stats__value">{describePR(bestPR).value}</span>
              </div>
            )}
            {targetSummary && (
              <div className="atlas-gym-stats__cell">
                <span className="atlas-gym-stats__label">Target</span>
                <span className="atlas-gym-stats__value">{targetSummary}</span>
              </div>
            )}
          </div>
        );
      })()}

      {(showsReps || showsDuration || showsDistance) && (
        <div className="atlas-gym-goal">
          <div className="atlas-gym-goal__line">
            <span className="atlas-gym-goal__sets">
              {planned.target_sets ?? 1} working set{planned.target_sets === 1 ? '' : 's'}
            </span>
            <span className="atlas-gym-goal__program">Program: {programRange(planned)}</span>
          </div>
          {(showsReps || showsDuration) && onSetGoal && (
            <label className="atlas-gym-goal__field">
              <span className="atlas-gym-goal__field-label">Goal</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Goal"
                value={goalDraft}
                placeholder={showsDuration ? '— sec' : '— reps'}
                onChange={(e) => handleGoalChange(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
              <span className="atlas-gym-goal__unit">{showsDuration ? 'sec' : 'reps'}</span>
            </label>
          )}
        </div>
      )}

      <table className="atlas-gym-exercise__sets">
        <thead>
          <tr>
            <th scope="col">Set</th>
            {showsWeight && <th scope="col">Weight</th>}
            {showsExternalLoad && <th scope="col">Added lb</th>}
            {(showsReps || showsDuration) && <th scope="col">Goal</th>}
            {showsReps && <th scope="col">Actual</th>}
            {showsDuration && <th scope="col">Actual</th>}
            {showsDistance && <th scope="col">Meters</th>}
            <th scope="col">
              <span className="atlas-sr-only">Done</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRows }, (_, index) => {
            const performed = performedSets[index];
            if (performed) {
              return (
                <tr key={performed.id}>
                  <td>
                    {index + 1}
                    {draftKindOf(performed) !== 'normal' && (
                      <span className="atlas-gym-exercise__set-type">
                        {' '}
                        {DRAFT_KIND_LABELS[draftKindOf(performed)]}
                      </span>
                    )}
                  </td>
                  {showsWeight && <td>{performed.weight ?? '—'}</td>}
                  {showsExternalLoad && (
                    <td>{performed.external_load != null ? `+${performed.external_load}` : '—'}</td>
                  )}
                  {showsReps && <td className="atlas-gym-exercise__goal-cell">{goalForRow()}</td>}
                  {showsDuration && (
                    <td className="atlas-gym-exercise__goal-cell">{goalForRow()}</td>
                  )}
                  {showsReps && <td>{performed.reps ?? '—'}</td>}
                  {showsDuration && <td>{performed.duration_seconds ?? '—'}</td>}
                  {showsDistance && <td>{performed.distance_meters ?? '—'}</td>}
                  <td>
                    {confirmDeleteId === performed.id ? (
                      <span className="atlas-gym-exercise__confirm">
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveCompletedSet(performed.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Remove
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="atlas-gym-exercise__done"
                        aria-label={`Set ${index + 1} complete, tap to remove`}
                        onClick={() => setConfirmDeleteId(performed.id)}
                      >
                        &#10003;
                      </button>
                    )}
                  </td>
                </tr>
              );
            }

            const draft = draftFor(index);
            const hasDraftData =
              draft.weight !== '' ||
              draft.reps !== '' ||
              draft.duration !== '' ||
              draft.distance !== '' ||
              draft.externalLoad !== '' ||
              draft.rpe !== '' ||
              draft.rir !== '' ||
              draft.notes.trim() !== '';
            const hasRunningTimer =
              index === nextDraftIndex &&
              activeTimer?.kind === 'exercise' &&
              activeTimer.exercise_id === exercise.id;
            // An extra row beyond the plan (added via "+ Set") offers a quick
            // "remove" undo only while it's genuinely untouched. The instant
            // it has typed data or a running timer, it must become
            // completable -- otherwise a bonus set can never be logged
            // without adding yet another row first to push this one off the
            // "last row" position, which is exactly the confirmed bug this
            // fixes.
            const isRemovableDraft =
              index === totalRows - 1 &&
              index >= plannedRowCount &&
              !hasDraftData &&
              !hasRunningTimer;
            return (
              <Fragment key={`draft-${index}`}>
                <tr>
                  <td>
                    {index + 1}
                    <select
                      className="atlas-gym-exercise__set-type-select"
                      aria-label={`Set ${index + 1} type`}
                      value={draft.kind}
                      onChange={(e) => updateDraft(index, { kind: e.target.value as DraftSetKind })}
                    >
                      {Object.entries(DRAFT_KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="atlas-gym-exercise__details-toggle"
                      aria-expanded={detailIndex === index}
                      aria-label={`Set ${index + 1} details (RPE, RIR, notes)`}
                      onClick={() => setDetailIndex(detailIndex === index ? null : index)}
                    >
                      &hellip;
                    </button>
                  </td>
                  {showsWeight && (
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        aria-label={`Set ${index + 1} weight`}
                        value={draft.weight}
                        onChange={(e) => updateDraft(index, { weight: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                  )}
                  {showsExternalLoad && (
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Set ${index + 1} added load`}
                        value={draft.externalLoad}
                        onChange={(e) => updateDraft(index, { externalLoad: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                  )}
                  {showsReps && <td className="atlas-gym-exercise__goal-cell">{goalForRow()}</td>}
                  {showsDuration && (
                    <td className="atlas-gym-exercise__goal-cell">{goalForRow()}</td>
                  )}
                  {showsReps && (
                    <td>
                      <input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Set ${index + 1} reps`}
                        value={draft.reps}
                        onChange={(e) => updateDraft(index, { reps: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                  )}
                  {showsDuration && index === nextDraftIndex ? (
                    <td>
                      <TimedDurationCell
                        targetSeconds={planned.target_duration_seconds}
                        activeTimer={
                          activeTimer?.kind === 'exercise' &&
                          activeTimer.exercise_id === exercise.id
                            ? activeTimer
                            : null
                        }
                        draftValue={draft.duration}
                        onStart={onStartExerciseTimer}
                        onStop={() => {
                          if (activeTimer) {
                            const elapsed =
                              activeTimer.duration_seconds - remainingSeconds(activeTimer);
                            updateDraft(index, { duration: String(elapsed) });
                          }
                          onStopExerciseTimer();
                        }}
                        onManualChange={(value) => updateDraft(index, { duration: value })}
                      />
                    </td>
                  ) : (
                    showsDuration && (
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          aria-label={`Set ${index + 1} seconds`}
                          value={draft.duration}
                          onChange={(e) => updateDraft(index, { duration: e.target.value })}
                          onFocus={(e) => e.target.select()}
                        />
                      </td>
                    )
                  )}
                  {showsDistance && (
                    <td>
                      <input
                        type="number"
                        inputMode="decimal"
                        aria-label={`Set ${index + 1} distance`}
                        value={draft.distance}
                        onChange={(e) => updateDraft(index, { distance: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                  )}
                  <td>
                    {isRemovableDraft ? (
                      <button
                        type="button"
                        aria-label={`Remove set ${index + 1}`}
                        onClick={() => setExtraRows((n) => Math.max(0, n - 1))}
                      >
                        &times;
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="atlas-gym-exercise__complete"
                        aria-label={`Complete set ${index + 1}`}
                        onClick={() => handleComplete(index)}
                      >
                        &#9675;
                      </button>
                    )}
                  </td>
                </tr>
                {detailIndex === index && (
                  <tr className="atlas-gym-exercise__details">
                    <td colSpan={8}>
                      <div className="atlas-gym-exercise__details-grid">
                        <label className="atlas-gym-exercise__details-field">
                          <span>RPE</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={10}
                            aria-label={`Set ${index + 1} RPE`}
                            placeholder="1-10"
                            value={draft.rpe}
                            onChange={(e) => updateDraft(index, { rpe: e.target.value })}
                            onFocus={(e) => e.target.select()}
                          />
                        </label>
                        <label className="atlas-gym-exercise__details-field">
                          <span>RIR</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={10}
                            aria-label={`Set ${index + 1} RIR`}
                            placeholder="0-10"
                            value={draft.rir}
                            onChange={(e) => updateDraft(index, { rir: e.target.value })}
                            onFocus={(e) => e.target.select()}
                          />
                        </label>
                        <label className="atlas-gym-exercise__details-notes">
                          <span>Notes</span>
                          <input
                            type="text"
                            aria-label={`Set ${index + 1} notes`}
                            placeholder="Optional note"
                            value={draft.notes}
                            onChange={(e) => updateDraft(index, { notes: e.target.value })}
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <button
        type="button"
        className="atlas-library__create"
        onClick={() => setExtraRows((n) => n + 1)}
      >
        + Set
      </button>
    </div>
  );
}
