import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * vNext Handoff 03B: "Do not maintain two body-map renderers." One component
 * (`BodyMap`) paints the anatomy for Progress, the Library, the exercise
 * editor, and program planning -- this pins that, by reading the source.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((full) => ({
  path: relative(SRC, full).replace(/\\/g, '/'),
  text: readFileSync(full, 'utf8'),
}));
const filesContaining = (needle: string | RegExp) =>
  files
    .filter((f) => (typeof needle === 'string' ? f.text.includes(needle) : needle.test(f.text)))
    .map((f) => f.path)
    .sort();

describe('one body-map renderer', () => {
  it('only the mapping layer imports the vendored geometry, and only BodyMap draws it', () => {
    expect(filesContaining(/from '[^']*vendoredMuscleShapes'/)).toEqual(['anatomy/anatomyMapping.ts']);
    expect(filesContaining('VIEW_LAYOUTS')).toEqual(['anatomy/BodyMap.tsx', 'anatomy/anatomyMapping.ts']);
  });

  it('no other file draws an anatomical figure of its own', () => {
    // A hand-rolled figure would need raw path data or its own SVG body; the only <svg> allowed
    // near "body" wording is BodyMap's.
    const drawsBodies = files
      .filter((f) => /<svg/.test(f.text) && /body|muscle|anatom/i.test(f.path))
      .map((f) => f.path);
    expect(drawsBodies).toEqual(['anatomy/BodyMap.tsx']);
  });

  it('Progress, the Library, the exercise editor and program planning all use it', () => {
    const consumers = files
      .filter((f) => /<BodyMap\b/.test(f.text) && f.path !== 'anatomy/BodyMap.tsx')
      .map((f) => f.path)
      .sort();
    expect(consumers).toEqual(
      expect.arrayContaining([
        'library/CustomExerciseForm.tsx',
        'library/ExerciseDetail.tsx',
        'library/LibraryScreen.tsx',
        'program/TemplateEditor.tsx',
        'progress/MusclesView.tsx',
        'progress/OverviewView.tsx',
      ]),
    );
    for (const path of consumers) {
      const text = files.find((f) => f.path === path)?.text ?? '';
      expect(text, `${path} should import the shared component`).toMatch(/from '\.\.\/anatomy\/BodyMap'/);
    }
  });

  it('the Library browses through the shared domain query, not a private copy of the filter', () => {
    const library = files.find((f) => f.path === 'library/LibraryScreen.tsx')?.text ?? '';
    expect(library).toContain('exercisesTargetingMuscles');
    expect(library).not.toContain('mappedMuscleIds');
  });
});
