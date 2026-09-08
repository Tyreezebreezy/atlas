import { useEffect, useState } from 'react';
import { formatExerciseName } from '@atlas/exercise-library';
import {
  addExerciseToSession,
  addExerciseToTemplate,
  addPerformedSet,
  adjustActiveTimer,
  buildGymSlots,
  clearActiveTimer,
  completeWorkoutSession,
  createPerformedSet,
  isGroupComplete,
  previousPerformance,
  removePerformedSet,
  replaceExercise,
  groupExercisesInSession,
  resolveGroupRestSeconds,
  resolveRestSeconds,
  applyExerciseReplacementToTemplate,
  setSessionNote,
  skipExerciseInSession,
  startExerciseTimer,
  startRestTimer,
  unskipExerciseInSession,
  type GymSlot,
  type LogSetInput,
} from '@atlas/workout-engine';
import { newPRsFromSession } from '@atlas/pr-engine';
import { ensureBuiltInMilestonesSeeded } from '@atlas/milestone-engine';
import type {
  Exercise,
  ExerciseReplacement,
  Milestone,
  PersonalRecord,
  Program,
  WorkoutOccurrence,
  WorkoutSession,
} from '@atlas/data-model';
import { advanceProgramSequence, completeOccurrence, findOccurrence } from '@atlas/program-engine';
import { recalculatePRsForSession } from '../progress/recalculatePRs';
import { evaluateMilestonesForSession } from '../progress/evaluateMilestonesForSession';
import { loadSettings } from '../settings/settings';
import { useStorage } from '../storage/StorageContext';
import { AddExercisePanel } from './AddExercisePanel';
import { bestPRForExercise } from './bestPR';
import { ExerciseLogger } from './ExerciseLogger';
import { ReplaceExercisePanel } from './ReplaceExercisePanel';
import { fireTimerCompletionSignal } from './timerSignal';
import { RestTimer } from './RestTimer';
import { SupersetRound } from './SupersetRound';
import { useWakeLock } from './useWakeLock';
import { WorkoutSummary } from './WorkoutSummary';

interface GymModeScreenProps {
  sessionId: string;
  onExit: () => void;
}

/** On resume, land on the first slot that isn't fully logged yet, not
 * always the first. A grouped slot (superset/circuit) counts as complete
 * only once every member has finished every round. */
