import { useState } from 'react';
import { currentGroupRound, isGroupComplete, type LogSetInput } from '@atlas/workout-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, ExerciseGroup, PerformedSet, PlannedExercise } from '@atlas/data-model';

interface MemberDraft {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
}

const EMPTY: MemberDraft = { weight: '', reps: '', duration: '', distance: '' };

function lastSetFor(performedSets: PerformedSet[], exerciseId: string): PerformedSet | undefined {
  const forExercise = performedSets.filter((s) => s.exercise_id === exerciseId);
  return forExercise[forExercise.length - 1];
}

interface SupersetRoundProps {
  group: ExerciseGroup;
  members: PlannedExercise[];
  exercises: Map<string, Exercise>;
  performedSets: PerformedSet[];
  onCompleteRound: (sets: LogSetInput[]) => void;
}

/** One round of a superset/circuit at a time -- A1's next set, A2's next
 * set, etc., all on one screen, logged together. This is the "Gym Mode
 * progression" the group's rounds/rest are for; the per-exercise
 * ExerciseLogger table (all N sets of one exercise at once) is the wrong
 * shape for genuine round-by-round alternation. See docs/DATA_MODEL.md
 * Stage 4B. */
export function SupersetRound({
  group,
  members,
  exercises,
  performedSets,
  onCompleteRound,
}: SupersetRoundProps) {
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});
  const round = currentGroupRound(group, members, performedSets);
  const complete = isGroupComplete(group, members, performedSets);

  function draftFor(member: PlannedExercise): MemberDraft {
    const existing = drafts[member.id];
    if (existing) return existing;
    const last = lastSetFor(performedSets, member.exercise_id);
    return {
      ...EMPTY,
      weight:
        (last?.weight ?? member.target_weight) != null
          ? String(last?.weight ?? member.target_weight)
          : '',
      reps:
        (last?.reps ?? member.target_reps_min) != null
          ? String(last?.reps ?? member.target_reps_min)
          : '',
    };
  }

  function updateDraft(memberId: string, patch: Partial<MemberDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [memberId]: { ...draftFor(members.find((m) => m.id === memberId)!), ...patch },
    }));
  }

  function handleCompleteRound() {
    const sets: LogSetInput[] = members.map((member) => {
      const exercise = exercises.get(member.exercise_id);
      const draft = draftFor(member);
      const showsWeight = exercise?.measurement_type === 'reps_weight';
      const showsReps =
        exercise?.measurement_type === 'reps_weight' ||
        exercise?.measurement_type === 'reps' ||
        exercise?.measurement_type === 'reps_bodyweight';
      const showsDuration =
        exercise?.measurement_type === 'time' || exercise?.measurement_type === 'distance_time';
      const showsDistance =
        exercise?.measurement_type === 'distance' || exercise?.measurement_type === 'distance_time';
      return {
        exerciseId: member.exercise_id,
        setIndex: round,
        setType: 'normal',
        weight: showsWeight && draft.weight !== '' ? Number(draft.weight) : null,
        reps: showsReps && draft.reps !== '' ? Number(draft.reps) : null,
        durationSeconds: showsDuration && draft.duration !== '' ? Number(draft.duration) : null,
        distanceMeters: showsDistance && draft.distance !== '' ? Number(draft.distance) : null,
        rpe: null,
        rir: null,
        notes: null,
      };
    });
    onCompleteRound(sets);
    setDrafts({});
  }

  if (complete) {
    return (
      <div className="atlas-superset">
        <h2>
          {group.type === 'superset' ? 'Superset' : 'Circuit'} complete &mdash; {group.rounds}/
          {group.rounds} rounds
        </h2>
      </div>
    );
  }

  return (
    <div className="atlas-superset">
      <h2>
        {group.type === 'superset' ? 'Superset' : 'Circuit'} &middot; Round {round + 1} of{' '}
        {group.rounds}
      </h2>
      {group.member_rest_seconds != null && (
        // Informational only -- this round logs all members together (see
        // this component's own doc comment), so there is no per-member step
        // to insert a real timer between; a configured value is still
        // worth surfacing rather than silently ignored. See
        // docs/DATA_MODEL.md "Rest hierarchy."
        <p className="atlas-superset__member-rest">
          Rest {group.member_rest_seconds}s between exercises within a round
        </p>
      )}
      <ul className="atlas-superset__members">
        {members.map((member, memberIndex) => {
          const exercise = exercises.get(member.exercise_id);
          const draft = draftFor(member);
          const showsWeight = exercise?.measurement_type === 'reps_weight';
          const showsReps =
            exercise?.measurement_type === 'reps_weight' ||
            exercise?.measurement_type === 'reps' ||
            exercise?.measurement_type === 'reps_bodyweight';
          const showsDuration =
            exercise?.measurement_type === 'time' || exercise?.measurement_type === 'distance_time';
          const showsDistance =
            exercise?.measurement_type === 'distance' ||
            exercise?.measurement_type === 'distance_time';
          const label = String.fromCharCode(65 + Math.floor(memberIndex / 26)) + (memberIndex + 1);
          return (
            <li key={member.id} className="atlas-superset__member">
              <span className="atlas-superset__member-label">{label}</span>
              <span className="atlas-superset__member-name">
                {formatExerciseName(exercise?.name ?? 'Exercise')}
              </span>
              <div className="atlas-superset__member-fields">
                {showsWeight && (
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`${formatExerciseName(exercise?.name ?? 'Exercise')} weight`}
                    placeholder="Weight"
                    value={draft.weight}
                    onChange={(e) => updateDraft(member.id, { weight: e.target.value })}
                    onFocus={(e) => e.target.select()}
                  />
                )}
                {showsReps && (
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`${formatExerciseName(exercise?.name ?? 'Exercise')} reps`}
                    placeholder="Reps"
                    value={draft.reps}
                    onChange={(e) => updateDraft(member.id, { reps: e.target.value })}
                    onFocus={(e) => e.target.select()}
                  />
                )}
                {showsDuration && (
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`${formatExerciseName(exercise?.name ?? 'Exercise')} seconds`}
                    placeholder="Seconds"
                    value={draft.duration}
                    onChange={(e) => updateDraft(member.id, { duration: e.target.value })}
                    onFocus={(e) => e.target.select()}
                  />
                )}
                {showsDistance && (
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`${formatExerciseName(exercise?.name ?? 'Exercise')} distance`}
                    placeholder="Meters"
                    value={draft.distance}
                    onChange={(e) => updateDraft(member.id, { distance: e.target.value })}
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="atlas-superset__complete" onClick={handleCompleteRound}>
        Complete Round {round + 1}
      </button>
    </div>
  );
}
