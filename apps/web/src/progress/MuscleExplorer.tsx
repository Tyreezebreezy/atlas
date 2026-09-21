import { useMemo, useState } from 'react';
import { trainingExposure } from '@atlas/progress-engine';
import { muscleName, musclesForSvgId } from '@atlas/anatomy';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, WorkoutSession } from '@atlas/data-model';
import { BodyMap } from '../anatomy/BodyMap';

interface MuscleExplorerProps {
  sessions: WorkoutSession[];
  exercises: Map<string, Exercise>;
}

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '12 weeks', days: 84 },
  { label: 'Custom', days: null },
];

/** v1.0.0 (H3). Muscle Explorer — the Body Map as a visual query interface
 * over recorded training. Progressive disclosure: the map + a compact list
 * first, full detail (exercises, frequency, volume) on selecting a muscle. */
export function MuscleExplorer({ sessions, exercises }: MuscleExplorerProps) {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [customDays, setCustomDays] = useState('30');
  const [customOpen, setCustomOpen] = useState(false);
  const [selectedMuscleId, setSelectedMuscleId] = useState<string | null>(null);

  const exposure = useMemo(
    () => trainingExposure(sessions, exercises, rangeDays),
    [sessions, exercises, rangeDays],
  );

  const maxDirect = Math.max(1, ...exposure.muscles.map((m) => m.directSets));
  const states = exposure.muscles.map((m) => ({
    muscleId: m.muscleId,
    state: 'heat' as const,
    intensity: m.directSets > 0 ? m.directSets / maxDirect : 0.2,
  }));
  const selected = exposure.muscles.find((m) => m.muscleId === selectedMuscleId) ?? null;

  function applyCustom() {
    const parsed = Number(customDays);
    if (Number.isFinite(parsed) && parsed > 0) setRangeDays(Math.round(parsed));
    setCustomOpen(false);
  }

  function handleSelectRegion(svgId: string) {
    const regionIds = new Set(musclesForSvgId(svgId));
    const match = exposure.muscles.find((m) => regionIds.has(m.muscleId));
    if (match) setSelectedMuscleId(match.muscleId);
  }

  return (
    <div className="atlas-muscle-explorer">
      <div className="atlas-muscle-explorer__ranges" role="group" aria-label="Time range">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            className={
              option.days === null && customOpen
                ? 'atlas-muscle-explorer__range atlas-muscle-explorer__range--active'
                : option.days === rangeDays && !customOpen
                  ? 'atlas-muscle-explorer__range atlas-muscle-explorer__range--active'
                  : 'atlas-muscle-explorer__range'
            }
            onClick={() => {
              if (option.days) {
                setRangeDays(option.days);
                setCustomOpen(false);
              } else {
                setCustomOpen(true);
              }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {customOpen && (
        <div className="atlas-muscle-explorer__custom">
          <label htmlFor="muscle-custom-days">Days</label>
          <input
            id="muscle-custom-days"
            type="number"
            inputMode="numeric"
            min={1}
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
          />
          <button type="button" onClick={applyCustom}>
            Apply
          </button>
        </div>
      )}

      {exposure.muscles.length === 0 ? (
        <p className="atlas-program-screen__empty">
          Finish a workout to see which muscles you've trained.
        </p>
      ) : (
        <>
          <BodyMap states={states} onSelectRegion={handleSelectRegion} />

          <ul className="atlas-muscle-explorer__list">
            {exposure.muscles.map((m) => (
              <li key={m.muscleId}>
                <button
                  type="button"
                  className={
                    selectedMuscleId === m.muscleId
                      ? 'atlas-muscle-explorer__muscle atlas-muscle-explorer__muscle--active'
                      : 'atlas-muscle-explorer__muscle'
                  }
                  onClick={() =>
                    setSelectedMuscleId(selectedMuscleId === m.muscleId ? null : m.muscleId)
                  }
                >
                  <span className="atlas-library__item-name">{muscleName(m.muscleId)}</span>
                  <span className="atlas-library__item-meta">
                    {m.directSets} direct · {m.secondarySets} secondary · {m.frequency} session
                    {m.frequency === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="atlas-muscle-explorer__detail">
              <h3>{muscleName(selected.muscleId)}</h3>
              <dl>
                <div>
                  <dt>Direct sets</dt>
                  <dd>{selected.directSets}</dd>
                </div>
                <div>
                  <dt>Secondary</dt>
                  <dd>{selected.secondarySets}</dd>
                </div>
                <div>
                  <dt>Frequency</dt>
                  <dd>
                    {selected.frequency} session{selected.frequency === 1 ? '' : 's'}
                  </dd>
                </div>
                {selected.volume > 0 && (
                  <div>
                    <dt>Volume</dt>
                    <dd>{selected.volume.toLocaleString()} lb</dd>
                  </div>
                )}
              </dl>
              {selected.exercises.length > 0 && (
                <p className="atlas-muscle-explorer__exercises">
                  {selected.exercises
                    .map((id) => formatExerciseName(exercises.get(id)?.name ?? 'Exercise'))
                    .join(', ')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
