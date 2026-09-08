import { useEffect, useState } from 'react';
import { getOrCreateDeviceId, newId } from '@atlas/core';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, ExerciseNote, WorkoutSession } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { ExerciseMedia } from './ExerciseMedia';
import { ExerciseProgress } from './ExerciseProgress';

interface ExerciseDetailProps {
  exercise: Exercise;
  storage: AtlasStorage;
  onBack: () => void;
}

type DetailTab = 'details' | 'progress';

export function ExerciseDetail({ exercise, storage, onBack }: ExerciseDetailProps) {
  const [tab, setTab] = useState<DetailTab>('details');
  const [notes, setNotes] = useState<ExerciseNote[]>([]);
  const [draft, setDraft] = useState('');
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isFavorite, setIsFavorite] = useState(exercise.is_favorite ?? false);

  async function toggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    await storage.exercises.put({ ...exercise, is_favorite: next });
  }

  useEffect(() => {
    let cancelled = false;
    void storage.exerciseNotes.getAll().then((all) => {
      if (!cancelled) setNotes(all.filter((n) => n.exercise_id === exercise.id));
    });
    void storage.workoutSessions.getAll().then((all) => {
      if (!cancelled) setSessions(all);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, exercise.id]);

  async function addNote() {
    const text = draft.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const note: ExerciseNote = {
      id: newId(),
      created_at: now,
      updated_at: now,
      version: 1,
      device_id: getOrCreateDeviceId(),
      deleted_at: null,
      exercise_id: exercise.id,
      text,
    };
    await storage.exerciseNotes.put(note);
    setNotes((prev) => [...prev, note]);
    setDraft('');
  }

  return (
    <div className="atlas-exercise-detail">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <div className="atlas-exercise-detail__title-row">
        <h1>{formatExerciseName(exercise.name)}</h1>
        <button
          type="button"
          className="atlas-exercise-detail__favorite"
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => void toggleFavorite()}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>
      <p className="atlas-exercise-detail__meta">
        {[exercise.category, exercise.equipment.join(', '), exercise.is_custom ? 'custom' : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <div className="atlas-exercise-detail__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          className={tab === 'details' ? 'atlas-exercise-detail__tab--active' : undefined}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'progress'}
          className={tab === 'progress' ? 'atlas-exercise-detail__tab--active' : undefined}
          onClick={() => setTab('progress')}
        >
          Progress
        </button>
      </div>

      {tab === 'progress' ? (
        <ExerciseProgress exercise={exercise} sessions={sessions} />
      ) : (
        <>
          <ExerciseMedia exercise={exercise} />

          {exercise.target_muscle && (
            <p>
              <strong>Target:</strong> {exercise.target_muscle}
            </p>
          )}
          {exercise.secondary_muscles.length > 0 && (
            <p>
              <strong>Secondary:</strong> {exercise.secondary_muscles.join(', ')}
            </p>
          )}
          {exercise.instructions.length > 0 && (
            <ol className="atlas-exercise-detail__instructions">
              {exercise.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}

          <h2>Notes</h2>
          {notes.length > 0 && (
            <ul className="atlas-exercise-detail__notes">
              {notes.map((note) => (
                <li key={note.id}>{note.text}</li>
              ))}
            </ul>
          )}
          <div className="atlas-exercise-detail__add-note">
            <label htmlFor="note-draft">Add a note</label>
            <textarea
              id="note-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Seat position 6."
            />
            <button type="button" onClick={() => void addNote()}>
              Save note
            </button>
          </div>

          {exercise.source === 'hasaneyldrm/exercises-dataset' && (
            <p className="atlas-exercise-detail__attribution">
              Exercise data via hasaneyldrm/exercises-dataset (MIT).
            </p>
          )}
        </>
      )}
    </div>
  );
}
