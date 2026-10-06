import { useEffect, useState } from 'react';
import { localIsoDate, sessionLocalDate } from '@atlas/core';
import { startWorkoutSession } from '@atlas/workout-engine';
import { applyProgressionToSession } from '@atlas/program-engine';
import type { Exercise, Program, WorkoutSession, WorkoutTemplate } from '@atlas/data-model';
import { useGymMode } from '../gym/GymModeContext';
import { useStorage } from '../storage/StorageContext';
import { recalculatePRsForSession } from '../progress/recalculatePRs';
import { logPastProblem, pastMinutes } from './logPastProblem';

interface LogPastWorkoutScreenProps {
  onBack: () => void;
}

/**
 * "Log Past Workout" -- date/time/duration up front, then hands off to the
 * exact same Gym Mode engine and UI every other workout uses (see
 * `startWorkoutSession`'s `startedAt`/`plannedCompletedAt`, added in v0.2.0
 * specifically for this). No second logging system. Progression resolves
 * against the BACKDATED date as its chronology boundary
 * (`applyProgressionToSession`'s `nowIso` param), so a workout entered
 * today for three weeks ago computes its target from what was actually
 * true three weeks ago, not from sessions that happened since. See
 * docs/DATA_MODEL.md "Historical workouts" and "Chronology safety."
 */
export function LogPastWorkoutScreen({ onBack }: LogPastWorkoutScreenProps) {
  const storage = useStorage();
  const { enterGymMode } = useGymMode();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [exercisesById, setExercisesById] = useState<Map<string, Exercise>>(new Map());

  // The device-local day -- not the UTC date, which is already "tomorrow" on a US evening.
  const [date, setDate] = useState(localIsoDate());
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [templateId, setTemplateId] = useState<string>('freestyle');
  const [collision, setCollision] = useState<WorkoutSession | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      const [allTemplates, allPrograms, sessions, exercises] = await Promise.all([
        storage.workoutTemplates.getAll(),
        storage.programs.getAll(),
        storage.workoutSessions.getAll(),
        storage.exercises.getAll(),
      ]);
      setTemplates(allTemplates);
      setPrograms(allPrograms);
      setAllSessions(sessions);
      setExercisesById(new Map(exercises.map((e) => [e.id, e])));
      setLoading(false);
    })();
  }, [storage]);

  function computeTimestamps(): { startedAt: string; plannedCompletedAt: string } {
    const time = startTime || '12:00';
    const started = new Date(`${date}T${time}:00`);
    const completed = new Date(started.getTime() + pastMinutes(durationMinutes) * 60000);
    return { startedAt: started.toISOString(), plannedCompletedAt: completed.toISOString() };
  }

  async function createAndEnter() {
    if (!storage) return;
    const { startedAt, plannedCompletedAt } = computeTimestamps();
    const template = templates.find((t) => t.id === templateId);
    const program = template
      ? programs.find((p) => p.weeks.some((w) => w.days.some((d) => d.template_id === template.id)))
      : null;
    const programDay = program?.weeks
      .flatMap((w) => w.days)
      .find((d) => d.template_id === template?.id);

    const plannedSnapshot = template
      ? applyProgressionToSession(
          template.exercises,
          program ?? null,
          exercisesById,
          allSessions,
          startedAt, // chronology boundary: resolve against what was true back then
        )
      : [];

    const session = startWorkoutSession({
      name: template ? template.name : 'Freestyle Workout',
      templateId: template?.id ?? null,
      programId: program?.id ?? null,
      programDayId: programDay?.id ?? null,
      plannedSnapshot,
      groups: template?.groups ?? [],
      startedAt,
      plannedCompletedAt,
      // vNext Handoff 04B: the date the owner picked IS the calendar day this workout counts toward,
      // whatever zone this device is in now. No time zone is recorded for it -- it is not known.
      performedLocalDate: date,
      // v0.2.4: a backfilled Program day should complete/link its own
      // occurrence too (using the owner's chosen historical date, not
      // today) -- otherwise it would keep showing up as Missed despite
      // genuinely having been logged. Distinct from `startedAt` above:
      // that backdates the performed timestamps (Log Past Workout's own
      // job); this only says which occurrence this fulfills.
      scheduledDate: programDay ? date : null,
    });
    await storage.workoutSessions.put(session);
    enterGymMode(session.id);
  }

  function handleSubmit() {
    const invalid = logPastProblem({ date, startTime, durationMinutes });
    setProblem(invalid);
    if (invalid) return;
    const existing = allSessions.find(
      (s) => s.status === 'completed' && sessionLocalDate(s) === date,
    );
    if (existing) {
      setCollision(existing);
      return;
    }
    void createAndEnter();
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Log Past Workout</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (collision) {
    return (
      <div className="atlas-log-past">
        <button
          type="button"
          className="atlas-template-editor__back"
          onClick={() => setCollision(null)}
        >
          &larr; Back
        </button>
        <h1>Workout Already Logged</h1>
        <p>
          "{collision.name}" is already logged on {date}. What would you like to do?
        </p>
        <p className="atlas-settings__hint">
          Keep Both adds a second workout on that day. Replace Existing discards the earlier one
          &mdash; its sets, and any records they set &mdash; and starts a new one.
        </p>
        <div className="atlas-resume-card__actions">
          <button type="button" onClick={() => setCollision(null)}>
            Cancel
          </button>
          <button type="button" onClick={() => void createAndEnter()}>
            Keep Both
          </button>
          <button
            type="button"
            onClick={async () => {
              // "Replace Existing" discards the prior session (a status
              // change, not a delete, same as every other discard in
              // ATLAS) rather than silently merging two unrelated sessions.
              const { discardWorkoutSession } = await import('@atlas/workout-engine');
              await storage.workoutSessions.put(discardWorkoutSession(collision));
              // Records are derived from completed history: the discarded workout's go with it (they used to stay,
              // so Strength / the Library kept a personal record from a workout that no longer exists).
              await recalculatePRsForSession(
                storage,
                collision.performed_sets.map((set) => set.exercise_id),
                exercisesById,
              );
              setCollision(null);
              await createAndEnter();
            }}
          >
            Replace Existing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="atlas-log-past">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Log Past Workout</h1>

      <label>
        Date
        <input
          type="date"
          value={date}
          max={localIsoDate()}
          onChange={(e) => {
            setDate(e.target.value);
            setProblem(null);
          }}
        />
      </label>
      <label>
        Approximate start time (optional)
        <input
          type="time"
          value={startTime}
          onChange={(e) => {
            setStartTime(e.target.value);
            setProblem(null);
          }}
        />
      </label>
      <label>
        Duration, minutes (if known)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          value={durationMinutes}
          onChange={(e) => {
            setDurationMinutes(e.target.value);
            setProblem(null);
          }}
        />
      </label>
      <label>
        Workout
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="freestyle">Freestyle (no template)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {problem && (
        <p className="atlas-field__error" role="alert">
          {problem}
        </p>
      )}
      <button type="button" className="atlas-resume-card__resume" onClick={handleSubmit}>
        Start Logging
      </button>
    </div>
  );
}
