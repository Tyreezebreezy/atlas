import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '@atlas/data-model';
import {
  ensureExercisesSeeded,
  listBodyParts,
  listEquipment,
  searchExercises,
} from '@atlas/exercise-library';
import { useStorage } from '../storage/StorageContext';
import { CustomExerciseForm } from './CustomExerciseForm';
import { ExerciseDetail } from './ExerciseDetail';

// ponytail: flat slice(0, 100) instead of list virtualization -- filtering
// narrows well below that for any real search, and 1324 unfiltered DOM nodes
// isn't worth a new dependency until someone actually feels it lag.
const MAX_VISIBLE = 100;

export function LibraryScreen() {
  const storage = useStorage();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [equipment, setEquipment] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    void (async () => {
      await ensureExercisesSeeded(storage);
      const all = await storage.exercises.getAll();
      if (!cancelled) {
        setExercises(all);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const bodyParts = useMemo(() => listBodyParts(exercises), [exercises]);
  const equipmentOptions = useMemo(() => listEquipment(exercises), [exercises]);
  const filtered = useMemo(
    () => searchExercises(exercises, { query, bodyPart, equipment }),
    [exercises, query, bodyPart, equipment],
  );
  const selected = exercises.find((e) => e.id === selectedId) ?? null;

  async function handleExerciseCreated(exercise: Exercise) {
    if (!storage) return;
    await storage.exercises.put(exercise);
    setExercises((prev) => [...prev, exercise]);
    setCreating(false);
    setSelectedId(exercise.id);
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Library</h1>
        <p>Loading exercise library&hellip;</p>
      </div>
    );
  }

  if (creating) {
    return (
      <CustomExerciseForm onCreated={handleExerciseCreated} onCancel={() => setCreating(false)} />
    );
  }

  if (selected) {
    return (
      <ExerciseDetail exercise={selected} storage={storage} onBack={() => setSelectedId(null)} />
    );
  }

  return (
    <div className="atlas-library">
      <h1>Library</h1>
      <input
        type="search"
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="atlas-library__search"
      />
      <div className="atlas-library__filters">
        <select
          aria-label="Filter by body part"
          value={bodyPart}
          onChange={(e) => setBodyPart(e.target.value)}
        >
          <option value="">All body parts</option>
          {bodyParts.map((bp) => (
            <option key={bp} value={bp}>
              {bp}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        >
          <option value="">All equipment</option>
          {equipmentOptions.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>
      </div>
      <p className="atlas-library__count">{filtered.length} exercises</p>
      <ul className="atlas-library__list">
        {filtered.slice(0, MAX_VISIBLE).map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => setSelectedId(exercise.id)}
              aria-label={[exercise.name, exercise.category, exercise.equipment.join(', ')]
                .filter(Boolean)
                .join(', ')}
            >
              <span className="atlas-library__item-name" aria-hidden="true">
                {exercise.name}
              </span>
              <span className="atlas-library__item-meta" aria-hidden="true">
                {[exercise.category, exercise.equipment.join(', ')].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > MAX_VISIBLE && (
        <p className="atlas-library__truncated">
          Showing first {MAX_VISIBLE} &mdash; refine your search.
        </p>
      )}
      <button type="button" className="atlas-library__create" onClick={() => setCreating(true)}>
        + Create Custom Exercise
      </button>
    </div>
  );
}
