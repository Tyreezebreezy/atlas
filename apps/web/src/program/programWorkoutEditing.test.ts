// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { seedExercises } from '@atlas/exercise-library';
import { createProgram, createProgramDay, createProgramWeek } from '@atlas/program-engine';
import { createPlannedExercise, createWorkoutTemplate } from '@atlas/workout-engine';
import { ProgramScreen } from './ProgramScreen';

const holder = vi.hoisted(() => ({ storage: null as unknown }));
vi.mock('../storage/StorageContext', () => ({ useStorage: () => holder.storage }));

/**
 * Acceptance pass G1: a workout reached only through a program day (not flagged "Show in Quick Workouts") had no way
 * to be opened for editing anywhere in the UI. Every workout a program day uses must be editable from Program.
 */
let storage: IndexedDbAdapter;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  storage = new IndexedDbAdapter(`atlas-test-${crypto.randomUUID()}`);
  holder.storage = storage;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
});

const $ = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector);
const byLabel = (label: string) => $(`[aria-label="${label}"]`);
const until = (check: () => unknown) =>
  vi.waitFor(
    () => {
      if (!check()) throw new Error('not there yet');
    },
    { timeout: 5000, interval: 20 },
  );

function click(element: HTMLElement | null) {
  if (!element) throw new Error('nothing to click');
  element.click();
}

function typeInto(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('no input to type into');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function seed() {
  const exercise = seedExercises.find((e) => e.name === 'barbell bench press');
  if (!exercise) throw new Error('expected "barbell bench press" in seed data');
  await storage.exercises.put({ ...exercise, media: null });

  // One quick workout, plus two reached only through program days (is_quick_workout: false).
  const quick = createWorkoutTemplate('Quick Push', true);
  const pushA = createWorkoutTemplate('Push A', false);
  const pullB = createWorkoutTemplate('Pull B', false);
  for (const template of [quick, pushA, pullB]) {
    template.exercises = [createPlannedExercise(exercise.id, 0)];
  }
  await storage.workoutTemplates.putMany([quick, pushA, pullB]);

  const week = createProgramWeek(0, null);
  week.days = [
    createProgramDay(0, 'Day 1', pushA.id),
    createProgramDay(1, 'Day 2', pullB.id),
    createProgramDay(2, 'Day 3', 'a-workout-that-was-deleted'),
  ];
  const program = createProgram('Strength', null);
  program.weeks = [week];
  await storage.programs.put(program);
  return { pushA, pullB, firstDayId: week.days[0]!.id };
}

async function openProgram() {
  root.render(createElement(ProgramScreen));
  await until(() => byLabel('Strength, 1 week'));
  click(byLabel('Strength, 1 week'));
  await until(() => $('#program-name'));
}

describe('editing a program day’s workout from Program', () => {
  it('is offered for every day whose workout exists, quick or not, and never for a deleted one', async () => {
    await seed();
    root.render(createElement(ProgramScreen));
    await until(() => byLabel('Strength, 1 week'));
    // the precondition: Push A and Pull B are not in the Quick Workouts list, so nothing else could reach them
    expect(host.textContent).toContain('Quick Push');
    expect(host.textContent).not.toContain('Push A');
    expect(host.textContent).not.toContain('Pull B');

    click(byLabel('Strength, 1 week'));
    await until(() => $('#program-name'));

    expect(byLabel('Edit workout Push A')).not.toBeNull();
    expect(byLabel('Edit workout Pull B')).not.toBeNull();
    expect(host.querySelectorAll('.atlas-program-editor__edit-workout')).toHaveLength(2);
    expect(host.textContent).toContain('(this workout no longer exists)');
  });

  it('opens that workout, saves it, and comes back to the unsaved program with focus on the same day', async () => {
    const { pushA, firstDayId } = await seed();
    await openProgram();

    // an unsaved change to the program, made before leaving for the workout
    typeInto($<HTMLInputElement>('input[aria-label="Day label"]'), 'Heavy day');

    click(byLabel('Edit workout Push A'));
    await until(() => $('#template-name'));
    expect($<HTMLInputElement>('#template-name')?.value).toBe('Push A');

    typeInto($<HTMLInputElement>('#template-name'), 'Push A heavier');
    click($('.atlas-template-editor__save'));
    await until(() => $('#program-name'));

    const saved = await storage.workoutTemplates.get(pushA.id);
    expect(saved?.name).toBe('Push A heavier');
    expect(saved?.is_quick_workout).toBe(false); // editing it from Program never changes whether it is a Quick Workout

    // back in the program: the unsaved day label survived, the day now shows the new workout name, focus is on its button
    expect($<HTMLInputElement>('input[aria-label="Day label"]')?.value).toBe('Heavy day');
    const select = () => $<HTMLSelectElement>('select[aria-label="Workout"]');
    await until(() => select()?.selectedOptions[0]?.textContent === 'Push A heavier'); // the list reloads just after the swap back
    expect(select()?.value).toBe(pushA.id);
    expect(byLabel('Edit workout Push A heavier')).not.toBeNull();
    expect(document.activeElement?.id).toBe(`edit-workout-${firstDayId}`);
  });

  it('leaves the workout as it was when you go Back without saving', async () => {
    const { pullB } = await seed();
    await openProgram();

    click(byLabel('Edit workout Pull B'));
    await until(() => $('#template-name'));
    typeInto($<HTMLInputElement>('#template-name'), 'Never saved');
    click($('.atlas-template-editor__back'));
    await until(() => $('#program-name'));

    expect((await storage.workoutTemplates.get(pullB.id))?.name).toBe('Pull B');
    expect(byLabel('Edit workout Pull B')).not.toBeNull();
  });
});
