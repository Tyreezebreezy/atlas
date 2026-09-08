import { hasRunOnce, markRunOnce } from '@atlas/core';
import type { AtlasStorage } from '@atlas/storage';

const MIGRATION_KEY = 'milestones-v0.2.3-builtin-catalog';

/**
 * v0.2.2 and earlier seeded every built-in milestone as an active goal
 * (createMilestone's old unconditional `active: true`); v0.2.3 changes that
 * default so a fresh seed starts catalog-only (see
 * ensureBuiltInMilestonesSeeded.ts). This is the one-time correction for
 * installs that already seeded under the old default -- every unachieved
 * built-in goes back to catalog-only, exactly once, ever. A fresh install
 * (no milestones yet) just finds nothing to demote and marks itself done on
 * the same boot, so this is safe to call unconditionally at startup
 * alongside `ensureBuiltInMilestonesSeeded`.
 *
 * Gated by a durable localStorage flag (`@atlas/core`'s onceFlags, same
 * shape as deviceId.ts) rather than re-derived from the data on every boot:
 * after this runs once, the owner is free to re-activate any built-in from
 * the catalog, and this must never fight that choice back on a later
 * launch. Achieved milestones and anything that isn't `is_builtin` (i.e.
 * every owner-created milestone, which was always meant as a goal) are
 * never touched, regardless of when or how many times this runs.
 */
export async function migrateBuiltInMilestonesToCatalog(storage: AtlasStorage): Promise<void> {
  if (hasRunOnce(MIGRATION_KEY)) return;

  const milestones = await storage.milestones.getAll();
  const toDemote = milestones.filter((m) => m.is_builtin && m.active && m.achieved_at == null);
  if (toDemote.length > 0) {
    const now = new Date().toISOString();
    await storage.milestones.putMany(
      toDemote.map((m) => ({ ...m, active: false, updated_at: now, version: m.version + 1 })),
    );
  }
  markRunOnce(MIGRATION_KEY);
}
