import { useEffect, useMemo, useState } from 'react';
import { setActiveProgram } from '@atlas/program-engine';
import type { Program, WorkoutTemplate } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { ProgramEditor } from './ProgramEditor';
import { TemplateEditor } from './TemplateEditor';

type View =
  | { kind: 'list' }
  | { kind: 'program'; programId: string | null }
  | { kind: 'template'; templateId: string | null; isQuickWorkout: boolean };

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

  const quickWorkouts = useMemo(() => templates.filter((t) => t.is_quick_workout), [templates]);

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

  return (
    <div className="atlas-program-screen">
      <h1>Program</h1>

      <section>
        <h2>Programs</h2>
        {programs.length === 0 && <p className="atlas-program-screen__empty">No programs yet.</p>}
        <ul className="atlas-program-screen__list">
          {programs.map((program) => (
            <li key={program.id}>
              <button
                type="button"
                onClick={() => setView({ kind: 'program', programId: program.id })}
                aria-label={`${program.name}, ${program.weeks.length} week${program.weeks.length === 1 ? '' : 's'}${program.is_active ? ', active' : ''}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {program.name}
                </span>
                <span className="atlas-library__item-meta" aria-hidden="true">
                  {program.weeks.length} week{program.weeks.length === 1 ? '' : 's'}
                  {program.is_active ? ' · active' : ''}
                </span>
              </button>
              {!program.is_active && (
                <button
                  type="button"
                  className="atlas-program-screen__activate"
                  onClick={() => void setActiveProgram(storage, program.id).then(reload)}
                >
                  Activate
                </button>
              )}
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
    </div>
  );
}
