import { describe, expect, it } from 'vitest';
import { formatExerciseName, repairExerciseName } from './formatExerciseName';
import { seedExercises } from './ensureExercisesSeeded';

describe('formatExerciseName', () => {
  it('title-cases a plain lowercase name', () => {
    expect(formatExerciseName('machine chest press')).toBe('Machine Chest Press');
  });

  it('preserves EZ as an acronym, not "Ez"', () => {
    expect(formatExerciseName('ez-bar biceps curl')).toBe('EZ-Bar Biceps Curl');
  });

  it('leaves numeric tokens like a degree measure untouched', () => {
    expect(formatExerciseName('sled 45 degrees one leg press')).toBe(
      'Sled 45 Degrees One Leg Press',
    );
  });

  it('preserves a numeric ratio such as 90/90', () => {
    expect(formatExerciseName('90/90 hip switch')).toBe('90/90 Hip Switch');
  });

  it('preserves RDL as an acronym', () => {
    expect(formatExerciseName('rdl')).toBe('RDL');
    expect(formatExerciseName('single leg rdl')).toBe('Single Leg RDL');
  });

  it('title-cases Romanian Deadlift normally', () => {
    expect(formatExerciseName('romanian deadlift')).toBe('Romanian Deadlift');
  });

  it('title-cases Smith Machine normally', () => {
    expect(formatExerciseName('smith machine bicep curl')).toBe('Smith Machine Bicep Curl');
  });

  it('capitalizes a single-letter token before a hyphen, as in T-Bar Row', () => {
    expect(formatExerciseName('lever t-bar row')).toBe('Lever T-Bar Row');
  });

  it('capitalizes a single-letter token before a hyphen, as in L-Sit', () => {
    expect(formatExerciseName('l-sit on floor')).toBe('L-Sit On Floor');
  });

  it('preserves AMRAP as an acronym', () => {
    expect(formatExerciseName('amrap finisher')).toBe('AMRAP Finisher');
  });

  it('is idempotent -- formatting an already-formatted name is a no-op', () => {
    const once = formatExerciseName('ez-bar close-grip bench press');
    expect(formatExerciseName(once)).toBe(once);
  });

  it('handles an internal apostrophe without shouting the trailing letter', () => {
    expect(formatExerciseName("farmer's walk")).toBe("Farmer's Walk");
  });

  it('returns an empty string unchanged', () => {
    expect(formatExerciseName('')).toBe('');
  });

  it('keeps an acronym the owner typed in capitals instead of turning it into "Trx"', () => {
    expect(formatExerciseName('TRX row')).toBe('TRX Row');
    expect(formatExerciseName('QA Landmine Press')).toBe('QA Landmine Press');
    expect(formatExerciseName('ATG-style split squat')).toBe('ATG-Style Split Squat');
    // ...while a single capital letter is still just a capital letter, and mixed case is still title-cased
    expect(formatExerciseName('I-Y-T raise')).toBe('I-Y-T Raise');
    expect(formatExerciseName('Shoulder CARs')).toBe('Shoulder Cars');
  });

  it('still puts the degree sign back on a "45в°" name an older backup brings back', () => {
    expect(formatExerciseName('sled 45в° leg press (back pov)')).toBe(
      'Sled 45° Leg Press (Back Pov)',
    );
    expect(repairExerciseName('sled 45в° calf press')).toBe('sled 45° calf press');
    expect(repairExerciseName('sled 45° calf press')).toBe('sled 45° calf press');
  });

  it('has nothing left to repair in the shipped catalog', () => {
    const needRepair = seedExercises.filter((e) => repairExerciseName(e.name) !== e.name);
    expect(needRepair.map((e) => e.name)).toEqual([]);
  });

  it('formats every real seeded exercise name without throwing', () => {
    for (const exercise of seedExercises) {
      expect(() => formatExerciseName(exercise.name)).not.toThrow();
    }
  });
});
