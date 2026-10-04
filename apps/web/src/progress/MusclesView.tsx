import { useMemo, useState } from 'react';
import {
  buildMuscleMapViewModel,
  type MuscleGroupEntry,
  type MuscleMapEntry,
  type MuscleMapMode,
  type MuscleMapViewModel,
  type MusclePerformanceState,
} from '@atlas/progress-engine';
import { plannedSessionsForProgramWeek } from '@atlas/program-engine';
import { getMuscle, groupName, muscleName, musclesInGroup } from '@atlas/anatomy';
import { formatExerciseName } from '@atlas/exercise-library';
import { BodyMap } from '../anatomy/BodyMap';
import {
  describeDaysAgo,
  describePerformanceCounts,
  PERFORMANCE_STATE_LABEL,
  pluralize,
} from './formatProgress';
import { muscleMapStates } from './muscleMapStates';
import type { ProgressData } from './progressData';

const MODES: { key: MuscleMapMode; label: string; blurb: string }[] = [
  {
    key: 'trained',
    label: 'Trained',
    blurb: 'How many workouts had each muscle as a main target.',
  },
  {
    key: 'volume',
    label: 'Volume',
    blurb:
      'Working sets aimed at each muscle. Muscles that only assisted are shown separately, never counted as partial sets.',
  },
  {
    key: 'focus',
    label: 'Focus',
    blurb: 'What your active program plans for a typical week.',
  },
  {
    key: 'performance',
    label: 'Performance',
    blurb:
      'How the exercises for each muscle are doing. This describes exercise performance, not muscle growth.',
  },
];

const PERIODS: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '12 weeks', days: 84 },
  { label: 'Custom', days: null },
];

interface Selection {
  label: string;
  muscleIds: string[];
  /** Where the tap happened, so the detail appears next to it (a phone screen is a long scroll). */
  source: 'row' | 'map';
  /** The group whose row the detail sits under when `source` is 'row'. */
  groupId: string | null;
}

function periodLabel(days: number): string {
  if (days === 7) return 'last 7 days';
  if (days === 84) return 'last 12 weeks';
  return `last ${days} days`;
}

/** Trained by nothing directly, only assisted -- said the same way in every mode but performance. */
const isAssistOnly = (entry: MuscleMapEntry | MuscleGroupEntry) =>
  entry.primary_set_count === 0 && entry.secondary_set_count > 0;

/** The headline number of a row, worded for the current mode. */
function valueText(mode: MuscleMapMode, entry: MuscleMapEntry | MuscleGroupEntry): string {
  if (mode !== 'performance' && isAssistOnly(entry)) return 'Assist only';
  switch (mode) {
    case 'trained':
      return pluralize(entry.workout_count, 'workout');
    case 'volume':
      return pluralize(entry.primary_set_count, 'set');
    case 'focus':
      return `${pluralize(entry.primary_set_count, 'set')} / week`;
    case 'performance':
      return PERFORMANCE_STATE_LABEL[entry.performance_state ?? 'insufficient_data'];
  }
}

