import { useEffect, useState } from 'react';
import { newId } from '@atlas/core';
import {
  createProgram,
  createProgramDay,
  createProgramWeek,
  setActiveProgram,
} from '@atlas/program-engine';
import { reorder, withSequentialOrder } from '@atlas/workout-engine';
import type { Program, ProgramDay, ProgramWeek, WorkoutTemplate } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';

interface ProgramEditorProps {
  storage: AtlasStorage;
  programId: string | null;
  templates: WorkoutTemplate[];
  onDone: () => void;
}

export function ProgramEditor({ storage, programId, templates, onDone }: ProgramEditorProps) {
  const [program, setProgram] = useState<Program | null>(null);

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
    const firstTemplate = templates[0];
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

      {program.weeks.map((week, weekIndex) => (
        <div key={week.id} className="atlas-program-editor__week">
          <div className="atlas-program-editor__week-header">
            <h2>Week {weekIndex + 1}</h2>
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
                <select
                  aria-label="Workout"
                  value={day.template_id}
                  onChange={(e) => updateDay(weekIndex, dayIndex, { template_id: e.target.value })}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
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
                  aria-label="Remove day"
                  onClick={() => removeDay(weekIndex, dayIndex)}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => addDay(weekIndex)} disabled={templates.length === 0}>
            + Add Day
          </button>
        </div>
      ))}

      <button type="button" className="atlas-library__create" onClick={addWeek}>
        + Add Week
      </button>

      {templates.length === 0 && (
        <p className="atlas-program-screen__empty">
          Create a Quick Workout first, then come back to add days to this program.
        </p>
      )}

      <div className="atlas-template-editor__actions">
        {programId && (
          <button type="button" onClick={() => void handleDelete()}>
            Delete
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
    </div>
  );
}