function firstIncompleteSlotIndex(session: WorkoutSession, slots: GymSlot[]): number {
  const index = slots.findIndex((slot) => {
    if (slot.kind === 'group') {
      return !isGroupComplete(slot.group, slot.members, session.performed_sets);
    }
    const done = session.performed_sets.filter(
      (s) => s.exercise_id === slot.planned.exercise_id,
    ).length;
    const target = slot.planned.target_sets ?? 1;
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
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [occurrences, setOccurrences] = useState<WorkoutOccurrence[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [showSkipField, setShowSkipField] = useState(false);
  const [skipReasonDraft, setSkipReasonDraft] = useState('');
  const [showReplacePanel, setShowReplacePanel] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newPRs, setNewPRs] = useState<PersonalRecord[]>([]);
  const [newMilestones, setNewMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      await ensureBuiltInMilestonesSeeded(storage);
      const [existing, allExercises, allSessions, allPRs, allPrograms, allOccurrences] =
        await Promise.all([
          storage.workoutSessions.get(sessionId),
          storage.exercises.getAll(),
          storage.workoutSessions.getAll(),
          storage.personalRecords.getAll(),
          storage.programs.getAll(),
          storage.workoutOccurrences.getAll(),
        ]);
      setActiveProgram(
        (existing?.program_id && allPrograms.find((p) => p.id === existing.program_id)) || null,
      );
      setOccurrences(allOccurrences);
      if (existing) {
        setSession(existing);
        setNoteDraft(existing.session_note ?? '');
        setExerciseIndex(
          firstIncompleteSlotIndex(
            existing,
            buildGymSlots(existing.planned_snapshot, existing.groups),
          ),
        );
      }
      setExercises(new Map(allExercises.map((e) => [e.id, e])));
      setPriorSessions(allSessions);
      setPersonalRecords(allPRs);
    })();
  }, [storage, sessionId]);

  // v0.2.0: the whole active session, not just while a timer is running --
  // a user typing weight/reps between sets with no timer active must not
  // have the screen lock mid-workout either. See useWakeLock's doc comment.
  useWakeLock(session?.status === 'in_progress');

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
  const slots = buildGymSlots(currentSession.planned_snapshot, currentSession.groups);
  const currentSlot = slots[exerciseIndex];
  const currentPlanned = currentSlot?.kind === 'single' ? currentSlot.planned : undefined;

  async function persist(updated: WorkoutSession) {
    await activeStorage.workoutSessions.put(updated);
    setSession(updated);
  }

  async function handleCompleteSet(input: LogSetInput) {
    // Immediate autosave: every completed set is written the instant it's marked done.
    let updated = addPerformedSet(
      currentSession,
      createPerformedSet({
        ...input,
        completedAt: currentSession.planned_completed_at ?? undefined,
      }),
    );
    const planned = currentSession.planned_snapshot.find((p) => p.exercise_id === input.exerciseId);
    if (planned) {
      const rest = resolveRestSeconds({
        planned,
        session: currentSession,
        exercise: exercises.get(input.exerciseId),
        program: activeProgram,
      });
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

    // Finishing the current day of a sequential program advances it to the
    // next one; a no-op for a fixed-schedule program or a session that
    // isn't tied to a program day at all (Quick Workout).
    if (completed.program_id && completed.program_day_id) {
      const program = await activeStorage.programs.get(completed.program_id);
      if (program) {
        await activeStorage.programs.put(advanceProgramSequence(program, completed.program_day_id));
      }
      // Only touches a slot that already has an occurrence row (moved,
      // skipped-then-reconsidered, or replaced) -- the ordinary unmoved
      // case intentionally never gets one at all (see WorkoutOccurrence's
      // doc comment), so most completions are correctly a no-op here.
      const todayIso = new Date().toISOString().slice(0, 10);
      const existingOccurrence = findOccurrence(occurrences, completed.program_day_id, todayIso);
      if (existingOccurrence) {
        await activeStorage.workoutOccurrences.put(
          completeOccurrence(
            existingOccurrence,
            completed.program_id,
            completed.program_day_id,
            todayIso,
            completed.id,
          ),
        );
      }
    }

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

  async function handleConfirmAdd(exerciseId: string, scope: ExerciseReplacement['scope']) {
    const updated = addExerciseToSession(currentSession, exerciseId);

    if (scope === 'program' && updated.template_id) {
      const template = await activeStorage.workoutTemplates.get(updated.template_id);
      if (template) {
        await activeStorage.workoutTemplates.put(addExerciseToTemplate(template, exerciseId));
      }
    }

    await persist(updated);
    setShowAddPanel(false);
  }

  /** Live superset/circuit creation (v0.2.0 item 28) -- Freestyle has no
   * template to pre-author a group in, so this is the only way to group
   * exercises there; works the same for any session. Silently a no-op via
   * groupExercisesInSession's own guards if the next slot is already
   * grouped or either exercise already has a logged set. */
  async function handleGroupWithNext() {
    if (!currentPlanned) return;
    const nextSlot = slots[exerciseIndex + 1];
    if (!nextSlot || nextSlot.kind !== 'single') return;
    const updated = groupExercisesInSession(currentSession, [
      currentPlanned.exercise_id,
      nextSlot.planned.exercise_id,
    ]);
    await persist(updated);
  }

  async function handleCompleteRound(
    sets: LogSetInput[],
    slot: Extract<GymSlot, { kind: 'group' }>,
  ) {
    let updated = currentSession;
    for (const input of sets) {
      updated = addPerformedSet(
        updated,
        createPerformedSet({
          ...input,
          completedAt: currentSession.planned_completed_at ?? undefined,
        }),
      );
    }
    // Rest is after the group's round (after its last member), not
    // between members within a round -- keyed to the last member so the
    // rest timer's exercise_id still points at a real planned exercise.
    const lastMember = slot.members[slot.members.length - 1];
    if (lastMember) {
      const rest = resolveGroupRestSeconds({
        group: slot.group,
        members: slot.members,
        session: currentSession,
        exercise: exercises.get(lastMember.exercise_id),
        program: activeProgram,
      });
      updated = startRestTimer(updated, lastMember.exercise_id, rest);
    }
    await persist(updated);
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

  const exerciseCount = slots.length;
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
          onComplete={() => {
            fireTimerCompletionSignal(loadSettings());
            void handleClearTimer();
          }}
          flashEnabled={loadSettings().timerFlashEnabled}
        />
      )}

      {currentSlot?.kind === 'group' ? (
        <SupersetRound
          group={currentSlot.group}
          members={currentSlot.members}
          exercises={exercises}
          performedSets={session.performed_sets}
          onCompleteRound={(sets) => void handleCompleteRound(sets, currentSlot)}
        />
      ) : currentPlanned ? (
        skippedEntry ? (
          <div className="atlas-gym-exercise atlas-gym-exercise--skipped">
            <h2>{formatExerciseName(exercises.get(currentPlanned.exercise_id)?.name ?? 'Exercise')}</h2>
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
            const bestPR = exercise ? bestPRForExercise(personalRecords, exercise) : null;
            return exercise ? (
              <>
                <ExerciseLogger
                  exercise={exercise}
                  planned={currentPlanned}
                  performedSets={performedForExercise}
                  previousSets={previousSets}
                  bestPR={bestPR}
                  activeTimer={session.active_timer}
                  allSessions={priorSessions}
                  library={[...exercises.values()]}
                  canGroupWithNext={
                    slots[exerciseIndex + 1]?.kind === 'single' && performedForExercise.length === 0
                  }
                  onGroupWithNext={() => void handleGroupWithNext()}
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

      {showAddPanel && (
        <AddExercisePanel
          allExercises={[...exercises.values()]}
          excludeExerciseIds={session.planned_snapshot.map((p) => p.exercise_id)}
          onCancel={() => setShowAddPanel(false)}
          onConfirm={(exerciseId, scope) => void handleConfirmAdd(exerciseId, scope)}
        />
      )}

      <div className="atlas-gym-mode__footer">
        {!showAddPanel && (
          <button type="button" onClick={() => setShowAddPanel(true)}>
            + Add Exercise
          </button>
        )}
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
