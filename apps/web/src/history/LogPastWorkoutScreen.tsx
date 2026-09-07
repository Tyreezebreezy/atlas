import { useEffect, useState } from 'react';
import { startWorkoutSession } from '@atlas/workout-engine';
import { applyProgressionToSession } from '@atlas/program-engine';
import type { Exercise, Program, WorkoutSession, WorkoutTemplate } from '@atlas/data-model';
import { useGymMode } from '../gym/GymModeContext';
import { useStorage } from '../storage/StorageContext';

interface LogPastWorkoutScreenProps {
  onBack: () => void;
}

function sameCalendarDate(iso: string, date: string): boolean {
  return iso.slice(0, 10) === date;
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

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [templateId, setTemplateId] = useState<string>('freestyle');
  const [collision, setCollision] = useState<WorkoutSession | null>(null);

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
    const minutes = Number(durationMinutes) || 60;
    const completed = new Date(started.getTime() + minutes * 60000);
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
    });
    await storage.workoutSessions.put(session);
    enterGymMode(session.id);
  }

  function handleSubmit() {
    const existing = allSessions.find(
      (s) => s.status === 'completed' && sameCalendarDate(s.completed_at ?? s.started_at, date),
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
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Approximate start time (optional)
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </label>
      <label>
        Duration, minutes (if known)
        <input
          type="number"
          inputMode="numeric"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
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

      <button type="button" className="atlas-resume-card__resume" onClick={handleSubmit}>
        Start Logging
      </button>
    </div>
  );
}
