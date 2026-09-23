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
  currentSequentialDay,
  dismissOccurrence,
  flattenProgramDays,
  moveOccurrence,
  programProgressionMode,
  programSequencePosition,
  resolveMissedWorkouts,
  resolveUpNext,
  resolveWeeklySchedule,
  resolveWeekSchedule,
  skipOccurrence,
  type FlattenedProgramDay,
  type ResolvedDay,
  type TodayScheduleEntry,
} from '@atlas/program-engine';
import { buildWeeklyReview } from '@atlas/progress-engine';
import type {
  Exercise,
  Milestone,
  PersonalRecord,
  Program,
  WorkoutOccurrence,
  WorkoutSession,
  WorkoutTemplate,
} from '@atlas/data-model';
import { useGymMode } from '../gym/GymModeContext';
import { useStorage } from '../storage/StorageContext';
import { SessionDetail } from '../history/SessionDetail';
import { WeekNavigator } from './WeekNavigator';
import { SequenceNavigator } from './SequenceNavigator';

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday of the calendar week containing `iso` -- same mondayOffset convention as resolveWeekSchedule (program-engine), kept in sync deliberately. */
function startOfWeek(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00`).getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(iso, mondayOffset);
}

function formatUpNextDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  });
}

function longWeekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
}

function monthDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

function shortMonthDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatCompletedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
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
  initialDate: string;
  onCancel: () => void;
  onConfirm: (newDate: string) => void;
}

/** Move never rewrites the Program template -- it records a
 * WorkoutOccurrence with the original date preserved and a new effective
 * date. See docs/DATA_MODEL.md "Scheduling." */
function MoveRow({ initialDate, onCancel, onConfirm }: MoveRowProps) {
  const [date, setDate] = useState(initialDate);
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
        Skip
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
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // v0.2.4 browsing state. `selectedDate`/`selectedSequenceIndex` of `null`
  // both mean "follow the live current day/position" -- "Return to Today"
  // is just resetting these back to null, same shape for both modes.
  // `weekOffsetWeeks` is which week the STRIP shows; independent of which
  // day is selected within it (arrow-browsing a week doesn't change what
  // the primary card is showing until a day is actually tapped).
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekOffsetWeeks, setWeekOffsetWeeks] = useState(0);
  const [selectedSequenceIndex, setSelectedSequenceIndex] = useState<number | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [showAllMissed, setShowAllMissed] = useState(false);

  async function reload() {
    if (!storage) return;
    // Today is the screen every install lands on first, so the generic
    // built-in exercise catalog is backfilled here rather than waiting on
    // Library/ExercisePicker to have been visited -- "I open ATLAS and the
    // exercise library is already there," not "after I first browse the
    // library." Dynamically imported, not a static top-level import: it
    // pulls in the ~1,300-exercise seed dataset, and unlike
    // LibraryScreen/ExercisePicker (already their own lazy route chunks, so
    // a static import there is fine) Today is part of the app's eagerly-
    // loaded shell -- a static import here previously pulled that whole
    // dataset into the main bundle (confirmed via a build-size regression:
    // precache 29 entries/342 KB main chunk went to 25 entries/3 MB).
    //
    // vNext Handoff 01 (§3, "blank-slate product separation"): this used to
    // ALSO auto-seed the owner's personal "Weekly Workout Guide" (v0.2.1's
    // `ensureOwnerStarterDataSeeded`) into every fresh install -- real,
    // personal training-split content shipping as if it were generic
    // product seed data. That call is deliberately removed: a fresh
    // profile now gets only the generic catalog above and starts with zero
    // programs/history. This does NOT touch any install that already has
    // that data (the seeder was idempotent and is simply never invoked
    // again; nothing here deletes or rewrites an existing Program/
    // WorkoutTemplate row) -- see `blankSlate.test.ts` for the exact
    // invariant this preserves.
    const { ensureExercisesSeeded } = await import('@atlas/exercise-library');
    await ensureExercisesSeeded(storage);
    const [sessions, programs, allTemplates, exercises, allOccurrences, allPRs, allMilestones] =
      await Promise.all([
        storage.workoutSessions.getAll(),
        storage.programs.getAll(),
        storage.workoutTemplates.getAll(),
        storage.exercises.getAll(),
        storage.workoutOccurrences.getAll(),
        storage.personalRecords.getAll(),
        storage.milestones.getAll(),
      ]);
    setActiveSession(sessions.find((s) => s.status === 'in_progress') ?? null);
    setActiveProgram(programs.find((p) => p.is_active) ?? null);
    setTemplates(new Map(allTemplates.map((t) => [t.id, t])));
    setAllSessions(sessions);
    setExercisesById(new Map(exercises.map((e) => [e.id, e])));
    setOccurrences(allOccurrences);
    setPersonalRecords(allPRs);
    setMilestones(allMilestones);
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
    scheduledDate: string | null,
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
      scheduledDate,
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

  /** v0.2.4 Part 9: an independent extra session for an already-completed
   * occurrence. No `scheduledDate` -- that's what keeps this from
   * disturbing the original completion link at Finish time (see
   * resolveOccurrenceCompletion). */
  async function handleDoAgain(occurrence: WorkoutOccurrence) {
    const original = allSessions.find((s) => s.id === occurrence.session_id);
    const templateId = original?.template_id ?? null;
    const template = templateId ? (templates.get(templateId) ?? null) : null;
    if (!template) return;
    await startFromTemplate(template, occurrence.program_id, occurrence.program_day_id, null);
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
    date: string,
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
        // the occurrence so this slot doesn't keep re-offering itself
        // (next week's occurrence of this weekday is unaffected -- a fresh
        // original_date, never touched by this row).
        if (programProgressionMode(program) !== 'sequential') {
          const existing = occurrences.find(
            (o) => o.program_day_id === programDayId && o.original_date === date && !o.deleted_at,
          );
          const occurrence = skipOccurrence(
            existing ?? null,
            programId,
            programDayId,
            date,
            reason,
          );
          await storage.workoutOccurrences.put(occurrence);
        }
      }
    }
    setOverflow(null);
    await reload();
  }

  /** Records a WorkoutOccurrence for the selected slot rather than editing
   * the Program -- the template/day this occurrence points at is
   * unchanged; only where it's scheduled moves. See docs/DATA_MODEL.md
   * "Scheduling." */
  async function handleMove(
    programId: string,
    programDayId: string,
    originalDate: string,
    newDate: string,
  ) {
    if (!storage) return;
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

  /** v0.2.5. Dismiss a missed occurrence from Today's reminder surface only
   * -- the occurrence stays `planned` (still discoverable via week nav and
   * Program, still startable later), it just stops cluttering Today. */
  async function handleDismissMissed(programId: string, programDayId: string, date: string) {
    if (!storage) return;
    const existing = occurrences.find(
      (o) => o.program_day_id === programDayId && o.original_date === date && !o.deleted_at,
    );
    const occurrence = dismissOccurrence(existing ?? null, programId, programDayId, date);
    await storage.workoutOccurrences.put(occurrence);
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
                <button
                  type="button"
                  className="atlas-btn atlas-btn--secondary"
                  onClick={() => setConfirmingDiscard(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="atlas-btn atlas-btn--primary"
                  onClick={() => void handleDiscard()}
                >
                  Yes, Discard
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="atlas-resume-card__actions">
                <button
                  type="button"
                  className="atlas-resume-card__resume"
                  onClick={() => enterGymMode(activeSession.id)}
                >
                  Resume
                </button>
              </div>
              {/* vNext Handoff 03A: Discard demoted to a quiet text-style
                  action beneath Resume -- it must never compete with the
                  primary action (research pack §13). */}
              <button
                type="button"
                className="atlas-btn atlas-btn--quiet-danger atlas-resume-card__discard"
                onClick={() => setConfirmingDiscard(true)}
              >
                Discard Workout
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const quickWorkouts = [...templates.values()]
    .filter((t) => t.is_quick_workout)
    .sort(compareByName);

  const today = todayIso();
  const isSequential = !!activeProgram && programProgressionMode(activeProgram) === 'sequential';

  // vNext Handoff 03A: compact "This Week" snapshot (research pack v3 §13).
  // Reuses the already-integrated buildWeeklyReview() (Handoff 02) rather
  // than reimplementing counts in React. plannedSessions only resolves for
  // a fixed/weekly-mode program -- Sequential has no calendar week to plan
  // against (same reason WeekNavigator itself doesn't apply there), so it's
  // left null and the card falls back to a plain count. stagnationSignals
  // is deliberately [] here (a full per-exercise sweep isn't cleanly
  // available on this screen) -- REVIEW_STALLED_EXERCISE just never fires
  // from this card, which is an honest simplification, not a wrong number.
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const plannedThisWeek =
    activeProgram && !isSequential
      ? resolveWeekSchedule(activeProgram, templates, occurrences, today).filter(
          (d) => d.entry.kind !== 'rest' && d.entry.kind !== 'none',
        ).length
      : null;
  const weeklyReview = buildWeeklyReview({
    periodStart: weekStart,
    periodEnd: weekEnd,
    sessions: allSessions,
    personalRecords,
    milestones,
    bodyMeasurements: [],
    stagnationSignals: [],
    plannedSessions: plannedThisWeek,
  });

  if (viewingSessionId) {
    const session = allSessions.find((s) => s.id === viewingSessionId);
    if (session) {
      return (
        <SessionDetail
          session={session}
          exercises={exercisesById}
          onBack={() => setViewingSessionId(null)}
        />
      );
    }
    setViewingSessionId(null);
  }

  // ----- Weekly/fixed mode: resolve the selected date's entry directly. -----
  const effectiveSelectedDate = selectedDate ?? today;
  const weekAnchor = addDays(today, weekOffsetWeeks * 7);
  const weeklyEntry: TodayScheduleEntry | null =
    activeProgram && !isSequential
      ? resolveWeeklySchedule(activeProgram, templates, occurrences, effectiveSelectedDate)
      : null;
  const weekDays =
    activeProgram && !isSequential
      ? resolveWeekSchedule(activeProgram, templates, occurrences, weekAnchor)
      : [];
  const missed =
    activeProgram && !isSequential
      ? resolveMissedWorkouts(activeProgram, templates, occurrences, today)
      : [];

  // ----- Sequential mode: resolve a small preview window around current. -----
  const flattened = activeProgram && isSequential ? flattenProgramDays(activeProgram) : [];
  const currentIndex =
    activeProgram && isSequential
      ? programSequencePosition(activeProgram) % Math.max(flattened.length, 1)
      : 0;
  const effectiveSequenceIndex = selectedSequenceIndex ?? currentIndex;
  const sequenceWindowStart = Math.max(
    0,
    Math.min(effectiveSequenceIndex - 1, flattened.length - 4),
  );
  const sequenceWindow: { index: number; day: FlattenedProgramDay }[] = flattened
    .slice(sequenceWindowStart, sequenceWindowStart + 4)
    .map((day, i) => ({ index: sequenceWindowStart + i, day }));
  const sequentialResolved =
    activeProgram && isSequential ? currentSequentialDay(activeProgram) : null;
  const previewedSequenceDay = flattened[effectiveSequenceIndex] ?? sequentialResolved;
  const sequentialEntry: TodayScheduleEntry | null =
    activeProgram && isSequential && previewedSequenceDay
      ? (() => {
          const previewOccurrence =
            effectiveSequenceIndex === currentIndex
              ? (occurrences.find(
                  (o) =>
                    o.program_day_id === previewedSequenceDay.day.id &&
                    o.original_date === today &&
                    !o.deleted_at,
                ) ?? null)
              : null;
          if (previewOccurrence?.status === 'completed') {
            return {
              kind: 'completed',
              day: previewedSequenceDay.day,
              occurrence: previewOccurrence,
            };
          }
          const tpl = previewedSequenceDay.day.template_id
            ? (templates.get(previewedSequenceDay.day.template_id) ?? null)
            : null;
          if (tpl && tpl.exercises.length === 0)
            return { kind: 'rest', day: previewedSequenceDay.day };
          return {
            kind: 'workout',
            resolved: {
              day: previewedSequenceDay.day,
              template: tpl,
              occurrence: previewOccurrence,
            },
          };
        })()
      : null;

  const scheduleEntry = isSequential ? sequentialEntry : weeklyEntry;
  const isViewingToday = isSequential
    ? effectiveSequenceIndex === currentIndex
    : effectiveSelectedDate === today;

  const upNext =
    activeProgram && programProgressionMode(activeProgram) === 'fixed'
      ? resolveUpNext(activeProgram, templates, occurrences, today)
      : null;
  const todayLongDate = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  function resolvedDayScheduledDate(resolved: ResolvedDay, viewedDateIso: string): string {
    return resolved.occurrence?.original_date ?? viewedDateIso;
  }

  return (
    <div className="atlas-today">
      {isViewingToday ? (
        <>
          <h1>Today</h1>
          <p className="atlas-today__date">{todayLongDate}</p>
        </>
      ) : (
        <>
          <h1>
            {isSequential
              ? `Day ${effectiveSequenceIndex + 1}`
              : longWeekday(effectiveSelectedDate)}
          </h1>
          <p className="atlas-today__date">
            {isSequential ? previewedSequenceDay?.day.label : monthDay(effectiveSelectedDate)}
          </p>
          <button
            type="button"
            className="atlas-today__return"
            onClick={() => {
              setSelectedDate(null);
              setSelectedSequenceIndex(null);
              setWeekOffsetWeeks(0);
            }}
          >
            &lsaquo; Return to Today
          </button>
        </>
      )}

      {activeProgram &&
        !isSequential &&
        (weekDays.length > 0 ? (
          <WeekNavigator
            weekDays={weekDays}
            todayIso={today}
            selectedDate={effectiveSelectedDate}
            onSelectDate={(date) => setSelectedDate(date)}
            onPrevWeek={() => setWeekOffsetWeeks((w) => w - 1)}
            onNextWeek={() => setWeekOffsetWeeks((w) => w + 1)}
          />
        ) : null)}

      {activeProgram && isSequential && sequenceWindow.length > 0 && (
        <SequenceNavigator
          window={sequenceWindow}
          currentIndex={currentIndex}
          selectedIndex={effectiveSequenceIndex}
          onSelectIndex={(index) => setSelectedSequenceIndex(index)}
        />
      )}

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
                      isSequential ? today : effectiveSelectedDate,
                      reason,
                    )
                  }
                />
              ) : overflow === 'move' ? (
                <MoveRow
                  initialDate={isSequential ? today : effectiveSelectedDate}
                  onCancel={() => setOverflow(null)}
                  onConfirm={(newDate) =>
                    void handleMove(
                      activeProgram.id,
                      scheduleEntry.resolved.day.id,
                      resolvedDayScheduledDate(
                        scheduleEntry.resolved,
                        isSequential ? today : effectiveSelectedDate,
                      ),
                      newDate,
                    )
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
                        {!isSequential &&
                          !isViewingToday &&
                          effectiveSelectedDate < today &&
                          ' · Missed / Not Completed'}
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
                          resolvedDayScheduledDate(
                            scheduleEntry.resolved,
                            isSequential ? today : effectiveSelectedDate,
                          ),
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
                        resolvedDayScheduledDate(
                          scheduleEntry.resolved,
                          isSequential ? today : effectiveSelectedDate,
                        ),
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
              <p className="atlas-today__workout-meta">Skipped</p>
              {scheduleEntry.occurrence.notes && (
                <p className="atlas-today__workout-meta">{scheduleEntry.occurrence.notes}</p>
              )}
            </div>
          )}

          {scheduleEntry.kind === 'completed' && (
            <div className="atlas-today__card">
              <h2 className="atlas-today__workout-name">{scheduleEntry.day.label}</h2>
              <p className="atlas-today__workout-meta">
                {(() => {
                  const session = allSessions.find(
                    (s) => s.id === scheduleEntry.occurrence.session_id,
                  );
                  return session?.completed_at
                    ? `Completed ${formatCompletedAt(session.completed_at)}`
                    : 'Completed';
                })()}
              </p>
              <div className="atlas-resume-card__actions">
                {scheduleEntry.occurrence.session_id && (
                  <button
                    type="button"
                    onClick={() => setViewingSessionId(scheduleEntry.occurrence.session_id)}
                  >
                    View Session
                  </button>
                )}
                <button
                  type="button"
                  className="atlas-resume-card__resume"
                  onClick={() => void handleDoAgain(scheduleEntry.occurrence)}
                >
                  Do Again
                </button>
              </div>
            </div>
          )}

          {(scheduleEntry.kind === 'moved_away' || scheduleEntry.kind === 'none') && (
            <div className="atlas-today__card atlas-today__card--rest">
              <h2 className="atlas-today__workout-name">
                {scheduleEntry.kind === 'moved_away'
                  ? scheduleEntry.day.label
                  : 'Nothing scheduled'}
              </h2>
              {scheduleEntry.kind === 'moved_away' && (
                <p className="atlas-today__workout-meta">Moved to {scheduleEntry.movedToDate}</p>
              )}
            </div>
          )}
        </section>
      )}

      {isViewingToday && weeklyReview.completed_sessions + weeklyReview.pr_count + weeklyReview.milestone_count > 0 && (
        <section className="atlas-today__week-snapshot" aria-label="This week">
          <h2>This Week</h2>
          <p className="atlas-today__week-snapshot-line">
            {weeklyReview.planned_sessions != null
              ? `${weeklyReview.completed_sessions} / ${weeklyReview.planned_sessions} sessions`
              : `${weeklyReview.completed_sessions} session${weeklyReview.completed_sessions === 1 ? '' : 's'}`}
          </p>
          {weeklyReview.pr_count > 0 && (
            <p className="atlas-today__week-snapshot-line">
              {weeklyReview.pr_count} PR{weeklyReview.pr_count === 1 ? '' : 's'}
            </p>
          )}
          {weeklyReview.milestone_count > 0 && (
            <p className="atlas-today__week-snapshot-line">
              {weeklyReview.milestone_count} milestone{weeklyReview.milestone_count === 1 ? '' : 's'}
            </p>
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

      {isViewingToday && activeProgram && missed.length > 0 && (
        <section className="atlas-today__missed">
          <h2>Missed</h2>
          {(showAllMissed ? missed : missed.slice(0, 2)).map((m) => (
            <div key={m.date} className="atlas-today__missed-row">
              <div>
                <span className="atlas-today__missed-day">{shortMonthDay(m.date)}</span>
                <span className="atlas-today__missed-name">
                  {' '}
                  &middot; {m.resolved.template?.name ?? m.resolved.day.label}
                </span>
              </div>
              <span className="atlas-today__missed-actions">
                <button type="button" onClick={() => setSelectedDate(m.date)}>
                  Start
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleDismissMissed(activeProgram.id, m.resolved.day.id, m.date)
                  }
                >
                  Dismiss
                </button>
              </span>
            </div>
          ))}
          {missed.length > 2 && !showAllMissed && (
            <button
              type="button"
              className="atlas-today__missed-more"
              onClick={() => setShowAllMissed(true)}
            >
              View {missed.length - 2} more missed workout{missed.length - 2 === 1 ? '' : 's'}
            </button>
          )}
        </section>
      )}

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
                  onClick={() => void startFromTemplate(template, null, null, null)}
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

      {isViewingToday && upNext && (
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
