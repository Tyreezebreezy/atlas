/**
 * Shared string/metadata matching primitives for external exercise-media
 * providers (Workout Guide, Free Exercise DB, and any future one) --
 * extracted in v0.1.5 out of `matchWorkoutGuideMedia.ts` so a second
 * provider reuses the same reviewed logic instead of re-implementing it,
 * per the explicit "do not create a completely independent matching
 * system" instruction. Provider-specific matcher files still own their
 * own tier ordering and explicit mapping tables -- what's shared here is
 * only the parts that are genuinely provider-agnostic string/candidate
 * math.
 */

export function normalize(name: string): string {
  // Punctuation becomes a space, not deleted outright -- "Pull-Up" and
  // "pull up" must normalize identically, which deleting the hyphen
  // outright would break ("Pull-Up" -> "pullup" vs "pull up" unchanged).
  return name
    .toLowerCase()
    .replace(/[.,'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Compound words that normalize()'s punctuation-to-space rule otherwise
// leaves as two tokens on one side and one on the other (e.g. ATLAS's
// "pull up" vs a source's "Pullup"). Applied to the whole normalized
// string, not per-token, since these are two-word phrases.
const PHRASE_FOLDS: [RegExp, string][] = [
  [/\bpress ?up\b/g, 'pushup'],
  [/\bpush ?up\b/g, 'pushup'],
  [/\bpull ?up\b/g, 'pullup'],
  [/\bchin ?up\b/g, 'chinup'],
  [/\bsit ?up\b/g, 'situp'],
  [/\bpull ?down\b/g, 'pulldown'],
];

// Standalone equipment shorthand -- word-boundary token replacement only,
// never a substring replace (a substring "bb"->"barbell" would corrupt
// unrelated words).
const TOKEN_FOLDS: Record<string, string> = { db: 'dumbbell', bb: 'barbell', kb: 'kettlebell' };

/**
 * A stronger, order- and plural-insensitive canonical key, layered on top
 * of `normalize()`. Only folds spelling/format variants of the identical
 * movement (compound-word spacing, equipment shorthand, plural "-s", word
 * order) -- it never drops a token, so a real distinguishing qualifier
 * (incline/flat, front/back, seated/standing, pronated/supinated, "single
 * arm", etc.) always survives and still blocks a match. See "do not
 * false-match movements" in docs/EXERCISE_MEDIA.md.
 */
export function fuzzyKey(name: string): string {
  let s = normalize(name);
  for (const [pattern, replacement] of PHRASE_FOLDS) s = s.replace(pattern, replacement);
  const tokens = s
    .split(' ')
    .filter((t) => t.length > 0 && t !== 's') // "World's" -> "world s" under normalize(); drop the stray possessive "s".
    .map((t) => TOKEN_FOLDS[t] ?? t)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
  tokens.sort();
  return tokens.join(' ');
}

/**
 * Narrows an already-fuzzy-matched but ambiguous (2+ candidate) group down
 * to one, using two caller-supplied predicates (typically "does this
 * candidate's equipment match the source entry's equipment" and "...
 * muscle...") -- never a primary match signal on its own (metadata alone
 * would match dozens of exercises), only to disambiguate a name match
 * that's already narrowed to a small candidate set. Equipment should
 * always be checked first (pass it as `matchesPrimary`) since it's the
 * sharpest signal for the false-match risks that matter most (dumbbell vs
 * barbell, cable vs machine); the secondary predicate only breaks a
 * further tie among candidates the first one couldn't narrow.
 */
export function disambiguateByPredicates<T>(
  candidates: T[],
  matchesPrimary: (item: T) => boolean,
  matchesSecondary: (item: T) => boolean,
): T | null {
  const byPrimary = candidates.filter(matchesPrimary);
  const pool = byPrimary.length >= 1 ? byPrimary : candidates;
  if (pool.length === 1) return pool[0] ?? null;

  const bySecondary = pool.filter(matchesSecondary);
  return bySecondary.length === 1 ? (bySecondary[0] ?? null) : null;
}
