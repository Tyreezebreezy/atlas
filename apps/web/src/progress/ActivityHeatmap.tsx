import { useState } from 'react';
import { computeActivityHeatmap, type ActivityMetric } from '@atlas/progress-engine';
import type { WorkoutSession } from '@atlas/data-model';

interface ActivityHeatmapProps {
  sessions: WorkoutSession[];
}

const METRIC_LABELS: Record<ActivityMetric, string> = {
  workouts: 'Workouts',
  minutes: 'Minutes',
  sets: 'Working Sets',
};

const WEEKS = 20; // ~keeps the grid readable on a phone without scrolling sideways

/** A simple, readable calendar-style activity grid -- no derived "recovery"
 * or intensity modeling, just a plain tally of what was actually logged
 * (v0.2.0 item 41). Default metric is workout count; minutes/sets are
 * switchable. */
export function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const [metric, setMetric] = useState<ActivityMetric>('workouts');
  const days = computeActivityHeatmap(sessions, metric, WEEKS * 7);
  const max = Math.max(1, ...days.map((d) => d.value));

  function levelFor(value: number): 0 | 1 | 2 | 3 | 4 {
    if (value === 0) return 0;
    const ratio = value / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  // Group into weeks (columns), 7 days each, oldest first.
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <section className="atlas-activity-heatmap">
      <div className="atlas-activity-heatmap__header">
        <h2>Activity</h2>
        <select
          aria-label="Activity metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value as ActivityMetric)}
        >
          {Object.entries(METRIC_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="atlas-activity-heatmap__grid">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="atlas-activity-heatmap__week">
            {week.map((day) => (
              <div
                key={day.date}
                className={`atlas-activity-heatmap__day atlas-activity-heatmap__day--level-${levelFor(day.value)}`}
                title={`${day.date}: ${day.value} ${METRIC_LABELS[metric].toLowerCase()}`}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
