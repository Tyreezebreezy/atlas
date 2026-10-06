import { useEffect, useRef, useState } from 'react';
import { compareByName, newId } from '@atlas/core';
import {
  createProgram,
  createProgramDay,
  createProgramWeek,
  programProgressionMode,
  resolveDayWeekday,
  shouldShowWeekLabel,
  setActiveProgram,
} from '@atlas/program-engine';
import { reorder, withSequentialOrder } from '@atlas/workout-engine';
import type { Program, ProgramDay, ProgramWeek, WorkoutTemplate } from '@atlas/data-model';
import { ProgressionPolicyFields } from './ProgressionPolicyFields';
import { TemplateEditor } from './TemplateEditor';
import type { AtlasStorage } from '@atlas/storage';

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface ProgramEditorProps {
  storage: AtlasStorage;
  programId: string | null;
  templates: WorkoutTemplate[];
  /** A workout was edited, duplicated or deleted from inside this editor: the caller's list is stale. */
  onTemplatesChanged: () => void;
  onDone: () => void;
}

export function ProgramEditor({
  storage,
  programId,
  templates,
  onTemplatesChanged,
  onDone,
}: ProgramEditorProps) {
  const [program, setProgram] = useState<Program | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  // The confirmation replaces the action row at the bottom of a long page: bring all of it into view.
  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.scrollIntoView({ block: 'nearest' });
  }, [confirmingDelete]);
  // Editing a day's workout swaps this view for the workout editor while the unsaved program stays in state here.
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const openedFromDayId = useRef<string | null>(null);
  // Back from the workout editor, land on the day's Edit button again (which also scrolls it into view).
  useEffect(() => {
    if (editingTemplateId !== null || openedFromDayId.current === null) return;
    document.getElementById(`edit-workout-${openedFromDayId.current}`)?.focus();
    openedFromDayId.current = null;
  }, [editingTemplateId]);
  // Management/discovery ordering only (v0.2.2) -- picking which template a
  // day uses, not the day's own programmed exercise order.
  const sortedTemplates = [...templates].sort(compareByName);

  useEffect(() => {
    void (async () => {
      const existing = programId ? await storage.programs.get(programId) : undefined;
      setProgram(existing ?? createProgram('', null));
    })();
  }, [storage, programId]);

  if (!program) {
    return (
      <div className="atlas-empty-screen">
        <h1>Program</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (editingTemplateId) {
    return (
      <TemplateEditor
        storage={storage}
        templateId={editingTemplateId}
        isQuickWorkoutDefault={false}
        onDone={() => {
          setEditingTemplateId(null);
          onTemplatesChanged();
        }}
      />
    );
  }

  function addWeek() {
    setProgram((prev) =>
      prev ? { ...prev, weeks: [...prev.weeks, createProgramWeek(prev.weeks.length, null)] } : prev,
    );
  }

  function duplicateWeek(weekIndex: number) {
    setProgram((prev) => {
      if (!prev) return prev;
      const week = prev.weeks[weekIndex];
      if (!week) return prev;
      const copy: ProgramWeek = {
        id: newId(),
        order: prev.weeks.length,
        label: week.label,
        days: week.days.map((day) => ({ ...day, id: newId() })),
      };
      return { ...prev, weeks: [...prev.weeks, copy] };
    });
  }

  function removeWeek(weekIndex: number) {
    setProgram((prev) =>
      prev
        ? { ...prev, weeks: withSequentialOrder(prev.weeks.filter((_, i) => i !== weekIndex)) }
        : prev,
    );
  }

  function addDay(weekIndex: number) {
    const firstTemplate = sortedTemplates[0];
    if (!firstTemplate) return;
    setProgram((prev) => {
      if (!prev) return prev;
      const weeks = prev.weeks.map((week, i) => {
        if (i !== weekIndex) return week;
        return {
          ...week,
          days: [...week.days, createProgramDay(week.days.length, '', firstTemplate.id)],
        };
      });
      return { ...prev, weeks };
    });
  }

  function updateDay(weekIndex: number, dayIndex: number, patch: Partial<ProgramDay>) {
    setProgram((prev) => {
      if (!prev) return prev;
      const weeks = prev.weeks.map((week, wi) => {
        if (wi !== weekIndex) return week;
        return {
          ...week,
          days: week.days.map((day, di) => (di === dayIndex ? { ...day, ...patch } : day)),
        };
      });
      return { ...prev, weeks };
    });
  }

  function moveDay(weekIndex: number, dayIndex: number, direction: -1 | 1) {
    setProgram((prev) => {
      if (!prev) return prev;
      const week = prev.weeks[weekIndex];
      if (!week) return prev;
      const target = dayIndex + direction;
      if (target < 0 || target >= week.days.length) return prev;
      const weeks = prev.weeks.map((w, wi) =>
        wi === weekIndex
          ? { ...w, days: withSequentialOrder(reorder(w.days, dayIndex, target)) }
          : w,
      );
      return { ...prev, weeks };
    });
  }

  function removeDay(weekIndex: number, dayIndex: number) {
    setProgram((prev) => {
      if (!prev) return prev;
      const weeks = prev.weeks.map((week, wi) =>
        wi === weekIndex
          ? { ...week, days: withSequentialOrder(week.days.filter((_, di) => di !== dayIndex)) }
          : week,
      );
      return { ...prev, weeks };
    });
  }

  /** Every day's workout is editable from here, whether or not it is also shown in Quick Workouts. */
  function editWorkoutButton(day: ProgramDay) {
    const workout = sortedTemplates.find((template) => template.id === day.template_id);
    // A deleted workout has nothing to edit; the Workout select beside it already says so.
    if (!workout) return null;
    return (
      <button
        type="button"
        id={`edit-workout-${day.id}`}
        className="atlas-program-editor__edit-workout"
        aria-label={`Edit workout ${workout.name}`}
        onClick={() => {
          openedFromDayId.current = day.id;
          setEditingTemplateId(workout.id);
        }}
      >
        Edit workout
      </button>
    );
  }

  function finalize(current: Program): Program {
    return {
      ...current,
      name: current.name.trim() || 'Untitled Program',
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
  }

  async function handleSave() {
    if (!program) return;
    await storage.programs.put(finalize(program));
    onDone();
  }

  async function handleActivate() {
    if (!program) return;
    await storage.programs.put(finalize(program));
    await setActiveProgram(storage, program.id);
    onDone();
  }

  async function handleDelete() {
    if (!program) return;
    await storage.programs.softDelete(program.id);
    onDone();
  }

  return (
    <div className="atlas-program-editor">
      <button type="button" className="atlas-template-editor__back" onClick={onDone}>
        &larr; Back
      </button>

      <label htmlFor="program-name">Name</label>
      <input
        id="program-name"
        placeholder="New Program"
        value={program.name}
        onChange={(e) => setProgram({ ...program, name: e.target.value })}
      />

      <label htmlFor="program-description">Description</label>
      <textarea
        id="program-description"
        value={program.description ?? ''}
        onChange={(e) => setProgram({ ...program, description: e.target.value || null })}
      />

      <fieldset className="atlas-program-editor__mode">
        <legend>Schedule Type</legend>
        <label>
          <input
            type="radio"
            name="progression-mode"
            checked={programProgressionMode(program) === 'fixed'}
            onChange={() => setProgram({ ...program, progression_mode: 'fixed' })}
          />
          Weekday Schedule &mdash; workouts repeat on the weekdays you assign; Today shows whichever
          one matches today
        </label>
        <label>
          <input
            type="radio"
            name="progression-mode"
            checked={programProgressionMode(program) === 'sequential'}
            onChange={() => setProgram({ ...program, progression_mode: 'sequential' })}
          />
          Sequential &mdash; workouts advance in order regardless of weekday; a missed day stays
          next, it isn&rsquo;t skipped
        </label>
      </fieldset>

      <ProgressionPolicyFields
        idPrefix="program-default-progression"
        policy={program.default_progression_policy}
        onChange={(policy) => setProgram({ ...program, default_progression_policy: policy })}
      />

      {(() => {
        const showWeekLabel = shouldShowWeekLabel(program);
        const isWeekly = programProgressionMode(program) === 'fixed';
        return program.weeks.map((week, weekIndex) => (
          <div key={week.id} className="atlas-program-editor__week">
            <div className="atlas-program-editor__week-header">
              {showWeekLabel && <h2>{week.label || `Week ${weekIndex + 1}`}</h2>}
              <div className="atlas-template-editor__exercise-actions">
                <button type="button" onClick={() => duplicateWeek(weekIndex)}>
                  Duplicate
                </button>
                <button type="button" onClick={() => removeWeek(weekIndex)}>
                  Remove
                </button>
              </div>
            </div>
            <ul className="atlas-program-editor__days">
              {week.days.map((day, dayIndex) => (
                <li key={day.id} className="atlas-program-editor__day">
                  <input
                    aria-label="Day label"
                    placeholder="Day"
                    value={day.label}
                    onChange={(e) => updateDay(weekIndex, dayIndex, { label: e.target.value })}
                  />
                  {isWeekly && (
                    <select
                      aria-label="Weekday"
                      value={resolveDayWeekday(day) ?? ''}
                      onChange={(e) =>
                        updateDay(weekIndex, dayIndex, {
                          weekday: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Not scheduled</option>
                      {WEEKDAY_LABELS.map((label, i) => (
                        <option key={label} value={i}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    aria-label="Workout"
                    value={day.template_id}
                    onChange={(e) =>
                      updateDay(weekIndex, dayIndex, { template_id: e.target.value })
                    }
                  >
                    {/* A day whose workout was deleted must say so, not quietly show the first workout in the list. */}
                    {!sortedTemplates.some((template) => template.id === day.template_id) && (
                      <option value={day.template_id} disabled>
                        (this workout no longer exists)
                      </option>
                    )}
                    {sortedTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  {editWorkoutButton(day)}
                  {/* One unit, so a narrow row wraps the three together instead of scattering them. */}
                  <div className="atlas-program-editor__day-actions">
                    <button
                      type="button"
                      aria-label="Move day up"
                      disabled={dayIndex === 0}
                      onClick={() => moveDay(weekIndex, dayIndex, -1)}
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      aria-label="Move day down"
                      disabled={dayIndex === week.days.length - 1}
                      onClick={() => moveDay(weekIndex, dayIndex, 1)}
                    >
                      &darr;
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${day.label.trim() || 'day'}`}
                      onClick={() => removeDay(weekIndex, dayIndex)}
                    >
                      &times;
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => addDay(weekIndex)}
              disabled={templates.length === 0}
            >
              + Add Day
            </button>
          </div>
        ));
      })()}

      <button type="button" className="atlas-library__create" onClick={addWeek}>
        + Add Week
      </button>

      {templates.length === 0 && (
        <p className="atlas-program-screen__empty">
          Create a Quick Workout first, then come back to add days to this program.
        </p>
      )}

      {confirmingDelete ? (
        <div
          ref={confirmRef}
          className="atlas-inline-confirm"
          role="group"
          aria-label={`Delete ${program.name.trim() || 'this program'}?`}
        >
          <p>
            Delete {program.name.trim() || 'this program'}? Past workouts stay in your history.
            {program.is_active
              ? ' This is your active program, so Today has no schedule until you activate another.'
              : ''}{' '}
            This can&rsquo;t be undone.
          </p>
          <button
            type="button"
            className="atlas-btn atlas-btn--secondary"
            onClick={() => setConfirmingDelete(false)}
          >
            Keep it
          </button>
          <button
            type="button"
            className="atlas-btn atlas-btn--primary"
            onClick={() => void handleDelete()}
          >
            Delete {program.name.trim() || 'program'}
          </button>
        </div>
      ) : (
        <div className="atlas-template-editor__actions">
          {programId && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-expanded={confirmingDelete}
            >
              Delete…
            </button>
          )}
          {!program.is_active && (
            <button type="button" onClick={() => void handleActivate()}>
              Save &amp; Activate
            </button>
          )}
          <button
            type="button"
            className="atlas-template-editor__save"
            onClick={() => void handleSave()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
