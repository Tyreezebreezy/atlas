import { describe, expect, it } from 'vitest';
import { bodyMeasurementProblem } from './bodyMeasurementProblem';

const now = new Date(2026, 9, 5, 14, 30); // Mon 5 Oct 2026
const blank = {
  date: '2026-10-05',
  weight: null,
  body_fat_percentage: null,
  muscle_mass: null,
  water_percentage: null,
  fat_mass: null,
  lean_mass: null,
  visceral_fat: null,
  bone_mass: null,
  bmr: null,
};

describe('bodyMeasurementProblem', () => {
  it('accepts a weigh-in, a partial entry, and a full one', () => {
    expect(bodyMeasurementProblem({ ...blank, weight: 182.4 }, now)).toBeNull();
    expect(bodyMeasurementProblem({ ...blank, body_fat_percentage: 18.5 }, now)).toBeNull(); // no weight is fine
    expect(
      bodyMeasurementProblem(
        {
          ...blank,
          weight: 182,
          body_fat_percentage: 18.5,
          water_percentage: 55,
          visceral_fat: 9,
          bmr: 1800,
          muscle_mass: 80,
          fat_mass: 30,
          lean_mass: 150,
          bone_mass: 8,
        },
        now,
      ),
    ).toBeNull();
    expect(bodyMeasurementProblem({ ...blank, date: '2026-01-02', weight: 190 }, now)).toBeNull();
  });

  it('accepts a value exactly at the limit, refuses one just past it', () => {
    expect(bodyMeasurementProblem({ ...blank, weight: 1500 }, now)).toBeNull();
    expect(bodyMeasurementProblem({ ...blank, weight: 1500.1 }, now)).toBe(
      'Weight must be more than 0 and at most 1,500.',
    );
    expect(bodyMeasurementProblem({ ...blank, water_percentage: 100 }, now)).toBeNull();
    expect(bodyMeasurementProblem({ ...blank, water_percentage: 101 }, now)).toBe(
      'Water must be more than 0 and at most 100.',
    );
  });

  it('refuses nothing entered', () => {
    expect(bodyMeasurementProblem(blank, now)).toBe('Enter at least one measurement.');
  });

  it('refuses zero, negative and absurd numbers, naming the field', () => {
    expect(bodyMeasurementProblem({ ...blank, weight: 0 }, now)).toMatch(/^Weight must/);
    expect(bodyMeasurementProblem({ ...blank, weight: -5 }, now)).toMatch(/^Weight must/);
    expect(bodyMeasurementProblem({ ...blank, weight: 99999 }, now)).toMatch(/^Weight must/);
    expect(
      bodyMeasurementProblem({ ...blank, weight: 180, body_fat_percentage: 400 }, now),
    ).toMatch(/^Body fat must/);
    expect(bodyMeasurementProblem({ ...blank, weight: 180, bmr: -100 }, now)).toMatch(/^BMR must/);
    expect(bodyMeasurementProblem({ ...blank, weight: 180, bone_mass: Infinity }, now)).toMatch(
      /^Bone mass must/,
    );
    expect(bodyMeasurementProblem({ ...blank, weight: Number.NaN }, now)).toMatch(/^Weight must/);
  });

  it('refuses an empty, malformed or future date', () => {
    expect(bodyMeasurementProblem({ ...blank, date: '', weight: 180 }, now)).toBe(
      'Pick the date of the measurement.',
    );
    expect(bodyMeasurementProblem({ ...blank, date: '2026-02-31x', weight: 180 }, now)).toBe(
      'Pick the date of the measurement.',
    );
    expect(bodyMeasurementProblem({ ...blank, date: '2026-10-06', weight: 180 }, now)).toMatch(
      /hasn't happened yet/,
    );
  });
});
