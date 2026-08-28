import { useEffect, useState } from 'react';
import {
  addPerformedSet,
  adjustActiveTimer,
  clearActiveTimer,
  completeWorkoutSession,
  createPerformedSet,
  previousPerformance,
  removePerformedSet,
  replaceExercise,
  resolveRestSeconds,
  applyExerciseReplacementToTemplate,
  setSessionNote,
  skipExerciseInSession,
  startExerciseTimer,
  startRestTimer,
  unskipExerciseInSession,
  type LogSetInput,
} from '@atlas/workout-engine';
import { newPRsFromSession } from '@atlas/pr-engine';
import { ensureBuiltInMilestonesSeeded } from '@atlas/milestone-engine';
import type {
  Exercise,
  ExerciseReplacement,
  Milestone,
  PersonalRecord,
  WorkoutSession,
} from '@atlas/data-model';
import { recalculatePRsForSession } from '../progress/recalculatePRs';
import { evaluateMilestonesForSession } from '../progress/evaluateMilestonesForSession';
import { useStorage } from '../storage/StorageContext';
import { ExerciseLogger } from './ExerciseLogger';
import { ReplaceExercisePanel } from './ReplaceExercisePanel';
import { RestTimer } from './RestTimer';
import { useWakeLock } from './useWakeLock';
import { WorkoutSummary } from './WorkoutSummary';

interface GymModeScreenProps {
  sessionId: string;
  onExit: () => void;
}

/** On resume, land on the first exercise that isn't fully logged yet, not always exercise 1. */
function firstIncompleteExerciseIndex(session: WorkoutSession): number {
  const index = session.planned_snapshot.findIndex((planned) => {
    const done = session.performed_sets.filter((s) => s.exercise_id === planned.exercise_id).length;
    const target = planned.target_sets ?? 1;
    return done < target;
  });
  return index === -1 ? 0 : index;
}

