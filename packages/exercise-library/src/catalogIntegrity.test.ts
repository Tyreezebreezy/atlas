import { describe, expect, it } from 'vitest';
import { seedExercises } from './ensureExercisesSeeded';

/**
 * The "sled 45° ..." family. Four of these shipped garbled as "45в°"; the corrected rows keep the ids that every
 * workout, template and record already points at, so a name fix never re-points anything.
 */
const SLED_45_ROWS: Record<string, string> = {
  'a2890b85-d22d-473e-abb4-8fa84f4fc1e5': 'sled 45° calf press',
  'edf4d45f-163a-43f5-9d5b-5f427d5fe6c5': 'sled 45° leg press',
  '5e40dd38-6ab0-44f9-a85b-23635e4b31b3': 'sled 45° leg press (back pov)',
  '050a9234-71c6-42f7-a440-d12fa8e585c7': 'sled 45° leg wide press',
  'ece77947-0cfd-4056-993a-885a6404144f': 'sled 45° leg press (side pov)',
};

// Cyrillic letters, the replacement character and the usual UTF-8-read-as-Latin-1 sequences: none belongs in an
// English catalog, so any of them in any field is a text-encoding mistake.
const MOJIBAKE = /[Ѐ-ӿ�]|Ã|Â|â€/;

function textOf(value: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => textOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [key, v] of Object.entries(value)) textOf(v, `${path}.${key}`, out);
  return out;
}

describe('exercise catalog integrity', () => {
  it('gives every row its own id and a name', () => {
    expect(new Set(seedExercises.map((e) => e.id)).size).toBe(seedExercises.length);
    expect(seedExercises.filter((e) => e.name.trim() === '')).toEqual([]);
  });

  // A deliberate edit to this number is the point: removing or merging a row (the six duplicate-named rows wait for
  // Import / Alias Integration) re-points nothing silently.
  it('still holds every canonical row', () => {
    expect(seedExercises).toHaveLength(1324);
  });

  it('has no text-encoding damage in any field of any row', () => {
    const damaged = seedExercises.flatMap((e) =>
      textOf(e, e.id)
        .filter(({ text }) => MOJIBAKE.test(text))
        .map(({ path, text }) => `${path}: ${text}`),
    );
    expect(damaged).toEqual([]);
  });

  it('spells the sled 45° family with the degree sign, on the same stable ids', () => {
    const nameById = new Map(seedExercises.map((e) => [e.id, e.name]));
    for (const [id, name] of Object.entries(SLED_45_ROWS)) expect(nameById.get(id), id).toBe(name);
  });
});
