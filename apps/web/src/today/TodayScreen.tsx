import { useEffect, useState } from 'react';
import {
  discardWorkoutSession,
  skipWorkoutSession,
  startWorkoutSession,
} from '@atlas/workout-engine';
import {
  advanceProgramSequence,
  applyProgressionToSession,
  currentSequentialDay,
  findOccurrence,
  moveOccurrence,
  programProgressionMode,
} from '@atlas/program-engine';
import type {
  Exercise,
  Program,
  WorkoutOccurrence,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';
import { useGymMode } from '../gym/GymModeContext';
import { useStorage } from '../storage/StorageContext';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

interface MoveRowProps {
  onCancel: () => void;
  onConfirm: (newDate: string) => void;
}

/** Move never rewrites the Program template -- it records a
 * WorkoutOccurrence with the original date preserved and a new effective
 * date. See docs/DATA_MODEL.md "Scheduling." */
function MoveRow({ onCancel, onConfirm }: MoveRowProps) {
  const [date, setDate] = useState(todayIso());
  return (
    <div className="atlas-today__skip-row">
      <input
        type="date"
        aria-label="Move to date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={() => onConfirm(date)} disabled={!date}>
        Confirm Move
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
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [exercisesById, setExercisesById] = useState<Map<string, Exercise>>(new Map());
  const [occurrences, setOccurrences] = useState<WorkoutOccurrence[]>([]);

  async function reload() {
    if (!storage) return;
    const [sessions, programs, allTemplates, exercises, allOccurrences] = await Promise.all([
      storage.workoutSessions.getAll(),
      storage.programs.getAll(),
      storage.workoutTemplates.getAll(),
      storage.exercises.getAll(),
      storage.workoutOccurrences.getAll(),
    ]);
    setActiveSession(sessions.find((s) => s.status === 'in_progress') ?? null);
    setActiveProgram(programs.find((p) => p.is_active) ?? null);
    setTemplates(new Map(allTemplates.map((t) => [t.id, t])));
    setAllSessions(sessions);
    setExercisesById(new Map(exercises.map((e) => [e.id, e])));
    setOccurrences(allOccurrences);
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
    isDeload = false,
  ) {
    if (!storage) return;
    // Deload sessions are fully logged like any other -- they only need to
    // be excluded from future progression baselines (see
    // findPreviousNormalSession), never from progression itself: a deload
    // day's own target still resolves from the last *normal* session, same
    // as any other day.
    const plannedSnapshot = applyProgressionToSession(
      template.exercises,
      activeProgram,
      exercisesById,
      allSessions,
    );
    const session = startWorkoutSession({
      name: template.name,
      templateId: template.id,
      programId,
      programDayId,
      plannedSnapshot,
      groups: template.groups,
    });
    await storage.workoutSessions.put(isDeload ? { ...session, is_deload: true } : session);
    enterGymMode(session.id);
  }

  /** Start with an empty workout -- no Program or template required. Uses
   * the exact same session-lifecycle engine as every other workout; only
   * the entry point differs (see docs/DATA_MODEL.md "Freestyle"). */
  async function startFreestyle() {
    if (!storage) return;
    const session = startWorkoutSession({
      name: 'Freestyle Workout',
      templateId: null,
      programId: null,
      programDayId: null,
      plannedSnapshot: [],
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

  /** Records a WorkoutOccurrence for today's slot rather than editing the
   * Program -- the template/day this occurrence points at is unchanged;
   * only where it's scheduled moves. See docs/DATA_MODEL.md "Scheduling." */
  async function handleMove(programId: string, programDayId: string, newDate: string) {
    if (!storage) return;
    const originalDate = todayIso();
    const existing = findOccurrence(occurrences, programDayId, originalDate);
    const occurrence = moveOccurrence(existing, programId, programDayId, originalDate, newDate);
    await storage.workoutOccurrences.put(occurrence);
    setMovingKey(null);
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

      <button
        type="button"
        className="atlas-today__freestyle"
        onClick={() => void startFreestyle()}
      >
        Start Freestyle Workout
      </button>

      {activeProgram && programProgressionMode(activeProgram) === 'sequential' ? (
        <section>
          <h2>{activeProgram.name}</h2>
          {(() => {
            const next = currentSequentialDay(activeProgram);
            if (!next) {
              return <p className="atlas-program-screen__empty">This program has no days yet.</p>;
            }
            const template = templates.get(next.day.template_id);
            const todaysOccurrence = findOccurrence(occurrences, next.day.id, todayIso());
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
            if (movingKey === next.day.id) {
              return (
                <ul className="atlas-program-screen__list">
                  <li>
                    <MoveRow
                      onCancel={() => setMovingKey(null)}
                      onConfirm={(newDate) =>
                        void handleMove(activeProgram.id, next.day.id, newDate)
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
                      {todaysOccurrence?.status === 'moved' &&
                        ` — moved to ${todaysOccurrence.effective_date}`}
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
                  <button
                    type="button"
                    className="atlas-program-screen__activate"
                    disabled={!template}
                    onClick={() => setMovingKey(next.day.id)}
                    aria-label={`Move ${next.day.label || 'Day'}`}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className="atlas-program-screen__activate"
                    disabled={!template}
                    onClick={() =>
                      template && startFromTemplate(template, activeProgram.id, next.day.id, true)
                    }
                    aria-label={`Start ${next.day.label || 'Day'} as a deload`}
                    title="Fully logged, but won't become the baseline for future progression"
                  >
                    Start as Deload
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
                  const todaysOccurrence = findOccurrence(occurrences, day.id, todayIso());
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
                  if (movingKey === day.id) {
                    return (
                      <li key={day.id}>
                        <MoveRow
                          onCancel={() => setMovingKey(null)}
                          onConfirm={(newDate) =>
                            void handleMove(activeProgram.id, day.id, newDate)
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
                          {todaysOccurrence?.status === 'moved' &&
                            ` — moved to ${todaysOccurrence.effective_date}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="atlas-program-screen__activate"
                        disabled={!template}
                        onClick={() => setMovingKey(day.id)}
                        aria-label={`Move ${day.label || 'Day'}, week ${weekIndex + 1}`}
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        className="atlas-program-screen__activate"
                        disabled={!template}
                        onClick={() =>
                          template && startFromTemplate(template, activeProgram.id, day.id, true)
                        }
                        aria-label={`Start ${day.label || 'Day'}, week ${weekIndex + 1} as a deload`}
                        title="Fully logged, but won't become the baseline for future progression"
                      >
                        Start as Deload
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
