import type { AtlasStorage } from '@atlas/storage';

/** Exactly one program is active at a time -- activating one deactivates the rest. */
export async function setActiveProgram(storage: AtlasStorage, programId: string): Promise<void> {
  const programs = await storage.programs.getAll();
  const now = new Date().toISOString();

  for (const program of programs) {
    const shouldBeActive = program.id === programId;
    if (program.is_active !== shouldBeActive) {
      await storage.programs.put({
        ...program,
        is_active: shouldBeActive,
        // Becoming the active program starts its schedule now (see `Program.activated_at`).
        ...(shouldBeActive ? { activated_at: now } : {}),
        updated_at: now,
        version: program.version + 1,
      });
    }
  }
}
