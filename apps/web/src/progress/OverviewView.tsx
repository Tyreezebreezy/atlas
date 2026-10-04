import { useMemo } from 'react';
import {
  addDaysToIso,
  localIsoDate,
  plannedSessionsThisWeek,
  startOfWeekIso,
} from '@atlas/program-engine';
import {
  buildMuscleMapViewModel,
  buildWeeklyReview,
  detectAllStagnation,
  progressOverviewState,
  recentProgress,
  type WeeklyReview,
  type WeeklyReviewStatus,
} from '@atlas/progress-engine';
import { isMilestoneVisible } from '@atlas/milestone-engine';
import { weightSeries } from '@atlas/body-composition';
import { groupName } from '@atlas/anatomy';
import { formatExerciseName } from '@atlas/exercise-library';
import { BodyMap } from '../anatomy/BodyMap';
import { ActivityHeatmap } from './ActivityHeatmap';
import { describeProgressDelta, pluralize } from './formatProgress';
import { muscleMapStates } from './muscleMapStates';
import type { ProgressData, ProgressSegment } from './progressData';

interface OverviewViewProps {
  data: ProgressData;
  onOpenStrength: (exerciseId: string) => void;
  onOpenSegment: (segment: ProgressSegment) => void;
  onViewExercises: () => void;
}

