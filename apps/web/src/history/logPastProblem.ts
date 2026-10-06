import { localIsoDate } from '@atlas/core';

export interface LogPastEntry {
  /** `YYYY-MM-DD`, as an `<input type="date">` gives it ('' when cleared). */
  date: string;
  /** `HH:MM` or '' (optional). */
  startTime: string;
  /** As typed. Blank means "not known" and counts as an hour. */
  durationMinutes: string;
}

/** Minutes a Log Past Workout is given when the duration is left blank. */
export const DEFAULT_PAST_MINUTES = 60;

/** Minutes for a valid entry's duration (blank -> the default). Not meaningful for an entry `logPastProblem` rejects. */
export function pastMinutes(durationMinutes: string): number {
  return durationMinutes.trim() === '' ? DEFAULT_PAST_MINUTES : Number(durationMinutes);
}

/**
 * Why a "past workout" can't be logged as entered, or null. An empty date used to throw inside the click handler (nothing
 * happened, no message); a future date, or a negative / absurd duration, was stored as a past workout.
 */
export function logPastProblem(entry: LogPastEntry, now: Date = new Date()): string | null {
  const { date, startTime, durationMinutes } = entry;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) {
    return 'Pick the date of the workout.';
  }
  if (date > localIsoDate(now))
    return "That date hasn't happened yet. Pick today or an earlier day.";
  if (startTime && new Date(`${date}T${startTime}:00`).getTime() > now.getTime()) {
    return "That start time hasn't happened yet.";
  }
  const minutes = pastMinutes(durationMinutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    return 'Duration must be between 1 and 1440 minutes, or leave it blank.';
  }
  return null;
}
