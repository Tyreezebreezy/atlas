import type { MilestoneDimension } from '@atlas/data-model';

/**
 * A restrained, curated set -- not hundreds of achievements. Exercise
 * names are resolved to real ids at seed time (ensureBuiltInMilestonesSeeded.ts),
 * the same name-matched approach as curatedEnrichment.ts, for the same
 * reason: seed-data exercise ids are stable across installs but not
 * guaranteed across a full re-import.
 */
export interface BuiltInMilestoneSpec {
  title: string;
  exerciseName: string;
  dimension: MilestoneDimension;
  targetWeight?: number;
  targetReps?: number;
  targetDurationSeconds?: number;
}

export const BUILT_IN_MILESTONES: BuiltInMilestoneSpec[] = [
  // Bench Press
  {
    title: '135 lb Bench Press',
    exerciseName: 'barbell bench press',
    dimension: 'weight',
    targetWeight: 135,
  },
  {
    title: '185 lb Bench Press',
    exerciseName: 'barbell bench press',
    dimension: 'weight',
    targetWeight: 185,
  },
  {
    title: '225 lb Bench Press',
    exerciseName: 'barbell bench press',
    dimension: 'weight',
    targetWeight: 225,
  },
  {
    title: '225 For Reps',
    exerciseName: 'barbell bench press',
    dimension: 'weight_and_reps',
    targetWeight: 225,
    targetReps: 5,
  },
  {
    title: '275 lb Bench Press',
    exerciseName: 'barbell bench press',
    dimension: 'weight',
    targetWeight: 275,
  },
  {
    title: '315 lb Bench Press',
    exerciseName: 'barbell bench press',
    dimension: 'weight',
    targetWeight: 315,
  },

  // Push-Ups
  { title: '10 Push-Ups', exerciseName: 'push-up', dimension: 'reps', targetReps: 10 },
  { title: '25 Push-Ups', exerciseName: 'push-up', dimension: 'reps', targetReps: 25 },
  { title: '50 Push-Ups', exerciseName: 'push-up', dimension: 'reps', targetReps: 50 },
  { title: '75 Push-Ups', exerciseName: 'push-up', dimension: 'reps', targetReps: 75 },
  { title: '100 Push-Ups', exerciseName: 'push-up', dimension: 'reps', targetReps: 100 },

  // Pull-Ups
  { title: '1 Pull-Up', exerciseName: 'pull-up', dimension: 'reps', targetReps: 1 },
  { title: '5 Pull-Ups', exerciseName: 'pull-up', dimension: 'reps', targetReps: 5 },
  { title: '10 Pull-Ups', exerciseName: 'pull-up', dimension: 'reps', targetReps: 10 },
  { title: '15 Pull-Ups', exerciseName: 'pull-up', dimension: 'reps', targetReps: 15 },
  { title: '20 Pull-Ups', exerciseName: 'pull-up', dimension: 'reps', targetReps: 20 },

  // Plank
  {
    title: '60-Second Plank',
    exerciseName: 'weighted front plank',
    dimension: 'duration',
    targetDurationSeconds: 60,
  },
  {
    title: '2-Minute Plank',
    exerciseName: 'weighted front plank',
    dimension: 'duration',
    targetDurationSeconds: 120,
  },
  {
    title: '3-Minute Plank',
    exerciseName: 'weighted front plank',
    dimension: 'duration',
    targetDurationSeconds: 180,
  },
];
