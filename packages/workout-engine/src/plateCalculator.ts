export type BarPreset = 'olympic' | 'standard' | 'ez' | 'trap' | 'smith' | 'custom';

/** Common nominal bar weights (lb) -- the owner's actual bar may differ
 * slightly (especially "standard" and Smith machine bars vary a lot by
 * gym); `custom` exists precisely so a wrong preset never has to be lived
 * with. */
export const BAR_PRESET_WEIGHTS: Record<Exclude<BarPreset, 'custom'>, number> = {
  olympic: 45,
  standard: 25,
  ez: 20,
  trap: 45,
  smith: 15,
};

/** Common plate sizes (lb), one of each pair -- unlimited quantity assumed
 * per size (see `PlateBreakdown`'s doc comment); simple customization is
 * just editing this list, not a per-plate inventory count. */
export const DEFAULT_AVAILABLE_PLATES = [45, 35, 25, 10, 5, 2.5];

export interface PlateBreakdown {
  /** What the user asked to load. */
  requestedTotal: number;
  barWeight: number;
  /** One side's plates, heaviest first. Empty if the bar alone already
   * meets or exceeds the request. */
  perSide: number[];
  /** barWeight + 2 * sum(perSide) -- the load this breakdown actually
   * produces, which may differ from requestedTotal (see `exact`). */
  actualTotal: number;
  /** False when the requested total isn't achievable with the available
   * plates -- `actualTotal` is then the nearest achievable load at or
   * below the request (see this module's doc comment on why below, not
   * above). The caller must display `actualTotal`, never silently treat
   * `requestedTotal` as if it were loaded. */
  exact: boolean;
}

/**
 * Greedy, largest-plate-first per side. This is the standard way lifters
 * actually load a bar, and is exactly optimal for realistic plate sets
 * (45/35/25/10/5/2.5 and similar) since every target a lifter cares about
 * is a multiple of the smallest plate present.
 *
 * ponytail: greedy is not provably optimal for an arbitrary/adversarial
 * plate set (a non-canonical set could have a target reachable only by a
 * combination greedy misses) -- upgrade to an exact subset-sum search if a
 * real custom plate set ever demonstrates this. Not worth it for the
 * common-plates case this targets.
 *
 * Never rounds UP past the request: loading more than asked for is a
 * correctness bug (a user expecting 185 must never be handed 190 without
 * being told), so an unreachable exact target resolves to the nearest
 * achievable total AT OR BELOW it, with `exact: false` so the caller must
 * surface that rather than silently substituting.
 */
export function calculatePlateBreakdown(
  requestedTotal: number,
  barWeight: number,
  availablePlates: number[] = DEFAULT_AVAILABLE_PLATES,
): PlateBreakdown {
  const perSideTarget = (requestedTotal - barWeight) / 2;
  if (perSideTarget <= 0) {
    return {
      requestedTotal,
      barWeight,
      perSide: [],
      actualTotal: barWeight,
      exact: perSideTarget === 0,
    };
  }

  const sorted = [...availablePlates].filter((p) => p > 0).sort((a, b) => b - a);
  const perSide: number[] = [];
  let remaining = perSideTarget;
  const EPSILON = 1e-9;
  for (const plate of sorted) {
    while (remaining - plate >= -EPSILON) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  const actualPerSide = perSide.reduce((sum, p) => sum + p, 0);
  const actualTotal = barWeight + actualPerSide * 2;
  return {
    requestedTotal,
    barWeight,
    perSide,
    actualTotal,
    exact: Math.abs(actualTotal - requestedTotal) < EPSILON,
  };
}
