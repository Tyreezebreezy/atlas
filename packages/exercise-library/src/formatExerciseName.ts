/**
 * Display-only capitalization for exercise names. The canonical stored
 * `Exercise.name` (and any name derived from it for matching/enrichment/
 * media/aliases) is never touched -- this only formats what's rendered.
 * Numeric tokens ("45", "90") pass through unchanged; a short table covers
 * acronyms that generic title-casing would otherwise mangle ("ez" ->
 * "Ez"). Everything else, single letters included ("t" -> "T" for
 * T-Bar, "l" -> "L" for L-Sit), falls out of plain title-casing.
 */
const SPECIAL_CASE_WORDS: Record<string, string> = {
  ez: 'EZ',
  rdl: 'RDL',
  amrap: 'AMRAP',
};

const WORD_PATTERN = /[A-Za-z0-9]+(?:'[A-Za-z]+)*/g;

export function formatExerciseName(name: string): string {
  return name.replace(WORD_PATTERN, (word) => {
    if (/^\d+$/.test(word)) return word;
    const lower = word.toLowerCase();
    const special = SPECIAL_CASE_WORDS[lower];
    if (special) return special;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}
