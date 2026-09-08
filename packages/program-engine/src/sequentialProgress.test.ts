import { describe, expect, it } from 'vitest';
import type { Program } from '@atlas/data-model';
import { createProgram, createProgramDay, createProgramWeek } from './createProgram';
import {
  advanceProgramSequence,
  currentSequentialDay,
  programProgressionMode,
  programSequencePosition,
  shouldShowWeekLabel,
} from './sequentialProgress';

function sequentialProgram(dayCount: number): Program {
  const days = Array.from({ length: dayCount }, (_, i) =>
    createProgramDay(i, `Day ${i + 1}`, `tpl-${i}`),
  );
  const week = { ...createProgramWeek(0, null), days };
  return { ...createProgram('Rotation', null), progression_mode: 'sequential', weeks: [week] };
}

describe('programProgressionMode / programSequencePosition', () => {
  it('defaults a pre-v0.1.1 program (fields absent at runtime) to fixed / 0', () => {
    const legacy = { ...createProgram('Old', null) } as Program;
    // @ts-expect-error -- simulating a record stored before these fields existed
    delete legacy.progression_mode;
    // @ts-expect-error -- same
    delete legacy.sequence_position;
    expect(programProgressionMode(legacy)).toBe('fixed');
    expect(programSequencePosition(legacy)).toBe(0);
  });
});

describe('shouldShowWeekLabel', () => {
  it('hides the week label for a single repeating week', () => {
    const program = {
      ...createProgram('Weekly Workout Guide', null),
      weeks: [createProgramWeek(1, null)],
    };
    expect(shouldShowWeekLabel(program)).toBe(false);
  });

  it('shows week labels once a program has more than one real week', () => {
    const program = {
      ...createProgram('Block Program', null),
      weeks: [createProgramWeek(1, 'Week 1'), createProgramWeek(2, 'Week 2 · Deload')],
    };
    expect(shouldShowWeekLabel(program)).toBe(true);
  });

  it('hides the label for a program with zero weeks yet (a brand new, unsaved program)', () => {
    const program = createProgram('New Program', null);
    expect(shouldShowWeekLabel(program)).toBe(false);
  });
});

describe('currentSequentialDay', () => {
  it('returns null for a program with no days', () => {
    expect(currentSequentialDay(sequentialProgram(0))).toBeNull();
  });

  it('returns the day at sequence_position', () => {
    const program = { ...sequentialProgram(3), sequence_position: 1 };
    expect(currentSequentialDay(program)?.day.label).toBe('Day 2');
  });
});

describe('advanceProgramSequence', () => {
  it('does nothing for a fixed-schedule program', () => {
    const program = { ...sequentialProgram(2), progression_mode: 'fixed' } as Program;
    const day = program.weeks[0]!.days[0]!;
    expect(advanceProgramSequence(program, day.id).sequence_position).toBe(0);
  });

  it('advances by one when the completed day matches the current position', () => {
    const program = sequentialProgram(3);
    const dayA = program.weeks[0]!.days[0]!;
    const advanced = advanceProgramSequence(program, dayA.id);
    expect(advanced.sequence_position).toBe(1);
  });

  it('wraps back to 0 after the last day -- a repeating rotation, not a program that ends', () => {
    const program = { ...sequentialProgram(2), sequence_position: 1 };
    const dayB = program.weeks[0]!.days[1]!;
    expect(advanceProgramSequence(program, dayB.id).sequence_position).toBe(0);
  });

  it('does not advance when a different day is completed -- missing a day does not skip it', () => {
    const program = sequentialProgram(3);
    const dayB = program.weeks[0]!.days[1]!; // not the current position (0)
    expect(advanceProgramSequence(program, dayB.id).sequence_position).toBe(0);
  });

  it('does not advance on an unrelated/unknown day id', () => {
    const program = sequentialProgram(2);
    expect(advanceProgramSequence(program, 'not-a-real-day').sequence_position).toBe(0);
  });
});
