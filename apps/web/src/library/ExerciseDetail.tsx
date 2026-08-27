import { useEffect, useState } from 'react';
import { getOrCreateDeviceId, newId } from '@atlas/core';
import type { Exercise, ExerciseNote } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

interface ExerciseDetailProps {
  exercise: Exercise;
  storage: AtlasStorage;
  onBack: () => void;
}

export function ExerciseDetail({ exercise, storage, onBack }: ExerciseDetailProps) {
  const [notes, setNotes] = useState<ExerciseNote[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    void storage.exerciseNotes.getAll().then((all) => {
      if (!cancelled) setNotes(all.filter((n) => n.exercise_id === exercise.id));
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
      <button type="button" className="atlas-exercise-detail__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>{exercise.name}</h1>
      <p className="atlas-exercise-detail__meta">
        {[exercise.category, exercise.equipment.join(', '), exercise.is_custom ? 'custom' : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
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
    </div>
  );
}
