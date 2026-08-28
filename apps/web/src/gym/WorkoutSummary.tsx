import { summarizeSession } from '@atlas/workout-engine';
import type { WorkoutSession } from '@atlas/data-model';

interface WorkoutSummaryProps {
  session: WorkoutSession;
  onDone: () => void;
}

export function WorkoutSummary({ session, onDone }: WorkoutSummaryProps) {
  const summary = summarizeSession(session);
  return (
    <div className="atlas-workout-summary">
      <h1>Workout Complete</h1>
      <p className="atlas-workout-summary__name">{session.name}</p>
      <dl className="atlas-workout-summary__stats">
        <div>
          <dt>Duration</dt>
          <dd>{summary.durationMinutes} min</dd>
        </div>
        <div>
          <dt>Exercises</dt>
          <dd>{summary.exerciseCount}</dd>
        </div>
        <div>
          <dt>Completed Sets</dt>
          <dd>{summary.setCount}</dd>
        </div>
        {summary.totalVolume > 0 && (
          <div>
            <dt>Total Volume</dt>
            <dd>{summary.totalVolume.toLocaleString()} lb</dd>
          </div>
        )}
        {summary.skippedCount > 0 && (
          <div>
            <dt>Skipped</dt>
            <dd>{summary.skippedCount}</dd>
          </div>
        )}
      </dl>
      <button type="button" className="atlas-template-editor__save" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