export function GymModeScreen({ sessionId, onExit }: GymModeScreenProps) {
  const storage = useStorage();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [priorSessions, setPriorSessions] = useState<WorkoutSession[]>([]);
  const [finished, setFinished] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [showSkipField, setShowSkipField] = useState(false);
  const [skipReasonDraft, setSkipReasonDraft] = useState('');
  const [showReplacePanel, setShowReplacePanel] = useState(false);
  const [newPRs, setNewPRs] = useState<PersonalRecord[]>([]);
  const [newMilestones, setNewMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      await ensureBuiltInMilestonesSeeded(storage);
      const [existing, allExercises, allSessions] = await Promise.all([
        storage.workoutSessions.get(sessionId),
        storage.exercises.getAll(),
        storage.workoutSessions.getAll(),
      ]);
      if (existing) {
        setSession(existing);
        setNoteDraft(existing.session_note ?? '');
        setExerciseIndex(firstIncompleteExerciseIndex(existing));
      }
      setExercises(new Map(allExercises.map((e) => [e.id, e])));
      setPriorSessions(allSessions);
    })();
  }, [storage, sessionId]);

  useWakeLock(session?.active_timer != null);

  if (!storage || !session) {
    return (
      <div className="atlas-empty-screen">
        <h1>Loading workout&hellip;</h1>
      </div>
    );
  }

  // TS doesn't narrow across the function-declaration boundary below even
  // after the guard above -- these consts capture the known-non-null values.
  const currentSession = session;
  const activeStorage = storage;
  const currentPlanned = currentSession.planned_snapshot[exerciseIndex];

  async function persist(updated: WorkoutSession) {
    await activeStorage.workoutSessions.put(updated);
    setSession(updated);
  }

  async function handleCompleteSet(input: LogSetInput) {
    // Immediate autosave: every completed set is written the instant it's marked done.
    let updated = addPerformedSet(currentSession, createPerformedSet(input));
    const planned = currentSession.planned_snapshot.find((p) => p.exercise_id === input.exerciseId);
    if (planned) {
      const rest = resolveRestSeconds(planned, exercises.get(input.exerciseId));
      updated = startRestTimer(updated, input.exerciseId, rest);
    }
    await persist(updated);
  }

  async function handleRemoveSet(setId: string) {
    await persist(removePerformedSet(currentSession, setId));
  }

  async function handleFinish() {
    const completed = completeWorkoutSession(currentSession);
    await persist(completed);

    // PRs are recomputed (not incrementally patched) for every exercise this
    // session touched, then diffed against what's now stored to find which
    // ones this session actually holds -- see recalculatePRs.ts.
    const touchedExerciseIds = completed.performed_sets.map((s) => s.exercise_id);
    await recalculatePRsForSession(activeStorage, touchedExerciseIds, exercises);
    const allPRs = await activeStorage.personalRecords.getAll();
    setNewPRs(newPRsFromSession(allPRs, completed.id));

    setNewMilestones(await evaluateMilestonesForSession(activeStorage));

    setFinished(true);
  }

  async function handleSaveNote() {
    await persist(setSessionNote(currentSession, noteDraft));
    setShowNoteField(false);
  }

  async function handleAdjustRest(deltaSeconds: number) {
    await persist(adjustActiveTimer(currentSession, deltaSeconds));
  }

  async function handleClearTimer() {
    await persist(clearActiveTimer(currentSession));
  }

  async function handleStartExerciseTimer(durationSeconds: number) {
    if (!currentPlanned) return;
    await persist(startExerciseTimer(currentSession, currentPlanned.exercise_id, durationSeconds));
  }

  async function handleSkipExercise() {
    if (!currentPlanned) return;
    await persist(
      skipExerciseInSession(currentSession, currentPlanned.exercise_id, skipReasonDraft),
    );
    setShowSkipField(false);
    setSkipReasonDraft('');
  }

  async function handleUnskipExercise(exerciseId: string) {
    await persist(unskipExerciseInSession(currentSession, exerciseId));
  }

  async function handleConfirmReplace(
    replacementExerciseId: string,
    reason: string | null,
    scope: ExerciseReplacement['scope'],
  ) {
    if (!currentPlanned) return;
    const originalExerciseId = currentPlanned.exercise_id;
    const updated = replaceExercise(
      currentSession,
      originalExerciseId,
      replacementExerciseId,
      reason,
      scope,
    );

    if (scope === 'program' && updated.template_id) {
      const template = await activeStorage.workoutTemplates.get(updated.template_id);
      if (template) {
        await activeStorage.workoutTemplates.put(
          applyExerciseReplacementToTemplate(template, originalExerciseId, replacementExerciseId),
        );
      }
    }

    await persist(updated);
    setShowReplacePanel(false);
  }

  if (finished) {
    return (
      <WorkoutSummary
        session={session}
        newPRs={newPRs}
        newMilestones={newMilestones}
        exercises={exercises}
        onDone={onExit}
      />
    );
  }

  const exerciseCount = session.planned_snapshot.length;
  const skippedEntry = currentPlanned
    ? session.skipped_exercises.find((s) => s.exercise_id === currentPlanned.exercise_id)
    : undefined;

  return (
    <div className="atlas-gym-mode">
      <div className="atlas-gym-mode__header">
        <button type="button" className="atlas-template-editor__back" onClick={onExit}>
          &larr; Back
        </button>
        <span className="atlas-gym-mode__position">
          {exerciseCount > 0 ? `Exercise ${exerciseIndex + 1} of ${exerciseCount}` : 'No exercises'}
        </span>
      </div>

      {session.active_timer?.kind === 'rest' && (
        <RestTimer
          timer={session.active_timer}
          onAdjust={(delta) => void handleAdjustRest(delta)}
          onSkip={() => void handleClearTimer()}
          onComplete={() => void handleClearTimer()}
        />
      )}

      {currentPlanned ? (
        skippedEntry ? (
          <div className="atlas-gym-exercise atlas-gym-exercise--skipped">
            <h2>{exercises.get(currentPlanned.exercise_id)?.name ?? 'Exercise'}</h2>
            <p className="atlas-gym-exercise__skipped-note">
              Skipped{skippedEntry.reason ? ` — ${skippedEntry.reason}` : ''}
            </p>
            <button
              type="button"
              onClick={() => void handleUnskipExercise(currentPlanned.exercise_id)}
            >
              Undo Skip
            </button>
          </div>
        ) : (
          (() => {
            const exercise = exercises.get(currentPlanned.exercise_id);
            const performedForExercise = session.performed_sets.filter(
              (s) => s.exercise_id === currentPlanned.exercise_id,
            );
            const previousSets = exercise
              ? previousPerformance(priorSessions, exercise.id, session.id)
              : [];
            return exercise ? (
              <>
                <ExerciseLogger
                  exercise={exercise}
                  planned={currentPlanned}
                  performedSets={performedForExercise}
                  previousSets={previousSets}
                  activeTimer={session.active_timer}
                  onCompleteSet={(input) => void handleCompleteSet(input)}
                  onRemoveCompletedSet={(id) => void handleRemoveSet(id)}
                  onStartExerciseTimer={(duration) => void handleStartExerciseTimer(duration)}
                  onStopExerciseTimer={() => void handleClearTimer()}
                />

                {showReplacePanel ? (
                  <ReplaceExercisePanel
                    currentExercise={exercise}
                    allExercises={[...exercises.values()]}
                    excludeExerciseIds={session.planned_snapshot
                      .map((p) => p.exercise_id)
                      .filter((id) => id !== exercise.id)}
                    onCancel={() => setShowReplacePanel(false)}
                    onConfirm={(replacementId, reason, scope) =>
                      void handleConfirmReplace(replacementId, reason, scope)
                    }
                  />
                ) : showSkipField ? (
                  <div className="atlas-gym-mode__skip-editor">
                    <label htmlFor="skip-reason">Reason (optional)</label>
                    <textarea
                      id="skip-reason"
                      value={skipReasonDraft}
                      onChange={(e) => setSkipReasonDraft(e.target.value)}
                      placeholder="e.g. Shoulder tweak"
                    />
                    <div className="atlas-gym-mode__skip-editor-actions">
                      <button type="button" onClick={() => setShowSkipField(false)}>
                        Cancel
                      </button>
                      <button type="button" onClick={() => void handleSkipExercise()}>
                        Confirm Skip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="atlas-gym-exercise__secondary-actions">
                    <button type="button" onClick={() => setShowSkipField(true)}>
                      Skip Exercise
                    </button>
                    <button type="button" onClick={() => setShowReplacePanel(true)}>
                      Replace Exercise
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p>Exercise not found in library.</p>
            );
          })()
        )
      ) : (
        <p>This workout has no exercises.</p>
      )}

      <div className="atlas-gym-mode__nav">
        <button
          type="button"
          disabled={exerciseIndex === 0}
          onClick={() => setExerciseIndex((i) => i - 1)}
        >
          &larr; Previous
        </button>
        <button
          type="button"
          disabled={exerciseIndex >= exerciseCount - 1}
          onClick={() => setExerciseIndex((i) => i + 1)}
        >
          Next Exercise &rarr;
        </button>
      </div>

      <div className="atlas-gym-mode__footer">
        {showNoteField ? (
          <div className="atlas-gym-mode__note-editor">
            <label htmlFor="session-note">Workout note</label>
            <textarea
              id="session-note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="e.g. Felt strong today."
            />
            <button type="button" onClick={() => void handleSaveNote()}>
              Save note
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNoteField(true)}>
            {session.session_note ? 'Edit Note' : '+ Note'}
          </button>
        )}
        <button
          type="button"
          className="atlas-gym-mode__finish"
          onClick={() => void handleFinish()}
        >
          Finish Workout
        </button>
      </div>
    </div>
  );
}
