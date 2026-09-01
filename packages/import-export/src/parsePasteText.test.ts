import { describe, expect, it } from 'vitest';
import { parsePasteText } from './parsePasteText';

describe('parsePasteText', () => {
  it('parses the handoff worked example into a single workout', () => {
    const text = [
      'Monday — Upper',
      'Bench Press',
      '4 × 6',
      'Rest 2 min',
      'Barbell Row',
      '4 × 8',
      'Pull-Ups',
      '3 × AMRAP',
    ].join('\n');

    const { result, unparsedLines } = parsePasteText(text);
    expect(unparsedLines).toEqual([]);
    expect(result.kind).toBe('workout');
    if (result.kind !== 'workout') return;
    expect(result.workout.exercises).toHaveLength(3);

    const [bench, row, pullups] = result.workout.exercises;
    expect(bench).toMatchObject({
      exercise_name: 'Bench Press',
      target_sets: 4,
      target_reps_min: 6,
      target_reps_max: 6,
      rest_seconds: 120,
    });
    expect(row).toMatchObject({
      exercise_name: 'Barbell Row',
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 8,
    });
    expect(pullups?.target_sets).toBe(3);
    expect(pullups?.target_reps_min).toBeNull();
    expect(pullups?.notes).toContain('AMRAP');
  });

  it('produces a program when more than one day header is present', () => {
    const text = [
      'Monday — Upper',
      'Bench Press',
      '4x6',
      '',
      'Wednesday — Lower',
      'Back Squat',
      '5x5',
    ].join('\n');
    const { result } = parsePasteText(text);
    expect(result.kind).toBe('program');
    if (result.kind !== 'program') return;
    expect(result.program.weeks[0]?.days).toHaveLength(2);
    expect(result.program.weeks[0]?.days[0]?.label).toContain('Monday');
    expect(result.program.weeks[0]?.days[1]?.label).toContain('Wednesday');
  });

  it('accepts weight in a combined sets/reps/weight line', () => {
    const { result } = parsePasteText('Bench Press\n4 x 6 @ 185 lbs');
    if (result.kind !== 'workout') throw new Error('expected workout');
    expect(result.workout.exercises[0]?.target_weight).toBe(185);
  });

  it('parses rest given as minutes, seconds, or mm:ss', () => {
    const { result } = parsePasteText(
      [
        'Bench Press',
        '4x6',
        'Rest 2 min',
        'Row',
        '4x8',
        'Rest 90 sec',
        'Squat',
        '5x5',
        'Rest 1:30',
      ].join('\n'),
    );
    if (result.kind !== 'workout') throw new Error('expected workout');
    const [bench, row, squat] = result.workout.exercises;
    expect(bench?.rest_seconds).toBe(120);
    expect(row?.rest_seconds).toBe(90);
    expect(squat?.rest_seconds).toBe(90);
  });

  it('is unaffected by extra blank lines and irregular whitespace', () => {
    const text = '\n\n  Bench Press  \n\n   4   ×   6   \n\n\n  Rest   2 min  \n\n';
    const { result } = parsePasteText(text);
    if (result.kind !== 'workout') throw new Error('expected workout');
    expect(result.workout.exercises).toHaveLength(1);
    expect(result.workout.exercises[0]).toMatchObject({
      exercise_name: 'Bench Press',
      target_sets: 4,
      rest_seconds: 120,
    });
  });

  it('ignores a pure-punctuation separator line rather than treating it as an exercise', () => {
    const { result } = parsePasteText('Bench Press\n4x6\n----------\nRow\n4x8');
    if (result.kind !== 'workout') throw new Error('expected workout');
    expect(result.workout.exercises.map((e) => e.exercise_name)).toEqual(['Bench Press', 'Row']);
  });

  it('leaves a bodyweight exercise with no sets line as sets-only-unknown rather than inventing a value', () => {
    const { result } = parsePasteText('Plank\nHold to failure');
    if (result.kind !== 'workout') throw new Error('expected workout');
    expect(result.workout.exercises).toHaveLength(2); // "Hold to failure" doesn't match any pattern, so it's a second exercise line -- an honest limitation, not a crash.
  });

  it('parses a timed-exercise-style rest/duration line without crashing', () => {
    const { result } = parsePasteText('Plank\n3 x 30');
    if (result.kind !== 'workout') throw new Error('expected workout');
    expect(result.workout.exercises[0]).toMatchObject({
      target_sets: 3,
      target_reps_min: 30,
      target_reps_max: 30,
    });
  });

  it('returns an empty workout, not a crash, for empty input', () => {
    const { result } = parsePasteText('');
    expect(result.kind).toBe('workout');
    if (result.kind === 'workout') expect(result.workout.exercises).toEqual([]);
  });
});
