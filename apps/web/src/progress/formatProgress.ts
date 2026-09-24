import type { MusclePerformanceState, RecentProgressItem } from '@atlas/progress-engine';
import { formatSeconds } from './formatPR';

/**
 * vNext Handoff 03B. Wording only -- every number here was computed by
 * progress-engine; nothing is derived or re-derived in React.
 */

const round1 = (n: number): string => String(Math.round(n * 10) / 10);

/** "+2 reps at 170 lb", "+10 lb best weight", "+8 lb est. 1RM". */
export function describeProgressDelta(item: RecentProgressItem): string {
  const amount = item.delta;
  switch (item.metric) {
    case 'reps_at_load':
      return `+${round1(amount)} rep${amount === 1 ? '' : 's'} at ${item.load ?? '?'} lb`;
    case 'max_load':
      return `+${round1(amount)} lb best weight`;
    case 'e1rm':
      return `+${Math.round(amount)} lb est. 1RM`;
    case 'volume':
      return `+${Math.round(amount).toLocaleString()} lb volume`;
    case 'reps':
      return `+${round1(amount)} rep${amount === 1 ? '' : 's'}`;
    case 'duration':
      return `+${formatSeconds(amount)} longer`;
    case 'distance':
      return `+${round1(amount)} m`;
  }
}

export const PERFORMANCE_STATE_LABEL: Record<MusclePerformanceState, string> = {
  progressing: 'Progressing',
  stable: 'Stable',
  stalled: 'Stalled',
  insufficient_data: 'Not enough data',
};

/** "12 sets", "1 set". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "today", "yesterday", "5 days ago" -- by calendar day in the device's timezone, not by 24-hour blocks. */
export function describeDaysAgo(iso: string, now: Date = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** "3 progressing · 1 stalled": the non-zero states of a muscle's exercises, in the order they matter. */
export function describePerformanceCounts(counts: Record<MusclePerformanceState, number>): string {
  const order: MusclePerformanceState[] = ['stalled', 'progressing', 'stable', 'insufficient_data'];
  const words: Record<MusclePerformanceState, string> = {
    stalled: 'stalled',
    progressing: 'progressing',
    stable: 'stable',
    insufficient_data: 'not enough data',
  };
  return order
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${words[state]}`)
    .join(' · ');
}
