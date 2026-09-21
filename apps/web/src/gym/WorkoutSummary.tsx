import { summarizeSession } from '@atlas/workout-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import { sessionMuscleExposure } from '@atlas/progress-engine';
import { muscleName } from '@atlas/anatomy';
import type { Exercise, Milestone, PersonalRecord, WorkoutSession } from '@atlas/data-model';
import { BodyMap } from '../anatomy/BodyMap';
import { describePR } from '../progress/formatPR';

interface WorkoutSummaryProps {
  session: WorkoutSession;
  newPRs: PersonalRecord[];
  newMilestones: Milestone[];
  exercises: Map<string, Exercise>;
  onDone: () => void;
}

export function WorkoutSummary({
  session,
  newPRs,
  newMilestones,
  exercises,
  onDone,
}: WorkoutSummaryProps) {
  const summary = summarizeSession(session);
  const muscles = sessionMuscleExposure(session, exercises);
  const bodyStates = muscles.map((m) => ({
    muscleId: m.muscleId,
    state: (m.directSets > 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
  }));
  const directMuscles = muscles.filter((m) => m.directSets > 0);
  const secondaryOnlyMuscles = muscles.filter((m) => m.directSets === 0 && m.secondarySets > 0);
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

      {muscles.length > 0 && (
        <section className="atlas-workout-summary__muscles">
          <h2>Muscles Trained</h2>
          <BodyMap states={bodyStates} />
          <ul className="atlas-workout-summary__muscle-list">
            {directMuscles.map((m) => (
              <li key={m.muscleId}>
                <span className="atlas-workout-summary__muscle-name">{muscleName(m.muscleId)}</span>
                <span className="atlas-workout-summary__muscle-count">
                  {m.directSets} working set{m.directSets === 1 ? '' : 's'}
                  {m.volume > 0 ? ` · ${m.volume.toLocaleString()} lb` : ''}
                </span>
              </li>
            ))}
            {secondaryOnlyMuscles.length > 0 && (
              <li className="atlas-workout-summary__muscle-secondary">
                <span className="atlas-workout-summary__muscle-name">
                  {secondaryOnlyMuscles.map((m) => muscleName(m.muscleId)).join(', ')}
                </span>
                <span className="atlas-workout-summary__muscle-count">secondary</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {newPRs.length > 0 && (
        <div className="atlas-workout-summary__prs">
          <h2>New PRs</h2>
          <ul>
            {newPRs.map((pr) => {
              const { title, value } = describePR(pr);
              return (
                <li key={pr.id}>
                  <span className="atlas-workout-summary__pr-exercise">
                    {formatExerciseName(exercises.get(pr.exercise_id)?.name ?? 'Exercise')}
                  </span>
                  <span className="atlas-workout-summary__pr-value">{value}</span>
                  <span className="atlas-workout-summary__pr-title">{title}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {newMilestones.length > 0 && (
        <div className="atlas-workout-summary__milestones">
          <h2>Milestones</h2>
          <ul>
            {newMilestones.map((milestone) => (
              <li key={milestone.id}>
                <span className="atlas-workout-summary__milestone-exercise">
                  {milestone.exercise_id
                    ? formatExerciseName(exercises.get(milestone.exercise_id)?.name ?? 'Exercise')
                    : ''}
                </span>
                <span className="atlas-workout-summary__milestone-title">{milestone.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="atlas-template-editor__save" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
