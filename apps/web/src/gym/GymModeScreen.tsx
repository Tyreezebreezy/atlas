import { useEffect, useState } from 'react';
import {
  addPerformedSet,
  completeWorkoutSession,
  createPerformedSet,
  previousPerformance,
  removePerformedSet,
  setSessionNote,
  type LogSetInput,
} from '@atlas/workout-engine';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { ExerciseLogger } from './ExerciseLogger';
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

  useEffect(() => {
    if (!storage) return;
    void (async () => {
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

  async function persist(updated: WorkoutSession) {
    await activeStorage.workoutSessions.put(updated);
    setSession(updated);
  }

  async function handleCompleteSet(input: LogSetInput) {
    // Immediate autosave: every completed set is written the instant it's marked done.
    await persist(addPerformedSet(currentSession, createPerformedSet(input)));
  }

  async function handleRemoveSet(setId: string) {
    await persist(removePerformedSet(currentSession, setId));
  }

  async function handleFinish() {
    await persist(completeWorkoutSession(currentSession));
    setFinished(true);
  }

  async function handleSaveNote() {
    await persist(setSessionNote(currentSession, noteDraft));
    setShowNoteField(false);
  }

  if (finished) {
    return <WorkoutSummary session={session} onDone={onExit} />;
  }

  const exerciseCount = session.planned_snapshot.length;
  const currentPlanned = session.planned_snapshot[exerciseIndex];

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

      {currentPlanned ? (
        (() => {
          const exercise = exercises.get(currentPlanned.exercise_id);
          const performedForExercise = session.performed_sets.filter(
            (s) => s.exercise_id === currentPlanned.exercise_id,
          );
          const previousSets = exercise
            ? previousPerformance(priorSessions, exercise.id, session.id)
            : [];
          return exercise ? (
            <ExerciseLogger
              exercise={exercise}
              planned={currentPlanned}
              performedSets={performedForExercise}
              previousSets={previousSets}
              onCompleteSet={(input) => void handleCompleteSet(input)}
              onRemoveCompletedSet={(id) => void handleRemoveSet(id)}
            />
          ) : (
            <p>Exercise not found in library.</p>
          );
        })()
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
