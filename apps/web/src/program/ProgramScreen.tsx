import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { compareByName } from '@atlas/core';
import { setActiveProgram } from '@atlas/program-engine';
import type { Program, WorkoutTemplate } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { EmptyScreen } from '../screens/EmptyScreen';
import { ProgramEditor } from './ProgramEditor';
import { TemplateEditor } from './TemplateEditor';

// vNext Handoff 03A: reused directly (not rebuilt) so Import is discoverable
// from Program as well as More -- see research pack v3 §16/§7.
const ImportExportScreen = lazy(() =>
  import('../importexport/ImportExportScreen').then((m) => ({ default: m.ImportExportScreen })),
);

type View =
  | { kind: 'list' }
  | { kind: 'program'; programId: string | null }
  | { kind: 'template'; templateId: string | null; isQuickWorkout: boolean }
  | { kind: 'import' };

export function ProgramScreen() {
  const storage = useStorage();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: 'list' });

  async function reload() {
    if (!storage) return;
    const [allPrograms, allTemplates] = await Promise.all([
      storage.programs.getAll(),
      storage.workoutTemplates.getAll(),
    ]);
    setPrograms(allPrograms);
    setTemplates(allTemplates);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // storage identity is stable after first connect; reload is intentionally not a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  const quickWorkouts = useMemo(
    () => templates.filter((t) => t.is_quick_workout).sort(compareByName),
    [templates],
  );

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Program</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (view.kind === 'program') {
    return (
      <ProgramEditor
        storage={storage}
        programId={view.programId}
        templates={templates}
        onDone={() => {
          setView({ kind: 'list' });
          void reload();
        }}
      />
    );
  }

  if (view.kind === 'template') {
    return (
      <TemplateEditor
        storage={storage}
        templateId={view.templateId}
        isQuickWorkoutDefault={view.isQuickWorkout}
        onDone={() => {
          setView({ kind: 'list' });
          void reload();
        }}
      />
    );
  }

  if (view.kind === 'import') {
    return (
      <Suspense fallback={<EmptyScreen title="Import / Export" description="Loading…" />}>
        <ImportExportScreen onBack={() => setView({ kind: 'list' })} />
      </Suspense>
    );
  }

  // vNext Handoff 03A: the active program leads visually (research pack v3
  // §16) -- sorted first and given its own highlighted card -- rather than
  // sitting alphabetically/insertion-order among every other program at
  // equal visual weight.
  const activeProgram = programs.find((p) => p.is_active) ?? null;
  const otherPrograms = programs.filter((p) => p.id !== activeProgram?.id);

  return (
    <div className="atlas-program-screen">
      <h1>Program</h1>

      {activeProgram && (
        <section className="atlas-program-screen__active">
          <h2 className="atlas-program-screen__active-label">Active Program</h2>
          <button
            type="button"
            className="atlas-program-screen__active-card"
            onClick={() => setView({ kind: 'program', programId: activeProgram.id })}
          >
            <span className="atlas-program-screen__active-name">{activeProgram.name}</span>
            <span className="atlas-library__item-meta" aria-hidden="true">
              {activeProgram.weeks.length} week{activeProgram.weeks.length === 1 ? '' : 's'}
            </span>
          </button>
        </section>
      )}

      <section>
        <h2>{activeProgram ? 'Other Programs' : 'Programs'}</h2>
        {otherPrograms.length === 0 && (
          <p className="atlas-program-screen__empty">
            {activeProgram ? 'No other programs.' : 'No programs yet.'}
          </p>
        )}
        <ul className="atlas-program-screen__list">
          {otherPrograms.map((program) => (
            <li key={program.id}>
              <button
                type="button"
                onClick={() => setView({ kind: 'program', programId: program.id })}
                aria-label={`${program.name}, ${program.weeks.length} week${program.weeks.length === 1 ? '' : 's'}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {program.name}
                </span>
                <span className="atlas-library__item-meta" aria-hidden="true">
                  {program.weeks.length} week{program.weeks.length === 1 ? '' : 's'}
                </span>
              </button>
              <button
                type="button"
                className="atlas-program-screen__activate"
                onClick={() => void setActiveProgram(storage, program.id).then(reload)}
              >
                Activate
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="atlas-library__create"
          onClick={() => setView({ kind: 'program', programId: null })}
        >
          + New Program
        </button>
      </section>

      <section>
        <h2>Quick Workouts</h2>
        {quickWorkouts.length === 0 && (
          <p className="atlas-program-screen__empty">No quick workouts yet.</p>
        )}
        <ul className="atlas-program-screen__list">
          {quickWorkouts.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() =>
                  setView({ kind: 'template', templateId: template.id, isQuickWorkout: true })
                }
                aria-label={`${template.name}, ${template.exercises.length} exercise${template.exercises.length === 1 ? '' : 's'}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {template.name}
                </span>
                <span className="atlas-library__item-meta" aria-hidden="true">
                  {template.exercises.length} exercise{template.exercises.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="atlas-library__create"
          onClick={() => setView({ kind: 'template', templateId: null, isQuickWorkout: true })}
        >
          + New Quick Workout
        </button>
      </section>

      <section>
        <h2>Manage</h2>
        <ul className="atlas-program-screen__list">
          <li>
            <button type="button" onClick={() => setView({ kind: 'import' })} aria-label="Import Program">
              <span className="atlas-library__item-name" aria-hidden="true">
                Import Program
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
