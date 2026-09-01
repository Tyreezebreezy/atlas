import { useEffect, useState } from 'react';
import {
  discardWorkoutSession,
  skipWorkoutSession,
  startWorkoutSession,
} from '@atlas/workout-engine';
import {
  advanceProgramSequence,
  currentSequentialDay,
  programProgressionMode,
} from '@atlas/program-engine';
import type { Program, WorkoutSession, WorkoutTemplate } from '@atlas/data-model';
import { useGymMode } from '../gym/GymModeContext';
import { useStorage } from '../storage/StorageContext';

interface SkipRowProps {
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}

/** Inline confirm-with-optional-reason, replacing the row's own Start button -- same toggle pattern as the discard confirm below. */
function SkipRow({ onCancel, onConfirm }: SkipRowProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="atlas-today__skip-row">
      <input
        type="text"
        aria-label="Reason for skipping (optional)"
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={() => onConfirm(reason || null)}>
        Confirm Skip
      </button>
    </div>
  );
}

export function TodayScreen() {
  const storage = useStorage();
  const { enterGymMode } = useGymMode();
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [templates, setTemplates] = useState<Map<string, WorkoutTemplate>>(new Map());
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [skippingKey, setSkippingKey] = useState<string | null>(null);

  async function reload() {
    if (!storage) return;
    const [sessions, programs, allTemplates] = await Promise.all([
      storage.workoutSessions.getAll(),
      storage.programs.getAll(),
      storage.workoutTemplates.getAll(),
    ]);
    setActiveSession(sessions.find((s) => s.status === 'in_progress') ?? null);
    setActiveProgram(programs.find((p) => p.is_active) ?? null);
    setTemplates(new Map(allTemplates.map((t) => [t.id, t])));
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  async function startFromTemplate(
    template: WorkoutTemplate,
    programId: string | null,
    programDayId: string | null,
  ) {
    if (!storage) return;
    const session = startWorkoutSession({
      name: template.name,
      templateId: template.id,
      programId,
      programDayId,
      plannedSnapshot: template.exercises,
      groups: template.groups,
    });
    await storage.workoutSessions.put(session);
    enterGymMode(session.id);
  }

  async function handleDiscard() {
    if (!storage || !activeSession) return;
    await storage.workoutSessions.put(discardWorkoutSession(activeSession));
    setConfirmingDiscard(false);
    await reload();
  }

  async function handleSkip(
    template: WorkoutTemplate,
    programId: string | null,
    programDayId: string | null,
    reason: string | null,
  ) {
    if (!storage) return;
    const session = skipWorkoutSession({
      name: template.name,
      templateId: template.id,
      programId,
      programDayId,
      plannedSnapshot: template.exercises,
      groups: template.groups,
      reason,
    });
    await storage.workoutSessions.put(session);
    // An intentional skip still advances a sequential program -- only a
    // missed day (never opened) stays "next." See sequentialProgress.ts.
    if (programId && programDayId) {
      const program = await storage.programs.get(programId);
      if (program) await storage.programs.put(advanceProgramSequence(program, programDayId));
    }
    setSkippingKey(null);
    await reload();
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Today</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (activeSession) {
    const elapsedMinutes = Math.max(
      0,
      Math.round((Date.now() - new Date(activeSession.started_at).getTime()) / 60000),
    );
    const completedCount = activeSession.performed_sets.length;
    const plannedCount = activeSession.planned_snapshot.reduce(
      (sum, e) => sum + (e.target_sets ?? 1),
      0,
    );
    return (
      <div className="atlas-today">
        <h1>Today</h1>
        <div className="atlas-resume-card">
          <h2>Workout in Progress</h2>
          <p className="atlas-resume-card__name">{activeSession.name}</p>
          <p className="atlas-resume-card__meta">
            Started {elapsedMinutes} minute{elapsedMinutes === 1 ? '' : 's'} ago &middot;{' '}
            {completedCount} / {Math.max(plannedCount, completedCount)} sets complete
          </p>
          {confirmingDiscard ? (
            <div className="atlas-resume-card__confirm">
              <p>Discard this workout? Completed sets will be kept as a discarded session.</p>
              <div className="atlas-resume-card__actions">
                <button type="button" onClick={() => setConfirmingDiscard(false)}>
                  Cancel
                </button>
                <button type="button" onClick={() => void handleDiscard()}>
                  Yes, Discard
                </button>
              </div>
            </div>
          ) : (
            <div className="atlas-resume-card__actions">
              <button type="button" onClick={() => setConfirmingDiscard(true)}>
                Discard
              </button>
              <button
                type="button"
                className="atlas-resume-card__resume"
                onClick={() => enterGymMode(activeSession.id)}
              >
                Resume
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const quickWorkouts = [...templates.values()].filter((t) => t.is_quick_workout);

  return (
    <div className="atlas-today">
      <h1>Today</h1>

      {activeProgram && programProgressionMode(activeProgram) === 'sequential' ? (
        <section>
          <h2>{activeProgram.name}</h2>
          {(() => {
            const next = currentSequentialDay(activeProgram);
            if (!next) {
              return <p className="atlas-program-screen__empty">This program has no days yet.</p>;
            }
            const template = templates.get(next.day.template_id);
            if (skippingKey === next.day.id && template) {
              return (
                <ul className="atlas-program-screen__list">
                  <li>
                    <SkipRow
                      onCancel={() => setSkippingKey(null)}
                      onConfirm={(reason) =>
                        void handleSkip(template, activeProgram.id, next.day.id, reason)
                      }
                    />
                  </li>
                </ul>
              );
            }
            return (
              <ul className="atlas-program-screen__list">
                <li>
                  <button
                    type="button"
                    disabled={!template}
                    onClick={() =>
                      template && startFromTemplate(template, activeProgram.id, next.day.id)
                    }
                    aria-label={`Start next workout, ${next.day.label || 'Day'}${template ? `, ${template.name}` : ''}`}
                  >
                    <span className="atlas-library__item-name" aria-hidden="true">
                      Next: {next.day.label || 'Day'}
                    </span>
                    <span className="atlas-library__item-meta" aria-hidden="true">
                      {template ? template.name : 'Workout not found'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="atlas-program-screen__activate"
                    disabled={!template}
                    onClick={() => setSkippingKey(next.day.id)}
                    aria-label={`Skip ${next.day.label || 'Day'}`}
                  >
                    Skip
                  </button>
                </li>
              </ul>
            );
          })()}
        </section>
      ) : (
        activeProgram && (
          <section>
            <h2>{activeProgram.name}</h2>
            {activeProgram.weeks.length === 0 && (
              <p className="atlas-program-screen__empty">This program has no weeks yet.</p>
            )}
            {activeProgram.weeks.map((week, weekIndex) => (
              <ul key={week.id} className="atlas-program-screen__list">
                {week.days.map((day) => {
                  const template = templates.get(day.template_id);
                  if (skippingKey === day.id && template) {
                    return (
                      <li key={day.id}>
                        <SkipRow
                          onCancel={() => setSkippingKey(null)}
                          onConfirm={(reason) =>
                            void handleSkip(template, activeProgram.id, day.id, reason)
                          }
                        />
                      </li>
                    );
                  }
                  return (
                    <li key={day.id}>
                      <button
                        type="button"
                        disabled={!template}
                        onClick={() =>
                          template && startFromTemplate(template, activeProgram.id, day.id)
                        }
                        aria-label={`Start ${day.label || 'Day'}, week ${weekIndex + 1}${template ? `, ${template.name}` : ''}`}
                      >
                        <span className="atlas-library__item-name" aria-hidden="true">
                          Week {weekIndex + 1} &middot; {day.label || 'Day'}
                        </span>
                        <span className="atlas-library__item-meta" aria-hidden="true">
                          {template ? template.name : 'Workout not found'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="atlas-program-screen__activate"
                        disabled={!template}
                        onClick={() => setSkippingKey(day.id)}
                        aria-label={`Skip ${day.label || 'Day'}, week ${weekIndex + 1}`}
                      >
                        Skip
                      </button>
                    </li>
                  );
                })}
              </ul>
            ))}
          </section>
        )
      )}

      <section>
        <h2>Quick Workouts</h2>
        {quickWorkouts.length === 0 ? (
          <p className="atlas-program-screen__empty">
            No quick workouts yet &mdash; create one from the Program tab.
          </p>
        ) : (
          <ul className="atlas-program-screen__list">
            {quickWorkouts.map((template) =>
              skippingKey === template.id ? (
                <li key={template.id}>
                  <SkipRow
                    onCancel={() => setSkippingKey(null)}
                    onConfirm={(reason) => void handleSkip(template, null, null, reason)}
                  />
                </li>
              ) : (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => void startFromTemplate(template, null, null)}
                    aria-label={`Start ${template.name}`}
                  >
                    <span className="atlas-library__item-name" aria-hidden="true">
                      {template.name}
                    </span>
                    <span className="atlas-library__item-meta" aria-hidden="true">
                      {template.exercises.length} exercise
                      {template.exercises.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="atlas-program-screen__activate"
                    onClick={() => setSkippingKey(template.id)}
                    aria-label={`Skip ${template.name}`}
                  >
                    Skip
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {!activeProgram && quickWorkouts.length === 0 && (
        <p className="atlas-program-screen__empty">
          Create a workout on the Program tab to get started.
        </p>
      )}
    </div>
  );
}
