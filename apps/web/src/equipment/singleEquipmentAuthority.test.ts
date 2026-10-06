import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * vNext Handoff 04B. What the gyms-and-equipment work must not drift back into,
 * pinned by reading the source (the same way `singleRenderer.test.ts` pins one
 * body map and `singleEvaluator.test.ts` one benchmark authority):
 *
 * - progression and load logic stay in the engines: no screen imports a
 *   low-level load or decision helper to work a load out for itself;
 * - the active training location is the owner's *current context* (default,
 *   last used, or the one picked), never a second setting stored beside
 *   `TrainingLocation` -- the old `activeTrainingLocationId` is gone for good;
 * - there is one location identity: no parallel "gym profile" model;
 * - once a set is logged the workout's place and that exercise's machine are
 *   fixed -- enforced by the engine's transforms, and never offered by a screen.
 */
const WEB_SRC = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Comments explain what used to be here; only code counts. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const read = (full: string) => ({
  path: relative(REPO, full).replace(/\\/g, '/'),
  text: readFileSync(full, 'utf8'),
});
const webFiles = sourceFiles(WEB_SRC).map(read);
const packageFiles = sourceFiles(join(REPO, 'packages')).map(read);
const allFiles = [...webFiles, ...packageFiles];
const text = (path: string) => allFiles.find((f) => f.path === path)?.text ?? '';
const filesContaining = (files: { path: string; text: string }[], needle: string | RegExp) =>
  files
    .filter((f) => (typeof needle === 'string' ? f.text.includes(needle) : needle.test(f.text)))
    .map((f) => f.path)
    .sort();

/** Every `import { a, type b as c } from 'module'` in a file, as `{ module, names }` with the ORIGINAL exported names. */
function namedImports(source: string): { module: string; names: string[] }[] {
  const found: { module: string; names: string[] }[] = [];
  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    const names = (match[1] ?? '')
      .split(',')
      .map((part) =>
        part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter(Boolean);
    found.push({ module: match[2]!, names });
  }
  return found;
}

/**
 * The primitives that decide a load: what a machine can lift, what the next load
 * is, whether it is at its maximum, and the unconstrained progression decision.
 * Screens call the high-level entry points (`recommendProgression`,
 * `applyProgressionToSession`) and display what comes back.
 */
const LOW_LEVEL_LOAD_HELPERS = [
  'availableLoads',
  'nextAvailableLoad',
  'isAtEquipmentMax',
  'maximumLoad',
  'hasLoadList',
  'hasEquipmentData',
  'computeProgressionDecision',
  'decideWithinEquipment',
  'progressableLoadField',
  'loadValue',
  'withLoad',
];

describe('progression and load logic stay in the engines', () => {
  it('no screen imports a low-level load or decision helper', () => {
    const offenders = webFiles.flatMap((file) =>
      namedImports(file.text)
        .filter((entry) => entry.module.startsWith('@atlas/'))
        .flatMap((entry) =>
          entry.names
            .filter((name) => LOW_LEVEL_LOAD_HELPERS.includes(name))
            .map((name) => `${file.path}: ${name}`),
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('no screen reaches into a package past its public entry point', () => {
    expect(filesContaining(webFiles, /from\s*['"]@atlas\/[^'"/]+\/(?:src|dist)\//)).toEqual([]);
  });

  it('the live workout asks the engine for the recommendation, given the machine actually in use', () => {
    const gym = text('apps/web/src/gym/GymModeScreen.tsx');
    expect(gym).toContain('recommendProgression(');
    expect(gym).toMatch(/equipment:\s*effectiveEquipment\?\.constraints/);
  });

  it('a workout starting from Today is stamped through the engine, with the machine and history for the chosen place', () => {
    const today = text('apps/web/src/today/TodayScreen.tsx');
    expect(today).toContain('applyProgressionToSession(');
    expect(today).toContain('startContextFor(');
  });

  it('a target is re-worked only through the one shared helper, when a machine is chosen or the place changes', () => {
    expect(filesContaining(webFiles, 'restampUntouchedTargets(')).toEqual([
      'apps/web/src/equipment/sessionStartContext.ts',
      'apps/web/src/gym/GymModeScreen.tsx',
    ]);
  });
});

describe('one training-location identity', () => {
  it('the old "active training location" setting is gone from every source file', () => {
    expect(filesContaining(allFiles, 'activeTrainingLocationId')).toEqual([]);
  });

  it('it is gone from the documentation too', () => {
    const docs = readdirSync(join(REPO, 'docs'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => read(join(REPO, 'docs', name)));
    expect(filesContaining(docs, 'activeTrainingLocationId')).toEqual([]);
  });

  it('the screen that kept equipment beside the old setting no longer exists', () => {
    expect(allFiles.some((f) => f.path.endsWith('settings/EquipmentScreen.tsx'))).toBe(false);
    expect(filesContaining(allFiles, 'EquipmentScreen')).toEqual([]);
  });

  it('there is no second location model beside TrainingLocation', () => {
    expect(filesContaining(allFiles, /\bGymProfile\b/)).toEqual([]);
  });

  it('settings no longer stores a location of any kind', () => {
    expect(withoutComments(text('apps/web/src/settings/settings.ts'))).not.toMatch(/location/i);
  });
});

describe("a logged set fixes the workout's place and each exercise's machine", () => {
  it("only the live workout can move a workout's place or set an exercise's machine -- one door each", () => {
    expect(filesContaining(webFiles, 'changeSessionLocation(')).toEqual([
      'apps/web/src/gym/GymModeScreen.tsx',
    ]);
    expect(filesContaining(webFiles, 'setExerciseEquipment(')).toEqual([
      'apps/web/src/gym/GymModeScreen.tsx',
    ]);
  });

  it("the engine's transforms refuse the change themselves, before touching anything", () => {
    const engine = text('packages/workout-engine/src/sessionContext.ts');
    expect(engine).toMatch(
      /export function setExerciseEquipment\([\s\S]*?\{\s*if \(isExerciseEquipmentLocked\(session, exerciseId\)\) return session;/,
    );
    expect(engine).toMatch(
      /export function changeSessionLocation\([\s\S]*?if \(isLocationLocked\(session\)\) return session;/,
    );
  });

  it('the live workout asks whether the place and the machine are locked, and renders no place picker when it is', () => {
    const gym = text('apps/web/src/gym/GymModeScreen.tsx');
    expect(gym).toContain('isLocationLocked(');
    expect(gym).toContain('isExerciseEquipmentLocked(');
    expect(gym).toMatch(/locationLocked\s*\?\s*\([\s\S]*?\)\s*:\s*\(\s*<TrainingLocationPicker/);
  });

  it("the equipment panel's locked state offers no way to choose, add or change a machine", () => {
    const panel = text('apps/web/src/gym/ExerciseEquipmentPanel.tsx');
    const locked = /if \(locked\) \{([\s\S]*?)\n {2}\}\n/.exec(panel)?.[1] ?? '';
    expect(locked.length).toBeGreaterThan(200); // found the branch, not an empty match
    expect(locked).not.toMatch(
      /onChoose|onCreated|onDismissPrompt|setMode\(|choose\(|<EquipmentForm/,
    );
  });
});
