import { useEffect, useState } from 'react';
import { compareByName } from '@atlas/core';
import {
  discardWorkoutSession,
  skipWorkoutSession,
  startWorkoutSession,
} from '@atlas/workout-engine';
import {
  advanceProgramSequence,
  applyProgressionToSession,
  moveOccurrence,
  programProgressionMode,
  resolveUpNext,
  skipOccurrence,
  todaysScheduleEntry,
  type TodayScheduleEntry,
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
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatUpNextDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  });
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

type OverflowAction = null | 'menu' | 'skip' | 'move';

/** Compact "..." overflow menu (v0.2.2) replacing three always-visible
 * Move/Deload/Skip buttons per day -- see docs/DATA_MODEL.md "Today card
 * cleanup." A small inline toggle, not a full bottom sheet: three actions
 * don't warrant the heavier modal pattern ExerciseContextSheet uses for a
 * longer, scrollable menu. */
function TodayOverflowMenu({
  state,
  onOpen,
  onClose,
  onMove,
  onDeload,
  onSkip,
}: {
  state: OverflowAction;
  onOpen: () => void;
  onClose: () => void;
  onMove: () => void;
  onDeload: () => void;
  onSkip: () => void;
}) {
  if (state === null) {
    return (
      <button
        type="button"
        className="atlas-today__overflow-button"
        aria-label="More actions"
        onClick={onOpen}
      >
        &hellip;
      </button>
    );
  }
  return (
    <div className="atlas-today__overflow-menu" role="menu">
      <button type="button" role="menuitem" onClick={onMove}>
        Move Workout
      </button>
      <button type="button" role="menuitem" onClick={onDeload}>
        Start as Deload
      </button>
      <button type="button" role="menuitem" onClick={onSkip}>
        Skip Today
      </button>
      <button type="button" role="menuitem" onClick={onClose}>
        Close
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
  const [overflow, setOverflow] = useState<OverflowAction>(null);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [exercisesById, setExercisesById] = useState<Map<string, Exercise>>(new Map());
  const [occurrences, setOccurrences] = useState<WorkoutOccurrence[]>([]);

  async function reload() {
    if (!storage) return;
    // Today is the screen every install lands on first, so the owner's
    // built-in starter Program/Quick Workouts (v0.2.1) are backfilled here
    // rather than waiting on Library/ExercisePicker to have been visited --
    // "I open ATLAS and my workouts are already there," not "after I first
    // browse the exercise library." Exercises must be seeded first so the
    // starter data's name/id matching has a real library to resolve
    // against; both are no-ops once already applied. Dynamically imported,
    // not a static top-level import: both pull in the ~1,300-exercise seed
    // dataset, and unlike LibraryScreen/ExercisePicker (already their own
    // lazy route chunks, so a static import there is fine) Today is part of
    // the app's eagerly-loaded shell -- a static import here previously
    // pulled that whole dataset into the main bundle (confirmed via a
    // build-size regression: precache 29 entries/342 KB main chunk went to
    // 25 entries/3 MB).
    const [{ ensureExercisesSeeded }, { ensureOwnerStarterDataSeeded }] = await Promise.all([
      import('@atlas/exercise-library'),
      import('@atlas/import-export'),
    ]);
    await ensureExercisesSeeded(storage);
    await ensureOwnerStarterDataSeeded(storage);
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
    template: WorkoutTemplate | null,
    programId: string | null,
    programDayId: string | null,
    reason: string | null,
  ) {
    if (!storage) return;
    const session = skipWorkoutSession({
      name: template?.name ?? 'Workout',
      templateId: template?.id ?? null,
      programId,
      programDayId,
      plannedSnapshot: template?.exercises ?? [],
      groups: template?.groups ?? [],
      reason,
    });
    await storage.workoutSessions.put(session);
    if (programId && programDayId) {
      const program = await storage.programs.get(programId);
      if (program) {
        // An intentional skip still advances a sequential program -- only a
        // missed day (never opened) stays "next." See sequentialProgress.ts.
        await storage.programs.put(advanceProgramSequence(program, programDayId));
        // Weekly mode has no sequence position to advance -- instead record
        // the occurrence so Today doesn't keep re-offering the same day for
        // the rest of today (next week's occurrence of this weekday is
        // unaffected -- a fresh original_date, never touched by this row).
        if (programProgressionMode(program) !== 'sequential') {
          const existing = occurrences.find(
            (o) =>
              o.program_day_id === programDayId && o.original_date === todayIso() && !o.deleted_at,
          );
          const occurrence = skipOccurrence(
            existing ?? null,
            programId,
            programDayId,
            todayIso(),
            reason,
          );
          await storage.workoutOccurrences.put(occurrence);
        }
      }
    }
    setOverflow(null);
    await reload();
  }

  /** Records a WorkoutOccurrence for today's slot rather than editing the
   * Program -- the template/day this occurrence points at is unchanged;
   * only where it's scheduled moves. See docs/DATA_MODEL.md "Scheduling." */
  async function handleMove(programId: string, programDayId: string, newDate: string) {
    if (!storage) return;
    const originalDate = todayIso();
    const existing = occurrences.find(
      (o) => o.program_day_id === programDayId && o.original_date === originalDate && !o.deleted_at,
    );
    const occurrence = moveOccurrence(
      existing ?? null,
      programId,
      programDayId,
      originalDate,
      newDate,
    );
    await storage.workoutOccurrences.put(occurrence);
    setOverflow(null);
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

  const quickWorkouts = [...templates.values()]
    .filter((t) => t.is_quick_workout)
    .sort(compareByName);

  const today = todayIso();
  const scheduleEntry: TodayScheduleEntry | null = activeProgram
    ? todaysScheduleEntry(activeProgram, templates, occurrences, today)
    : null;
  const upNext =
    activeProgram && programProgressionMode(activeProgram) === 'fixed'
      ? resolveUpNext(activeProgram, templates, occurrences, today)
      : null;
  const todayLongDate = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="atlas-today">
      <h1>Today</h1>
      <p className="atlas-today__date">{todayLongDate}</p>

      {activeProgram && scheduleEntry && (
        <section className="atlas-today__primary">
          {scheduleEntry.kind === 'workout' && (
            <div className="atlas-today__card">
              {overflow === 'skip' ? (
                <SkipRow
                  onCancel={() => setOverflow(null)}
                  onConfirm={(reason) =>
                    void handleSkip(
                      scheduleEntry.resolved.template,
                      activeProgram.id,
                      scheduleEntry.resolved.day.id,
                      reason,
                    )
                  }
                />
              ) : overflow === 'move' ? (
                <MoveRow
                  onCancel={() => setOverflow(null)}
                  onConfirm={(newDate) =>
                    void handleMove(activeProgram.id, scheduleEntry.resolved.day.id, newDate)
                  }
                />
              ) : (
                <>
                  <div className="atlas-today__card-header">
                    <div>
                      <h2 className="atlas-today__workout-name">
                        {scheduleEntry.resolved.template?.name ?? 'Workout not found'}
                      </h2>
                      <p className="atlas-today__workout-meta">
                        {scheduleEntry.resolved.template
                          ? `${scheduleEntry.resolved.template.exercises.length} exercise${scheduleEntry.resolved.template.exercises.length === 1 ? '' : 's'}`
                          : ''}
                        {scheduleEntry.resolved.occurrence?.status === 'replaced' && ' · Replaced'}
                      </p>
                    </div>
                    <TodayOverflowMenu
                      state={overflow}
                      onOpen={() => setOverflow('menu')}
                      onClose={() => setOverflow(null)}
                      onMove={() => setOverflow('move')}
                      onDeload={() =>
                        void startFromTemplate(
                          scheduleEntry.resolved.template as WorkoutTemplate,
                          activeProgram.id,
                          scheduleEntry.resolved.day.id,
                          true,
                        )
                      }
                      onSkip={() => setOverflow('skip')}
                    />
                  </div>
                  <button
                    type="button"
                    className="atlas-today__start"
                    disabled={!scheduleEntry.resolved.template}
                    onClick={() =>
                      scheduleEntry.resolved.template &&
                      void startFromTemplate(
                        scheduleEntry.resolved.template,
                        activeProgram.id,
                        scheduleEntry.resolved.day.id,
                      )
                    }
                  >
                    Start Workout
                  </button>
                </>
              )}
            </div>
          )}

          {scheduleEntry.kind === 'rest' && (
            <div className="atlas-today__card atlas-today__card--rest">
              <h2 className="atlas-today__workout-name">{scheduleEntry.day.label}</h2>
              <p className="atlas-today__workout-meta">No structured workout scheduled</p>
            </div>
          )}

          {scheduleEntry.kind === 'skipped' && (
            <div className="atlas-today__card atlas-today__card--rest">
              <h2 className="atlas-today__workout-name">{scheduleEntry.day.label}</h2>
              <p className="atlas-today__workout-meta">Skipped for today</p>
            </div>
          )}

          {scheduleEntry.kind === 'completed' && (
            <div className="atlas-today__card atlas-today__card--rest">
              <h2 className="atlas-today__workout-name">{scheduleEntry.day.label}</h2>
              <p className="atlas-today__workout-meta">Already completed today</p>
            </div>
          )}

          {(scheduleEntry.kind === 'moved_away' || scheduleEntry.kind === 'none') && (
            <div className="atlas-today__card atlas-today__card--rest">
              <h2 className="atlas-today__workout-name">No scheduled workout today</h2>
              {scheduleEntry.kind === 'moved_away' && (
                <p className="atlas-today__workout-meta">
                  {scheduleEntry.day.label} moved to {scheduleEntry.movedToDate}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        className="atlas-today__freestyle"
        onClick={() => void startFreestyle()}
      >
        Start Freestyle Workout
      </button>

      <section>
        <h2>Quick Workouts</h2>
        {quickWorkouts.length === 0 ? (
          <p className="atlas-program-screen__empty">
            No quick workouts yet &mdash; create one from the Program tab.
          </p>
        ) : (
          <ul className="atlas-program-screen__list">
            {quickWorkouts.map((template) => (
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {upNext && (
        <section className="atlas-today__up-next">
          <h2>Up Next</h2>
          <p className="atlas-today__up-next-day">{formatUpNextDate(upNext.date)}</p>
          <p className="atlas-today__up-next-name">{upNext.template?.name ?? upNext.day.label}</p>
        </section>
      )}

      {!activeProgram && quickWorkouts.length === 0 && (
        <p className="atlas-program-screen__empty">
          Create a workout on the Program tab to get started.
        </p>
      )}
    </div>
  );
}
