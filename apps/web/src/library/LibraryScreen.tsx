import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '@atlas/data-model';
import {
  ensureExercisesSeeded,
  formatExerciseName,
  listBodyParts,
  listEquipment,
  searchExercises,
} from '@atlas/exercise-library';
import {
  mappedMuscleIds,
  muscleName,
  MUSCLE_GROUPS,
  musclesForSvgId,
  musclesInGroup,
} from '@atlas/anatomy';
import { useStorage } from '../storage/StorageContext';
import { BodyMap } from '../anatomy/BodyMap';
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
  const [view, setView] = useState<'list' | 'body'>('list');
  const [selectedMuscleIds, setSelectedMuscleIds] = useState<string[]>([]);

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

  const bodyFiltered = useMemo(() => {
    if (selectedMuscleIds.length === 0) return [];
    const wanted = new Set(selectedMuscleIds);
    return exercises.filter((e) => mappedMuscleIds(e).some((id) => wanted.has(id)));
  }, [exercises, selectedMuscleIds]);

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
      <p className="atlas-library__subtitle">
        Browse every exercise, with a how-to demonstration wherever one exists.
      </p>

      <div className="atlas-library__view-toggle" role="group" aria-label="Browse mode">
        <button
          type="button"
          className={
            view === 'list'
              ? 'atlas-library__view-button atlas-library__view-button--active'
              : 'atlas-library__view-button'
          }
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          List
        </button>
        <button
          type="button"
          className={
            view === 'body'
              ? 'atlas-library__view-button atlas-library__view-button--active'
              : 'atlas-library__view-button'
          }
          aria-pressed={view === 'body'}
          onClick={() => setView('body')}
        >
          Body
        </button>
      </div>

      {view === 'body' ? (
        <div className="atlas-library__body">
          <p className="atlas-library__count">Select a muscle to see exercises that train it.</p>
          <BodyMap
            states={selectedMuscleIds.map((id) => ({ muscleId: id, state: 'selected' as const }))}
            onSelectRegion={(svgId) => setSelectedMuscleIds(musclesForSvgId(svgId))}
          />
          <div className="atlas-library__body-groups">
            {MUSCLE_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                className="atlas-library__body-group"
                onClick={() => setSelectedMuscleIds(musclesInGroup(group.id).map((m) => m.id))}
              >
                {group.name}
              </button>
            ))}
          </div>
          {selectedMuscleIds.length > 0 && (
            <>
              <p className="atlas-library__count">
                {bodyFiltered.length} exercise{bodyFiltered.length === 1 ? '' : 's'} for{' '}
                {selectedMuscleIds.map(muscleName).join(', ')}
              </p>
              <ul className="atlas-library__list">
                {bodyFiltered.slice(0, MAX_VISIBLE).map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(exercise.id)}
                      aria-label={formatExerciseName(exercise.name)}
                    >
                      <span className="atlas-library__item-name" aria-hidden="true">
                        {formatExerciseName(exercise.name)}
                        {exercise.media && (
                          <span className="atlas-library__demo-badge" title="Has a demonstration">
                            ●
                          </span>
                        )}
                      </span>
                      <span className="atlas-library__item-meta" aria-hidden="true">
                        {[exercise.category, exercise.equipment.join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="atlas-library__sticky-controls">
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
          </div>
          <p className="atlas-library__count">{filtered.length} exercises</p>
          <ul className="atlas-library__list">
            {filtered.slice(0, MAX_VISIBLE).map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(exercise.id)}
                  aria-label={[
                    formatExerciseName(exercise.name),
                    exercise.category,
                    exercise.equipment.join(', '),
                    exercise.media ? 'has a demonstration' : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                >
                  <span className="atlas-library__item-name" aria-hidden="true">
                    {formatExerciseName(exercise.name)}
                    {exercise.media && (
                      <span className="atlas-library__demo-badge" title="Has a demonstration">
                        ●
                      </span>
                    )}
                  </span>
                  <span className="atlas-library__item-meta" aria-hidden="true">
                    {[exercise.category, exercise.equipment.join(', ')]
                      .filter(Boolean)
                      .join(' · ')}
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
        </>
      )}
      <button type="button" className="atlas-library__create" onClick={() => setCreating(true)}>
        + Create Custom Exercise
      </button>
    </div>
  );
}
