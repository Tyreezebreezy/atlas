import { summarizeSession } from '@atlas/workout-engine';
import type { Exercise, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { describePR } from '../progress/formatPR';

interface WorkoutSummaryProps {
  session: WorkoutSession;
  newPRs: PersonalRecord[];
  exercises: Map<string, Exercise>;
  onDone: () => void;
}

export function WorkoutSummary({ session, newPRs, exercises, onDone }: WorkoutSummaryProps) {
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

      {newPRs.length > 0 && (
        <div className="atlas-workout-summary__prs">
          <h2>New PRs</h2>
          <ul>
            {newPRs.map((pr) => {
              const { title, value } = describePR(pr);
              return (
                <li key={pr.id}>
                  <span className="atlas-workout-summary__pr-exercise">
                    {exercises.get(pr.exercise_id)?.name ?? 'Exercise'}
                  </span>
                  <span className="atlas-workout-summary__pr-value">{value}</span>
                  <span className="atlas-workout-summary__pr-title">{title}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button type="button" className="atlas-template-editor__save" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
