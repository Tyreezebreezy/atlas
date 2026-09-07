import type { AtlasProgramDocument, AtlasWorkoutDocument } from './types';

/**
 * djb2 -- a small, dependency-free, non-cryptographic string hash. Good
 * enough for "does this look like the same source content already
 * imported" (collisions would only ever cause a false "maybe duplicate"
 * warning, never silent data loss), not worth pulling in a real hash
 * library for. ponytail: if this ever needs cryptographic collision
 * resistance, switch to SubtleCrypto's digest -- not needed for a
 * same-device duplicate-import hint.
 */
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * A stable content fingerprint for a workout/program import document --
 * deliberately excludes `exported_at` (which differs on every export of
 * the very same source) so re-exporting and re-importing the same HTML
 * twice produces the SAME fingerprint. This is the "normalized content
 * hash" half of the idempotency contract described in
 * docs/IMPORT_FORMAT.md "Import idempotency"; `source fingerprint` in that
 * doc's terms is this value, and the "logical record identifier" is
 * whichever Program/WorkoutTemplate id ends up storing it.
 */
export function computeImportFingerprint(
  document:
    Pick<AtlasWorkoutDocument, 'kind' | 'workout'> | Pick<AtlasProgramDocument, 'kind' | 'program'>,
): string {
  const content = document.kind === 'workout' ? document.workout : document.program;
  return djb2(JSON.stringify(content));
}