function formatDay(iso: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return (dateOnly ? new Date(`${iso}T00:00:00`) : new Date(iso)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Wording for the review's status code. This is the current, unfinished week,
// so "incomplete" reads as "still in progress", not as a verdict.
const REVIEW_STATUS_LABEL: Record<WeeklyReviewStatus, string> = {
  BASELINE_WEEK: 'Baseline week',
  ON_TRACK: 'On track',
  INCOMPLETE_WEEK: 'Week in progress',
  REVIEW_STALLED_EXERCISE: 'Stalled exercise to review',
};

/**
 * vNext Handoff 03B (§5-6). The Overview scales with the amount of history:
 * nothing at all, a short plain summary, or -- once there is enough to compare
 * -- the weekly review plus compact cards. Every number comes from a domain
 * function; a card that has nothing to say is simply not rendered.
 */
export function OverviewView({ data, onOpenStrength, onOpenSegment, onViewExercises }: OverviewViewProps) {
  const { sessions, exercises, prs, prEvents, milestones, bodyMeasurements } = data;

  const completedWorkouts = useMemo(
    () => sessions.filter((s) => s.status === 'completed').length,
    [sessions],
  );
  const state = progressOverviewState(completedWorkouts);

  const visibleMilestones = useMemo(() => milestones.filter((m) => isMilestoneVisible(m)), [milestones]);
  const achievedCount = visibleMilestones.filter((m) => m.achieved_at != null).length;

  const recent = useMemo(() => recentProgress(sessions, exercises, { sinceDays: 30, limit: 5 }), [sessions, exercises]);

  const review = useMemo<WeeklyReview>(() => {
    const today = localIsoDate();
    const periodStart = startOfWeekIso(today);
    return buildWeeklyReview({
      periodStart,
      periodEnd: addDaysToIso(periodStart, 6),
      sessions,
      prEvents,
      milestones: visibleMilestones,
      bodyMeasurements,
      stagnationSignals: detectAllStagnation(sessions, exercises, prs),
      plannedSessions: plannedSessionsThisWeek(data.activeProgram, data.templates, data.occurrences, today),
    });
  }, [sessions, exercises, prs, prEvents, visibleMilestones, bodyMeasurements, data.activeProgram, data.templates, data.occurrences]);

  const muscles = useMemo(
    () =>
      state === 'established'
        ? buildMuscleMapViewModel({ mode: 'volume', periodDays: 30, sessions, exercises })
        : null,
    [state, sessions, exercises],
  );

  const weights = useMemo(() => weightSeries(bodyMeasurements), [bodyMeasurements]);
  const latestWeight = weights[weights.length - 1];

  if (state === 'empty' && !latestWeight) {
    return (
      <div className="atlas-overview">
        <section className="atlas-panel atlas-overview__empty">
          <h2>No workouts yet</h2>
          <p>
            Finish a workout and this page starts filling in: personal records, how each exercise is
            changing, and your milestones.
          </p>
        </section>
      </div>
    );
  }

  const bodyCard = latestWeight && (
    <section className="atlas-panel" aria-labelledby="overview-body-title">
      <h2 id="overview-body-title">Body weight</h2>
      <p className="atlas-overview__figure">
        {round1(latestWeight.value)} <span>lb</span>
        <small> {formatDay(latestWeight.date)}</small>
      </p>
      {review.body_weight_average != null && (
        <p className="atlas-overview__note">
          {review.prior_body_weight_average != null
            ? `Weekly average ${round1(review.prior_body_weight_average)} → ${round1(review.body_weight_average)} lb`
            : `Weekly average ${round1(review.body_weight_average)} lb`}
        </p>
      )}
      <button type="button" className="atlas-link-button" onClick={() => onOpenSegment('body')}>
        Open Body
      </button>
    </section>
  );

  const recentCard = (
    <section className="atlas-panel" aria-labelledby="overview-recent-title">
      <h2 id="overview-recent-title">Recent progress</h2>
      {recent.length === 0 ? (
        <p className="atlas-overview__note">
          {state === 'empty'
            ? 'Finish a workout to start tracking progress.'
            : 'Do an exercise twice and how it changed shows up here.'}
        </p>
      ) : (
        <ul className="atlas-progress-list">
          {recent.map((item) => (
            <li key={item.exercise_id}>
              <button
                type="button"
                className="atlas-progress-row"
                onClick={() => onOpenStrength(item.exercise_id)}
              >
                <span className="atlas-progress-row__name">
                  {formatExerciseName(exercises.get(item.exercise_id)?.name ?? 'Exercise')}
                </span>
                <span className="atlas-progress-row__delta">{describeProgressDelta(item)}</span>
                <span className="atlas-progress-row__meta">{formatDay(item.date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (state === 'empty') {
    // Weigh-ins but no workouts yet: keep it to what exists.
    return <div className="atlas-overview">{bodyCard}</div>;
  }

  if (state === 'early') {
    return (
      <div className="atlas-overview">
        <section className="atlas-overview__hero" aria-label="Workouts completed">
          <span className="atlas-overview__hero-count">{completedWorkouts}</span>
          <span className="atlas-overview__hero-label">
            {completedWorkouts === 1 ? 'workout completed' : 'workouts completed'}
          </span>
        </section>
        {recentCard}
        <section className="atlas-panel" aria-labelledby="overview-milestones-title">
          <h2 id="overview-milestones-title">Milestones</h2>
          <p className="atlas-overview__note">
            {achievedCount === 0 ? 'None achieved yet.' : `${achievedCount} achieved`}
          </p>
          <button type="button" className="atlas-link-button" onClick={() => onOpenSegment('milestones')}>
            Open Milestones
          </button>
        </section>
        {bodyCard}
        <button type="button" className="atlas-btn atlas-btn--tertiary" onClick={onViewExercises}>
          Browse exercise library
        </button>
      </div>
    );
  }

  const movement: { label: string; count: number }[] = [
    { label: 'progressed', count: review.exercises_progressed },
    { label: 'maintained', count: review.exercises_maintained },
    { label: 'stalled', count: review.exercises_stalled },
  ].filter((m) => m.count > 0);

  return (
    <div className="atlas-overview atlas-overview__grid">
      <section className="atlas-panel atlas-panel--lead atlas-review" aria-labelledby="overview-review-title">
        <div className="atlas-review__head">
          <h2 id="overview-review-title">This week</h2>
          <span className="atlas-review__status">{REVIEW_STATUS_LABEL[review.status_code]}</span>
        </div>
        <p className="atlas-review__sessions">
          <strong>{review.completed_sessions}</strong>
          {review.planned_sessions != null && <span className="atlas-review__of"> / {review.planned_sessions}</span>}{' '}
          <span className="atlas-review__unit">
            {review.planned_sessions != null ? 'sessions' : review.completed_sessions === 1 ? 'session' : 'sessions'}
          </span>
        </p>
        {movement.length > 0 && (
          <ul className="atlas-review__movement" aria-label="Exercises this week">
            {movement.map((m) => (
              <li key={m.label} className={`atlas-review__movement--${m.label}`}>
                <strong>{m.count}</strong> {m.label}
              </li>
            ))}
          </ul>
        )}
        <p className="atlas-review__facts">
          {[
            review.pr_count > 0 ? pluralize(review.pr_count, 'PR') : null,
            review.milestone_count > 0 ? pluralize(review.milestone_count, 'milestone') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {review.body_weight_average != null && review.prior_body_weight_average != null && (
          <p className="atlas-review__facts">
            Body weight avg {round1(review.prior_body_weight_average)} → {round1(review.body_weight_average)} lb
          </p>
        )}
      </section>

      {recentCard}

      {muscles && muscles.empty_reason == null && (
        <section className="atlas-panel" aria-labelledby="overview-muscles-title">
          <h2 id="overview-muscles-title">Muscles · last 30 days</h2>
          <div className="atlas-overview__muscles">
            <BodyMap
              view="front"
              states={muscleMapStates(muscles)}
              ariaLabel="Front view of the body, shaded by working sets in the last 30 days"
              className="atlas-body-map--thumb"
            />
            <ol className="atlas-overview__top-groups">
              {muscles.groups.slice(0, 4).map((g) => (
                <li key={g.group_id}>
                  <span>{groupName(g.group_id)}</span>
                  <strong>{pluralize(g.primary_set_count, 'set')}</strong>
                </li>
              ))}
            </ol>
          </div>
          <button type="button" className="atlas-link-button" onClick={() => onOpenSegment('muscles')}>
            Open Muscles
          </button>
        </section>
      )}

      {bodyCard}

      <div className="atlas-panel atlas-overview__span">
        <ActivityHeatmap sessions={sessions} />
      </div>

      <div className="atlas-overview__span">
        <button type="button" className="atlas-btn atlas-btn--tertiary" onClick={onViewExercises}>
          Browse exercise library
        </button>
      </div>
    </div>
  );
}