/** The line under a row's headline number. */
function metaText(mode: MuscleMapMode, entry: MuscleMapEntry | MuscleGroupEntry): string {
  if (mode !== 'performance' && isAssistOnly(entry)) {
    return `${pluralize(entry.secondary_set_count, 'set')} as assist`;
  }
  switch (mode) {
    case 'trained':
      return entry.last_trained_at ? `Last trained ${describeDaysAgo(entry.last_trained_at)}` : '';
    case 'volume':
      return entry.secondary_set_count > 0 ? `${pluralize(entry.secondary_set_count, 'set')} as assist` : '';
    case 'focus':
      return [
        entry.focus_score != null ? `${Math.round(entry.focus_score * 100)}% of planned sets` : '',
        entry.workout_count > 0 ? `in ${pluralize(entry.workout_count, 'session')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'performance':
      return entry.performance_counts ? describePerformanceCounts(entry.performance_counts) : '';
  }
}

function emptyMessage(model: MuscleMapViewModel, hasAnySessions: boolean): string {
  if (model.empty_reason === 'no_program') {
    return 'No active program to plan from. Make a program active in the Program tab and its weekly muscle focus shows up here.';
  }
  if (!hasAnySessions) return "Finish a workout to see which muscles you've trained.";
  return `No completed workouts in the ${periodLabel(model.period.days ?? 0)}. Try a longer period.`;
}

/**
 * vNext Handoff 03B (§10-12). The Muscles page: pick a question (mode) and a
 * time window, read the body map, and read the exact numbers in the ranked
 * list beside/beneath it. The map only paints what `buildMuscleMapViewModel`
 * returns; the list states every value in words, so nothing depends on color.
 */
export function MusclesView({ data }: { data: ProgressData }) {
  const [mode, setMode] = useState<MuscleMapMode>('volume');
  const [periodDays, setPeriodDays] = useState(30);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDays, setCustomDays] = useState('30');
  const [selection, setSelection] = useState<Selection | null>(null);

  const plannedSessions = useMemo(
    () => plannedSessionsForProgramWeek(data.activeProgram, data.templates),
    [data.activeProgram, data.templates],
  );

  const model = useMemo(
    () =>
      buildMuscleMapViewModel({
        mode,
        periodDays,
        sessions: data.sessions,
        exercises: data.exercises,
        personalRecords: data.prs,
        prEvents: data.prEvents,
        plannedSessions,
      }),
    [mode, periodDays, data.sessions, data.exercises, data.prs, data.prEvents, plannedSessions],
  );

  const selectedIds = useMemo(() => new Set(selection?.muscleIds ?? []), [selection]);
  const states = useMemo(() => muscleMapStates(model, selectedIds), [model, selectedIds]);
  const modeInfo = MODES.find((m) => m.key === mode) ?? (MODES[0] as (typeof MODES)[number]);
  const hasAnySessions = data.sessions.some((s) => s.status === 'completed');

  function toggleSelection(next: Selection) {
    setSelection((prev) => (prev && prev.label === next.label ? null : next));
  }

  function selectRegion(_svgId: string, muscleIds: string[]) {
    toggleSelection({
      label: muscleIds.map(muscleName).join(' / '),
      muscleIds,
      source: 'map',
      groupId: getMuscle(muscleIds[0] ?? '')?.group_id ?? null,
    });
  }

  function selectGroup(groupId: string) {
    toggleSelection({
      label: groupName(groupId),
      muscleIds: musclesInGroup(groupId).map((m) => m.id),
      source: 'row',
      groupId,
    });
  }

  function applyCustom() {
    const parsed = Number(customDays);
    if (Number.isFinite(parsed) && parsed > 0) setPeriodDays(Math.round(parsed));
    setCustomOpen(false);
  }

  const summary =
    model.mode === 'focus'
      ? `${pluralize(model.totals.working_sets, 'planned set')} · ${pluralize(model.totals.workouts, 'session')} a week`
      : `${pluralize(model.totals.working_sets, 'working set')} · ${pluralize(model.totals.workouts, 'workout')} · ${periodLabel(periodDays)}`;

  return (
    <div className="atlas-muscles">
      <div className="atlas-muscles__controls">
        <div className="atlas-segmented" role="group" aria-label="What to show">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className="atlas-segmented__option"
              aria-pressed={mode === m.key}
              onClick={() => {
                setMode(m.key);
                setSelection(null);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="atlas-muscles__blurb">{modeInfo.blurb}</p>

        {mode !== 'focus' && (
          <div className="atlas-segmented atlas-segmented--quiet" role="group" aria-label="Time period">
            {PERIODS.map((p) => {
              const active = p.days === null ? customOpen : !customOpen && p.days === periodDays;
              return (
                <button
                  key={p.label}
                  type="button"
                  className="atlas-segmented__option"
                  aria-pressed={active}
                  onClick={() => {
                    if (p.days === null) setCustomOpen(true);
                    else {
                      setPeriodDays(p.days);
                      setCustomOpen(false);
                    }
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
        {mode !== 'focus' && customOpen && (
          <div className="atlas-muscles__custom">
            <label htmlFor="muscle-custom-days">Days</label>
            <input
              id="muscle-custom-days"
              type="number"
              inputMode="numeric"
              min={1}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
            <button type="button" className="atlas-btn atlas-btn--secondary" onClick={applyCustom}>
              Apply
            </button>
          </div>
        )}
      </div>

      {model.empty_reason ? (
        <p className="atlas-panel atlas-muscles__empty">{emptyMessage(model, hasAnySessions)}</p>
      ) : (
        <>
          <p className="atlas-muscles__summary">{summary}</p>
          <div className="atlas-muscles__body">
            <div className="atlas-muscles__map">
              <BodyMap states={states} onSelectRegion={selectRegion} />
              <MapLegend mode={mode} />
              {selection?.source === 'map' && (
                <SelectionDetail
                  selection={selection}
                  model={model}
                  exercises={data.exercises}
                  onClear={() => setSelection(null)}
                />
              )}
            </div>

            <div className="atlas-muscles__list">
              <ul className="atlas-muscle-rows" aria-label={`${modeInfo.label}, by muscle group`}>
                {model.groups.map((group) => (
                  <li key={group.group_id}>
                    <button
                      type="button"
                      className="atlas-muscle-row"
                      aria-pressed={selection?.source === 'row' && selection.groupId === group.group_id}
                      onClick={() => selectGroup(group.group_id)}
                    >
                      <span className="atlas-muscle-row__name">{groupName(group.group_id)}</span>
                      <span
                        className={`atlas-muscle-row__value${
                          mode === 'performance' ? ` atlas-muscle-row__value--${group.performance_state}` : ''
                        }`}
                      >
                        {valueText(mode, group)}
                      </span>
                      {mode !== 'performance' && (
                        <span className="atlas-muscle-row__bar" aria-hidden="true">
                          <span style={{ width: `${Math.round(group.normalized_visual_intensity * 100)}%` }} />
                        </span>
                      )}
                      <span className="atlas-muscle-row__meta">{metaText(mode, group)}</span>
                    </button>
                    {selection?.source === 'row' && selection.groupId === group.group_id && (
                      <SelectionDetail
                        selection={selection}
                        model={model}
                        exercises={data.exercises}
                        onClear={() => setSelection(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MapLegend({ mode }: { mode: MuscleMapMode }) {
  if (mode === 'performance') {
    return (
      <ul className="atlas-map-legend" aria-label="Map key">
        <li>
          <i className="atlas-map-legend__swatch atlas-map-legend__swatch--positive" aria-hidden="true" />
          Progressing
        </li>
        <li>
          <i className="atlas-map-legend__swatch atlas-map-legend__swatch--neutral" aria-hidden="true" />
          Stable
        </li>
        <li>
          <i className="atlas-map-legend__swatch atlas-map-legend__swatch--caution" aria-hidden="true" />
          Has a stalled exercise
        </li>
        <li>
          <i className="atlas-map-legend__swatch atlas-map-legend__swatch--muted" aria-hidden="true" />
          Not enough data
        </li>
      </ul>
    );
  }
  return (
    <ul className="atlas-map-legend" aria-label="Map key">
      <li>
        <i className="atlas-map-legend__ramp" aria-hidden="true" />
        Less → more
      </li>
      <li>
        <i className="atlas-map-legend__swatch atlas-map-legend__swatch--assist" aria-hidden="true" />
        Assist only
      </li>
      <li>
        <i className="atlas-map-legend__swatch atlas-map-legend__swatch--selected" aria-hidden="true" />
        Selected
      </li>
    </ul>
  );
}

function SelectionDetail({
  selection,
  model,
  exercises,
  onClear,
}: {
  selection: Selection;
  model: MuscleMapViewModel;
  exercises: ProgressData['exercises'];
  onClear: () => void;
}) {
  const byId = new Map(model.muscles.map((m) => [m.muscle_id, m]));
  const active = selection.muscleIds.filter((id) => byId.has(id));

  // One list of exercises across the selected muscles (an exercise that hits two of them appears once).
  const exerciseRows = new Map<string, { sets: number; state?: MusclePerformanceState }>();
  for (const id of active) {
    for (const ex of byId.get(id)?.exercises ?? []) {
      const existing = exerciseRows.get(ex.exercise_id);
      exerciseRows.set(ex.exercise_id, {
        sets: Math.max(existing?.sets ?? 0, ex.sets),
        state: ex.performance_state ?? existing?.state,
      });
    }
  }

  return (
    <section className="atlas-panel atlas-muscle-detail" aria-label={`${selection.label} detail`}>
      <div className="atlas-muscle-detail__head">
        <h3>{selection.label}</h3>
        <button type="button" className="atlas-link-button" onClick={onClear}>
          Clear
        </button>
      </div>
      {active.length === 0 ? (
        <p className="atlas-muscle-detail__none">Nothing recorded for this in this view.</p>
      ) : (
        <dl className="atlas-muscle-detail__values">
          {active.map((id) => {
            const entry = byId.get(id) as MuscleMapEntry;
            const meta = metaText(model.mode, entry);
            return (
              <div key={id}>
                <dt>{getMuscle(id)?.name ?? id}</dt>
                <dd>
                  {valueText(model.mode, entry)}
                  {meta ? <small> · {meta}</small> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {exerciseRows.size > 0 && (
        <>
          <h4>Exercises</h4>
          <ul className="atlas-muscle-detail__exercises">
            {[...exerciseRows.entries()]
              .sort((a, b) => b[1].sets - a[1].sets)
              .map(([exerciseId, row]) => (
                <li key={exerciseId}>
                  <span>{formatExerciseName(exercises.get(exerciseId)?.name ?? 'Exercise')}</span>
                  <span>
                    {pluralize(row.sets, 'set')}
                    {row.state ? ` · ${PERFORMANCE_STATE_LABEL[row.state]}` : ''}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
