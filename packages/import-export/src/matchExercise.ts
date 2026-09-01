import type { Exercise } from '@atlas/data-model';
import type { ExerciseMatchResult } from './types';

/** Common lifting shorthand, expanded before token comparison. Not exhaustive --
 * ponytail: covers the abbreviations actually seen in real pasted workouts;
 * extend this list if a real import repeatedly fails to suggest a candidate. */
const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  bp: 'bench press',
  bw: 'bodyweight',
  "db's": 'dumbbell',
  pu: 'pull-up',
  hstpu: 'handstand push-up',
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(normalized: string): string {
  const words = normalized.split(' ');
  return words.map((word) => ABBREVIATIONS[word] ?? word).join(' ');
}

function tokenize(name: string): Set<string> {
  return new Set(expandAbbreviations(normalize(name)).split(' ').filter(Boolean));
}

function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.max(a.size, b.size);
}

/** Attempts exact -> normalized -> alias matches, in that order, each fully
 * deterministic and unambiguous enough to auto-resolve. Anything else comes
 * back unresolved with up to 5 ranked candidates for the user to confirm --
 * never silently mapped, per docs/IMPORT_FORMAT.md. */
export function matchExercise(inputName: string, library: Exercise[]): ExerciseMatchResult {
  const trimmedInput = inputName.trim();

  const exact = library.find((exercise) => exercise.name === trimmedInput);
  if (exact) {
    return {
      input_name: trimmedInput,
      matched_exercise: exact,
      confidence: 'exact',
      candidates: [],
    };
  }

  const normalizedInput = normalize(trimmedInput);
  const normalized = library.find((exercise) => normalize(exercise.name) === normalizedInput);
  if (normalized) {
    return {
      input_name: trimmedInput,
      matched_exercise: normalized,
      confidence: 'normalized',
      candidates: [],
    };
  }

  const alias = library.find((exercise) =>
    exercise.aliases.some((candidateAlias) => normalize(candidateAlias) === normalizedInput),
  );
  if (alias) {
    return {
      input_name: trimmedInput,
      matched_exercise: alias,
      confidence: 'alias',
      candidates: [],
    };
  }

  const inputTokens = tokenize(trimmedInput);
  const scored = library
    .map((exercise) => ({
      exercise,
      score: tokenOverlapScore(inputTokens, tokenize(exercise.name)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.exercise);

  return {
    input_name: trimmedInput,
    matched_exercise: null,
    confidence: 'unresolved',
    candidates: scored,
  };
}
