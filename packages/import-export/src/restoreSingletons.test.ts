import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '@atlas/storage';
import { createProgram } from '@atlas/program-engine';
import { exportBackup } from './exportBackup';
import { restoreBackup } from './restoreBackup';

const fresh = () => new IndexedDbAdapter(`atlas-restore-singletons-${crypto.randomUUID()}`);

/** Things there is exactly one of: restoring a backup into a device that already has one must not leave two. */
describe('restore keeps the active program unique', () => {
  it('the restored active program wins over the one already active on the device', async () => {
    const source = fresh();
    const restored = { ...createProgram('Strength Block', null), is_active: true };
    await source.programs.put(restored);
    const backup = await exportBackup(source);

    const target = fresh();
    const existing = { ...createProgram('Cut', null), is_active: true };
    const idle = createProgram('Idle', null);
    await target.programs.putMany([existing, idle]);
    await restoreBackup(backup, target);

    const all = await target.programs.getAll();
    expect(all.filter((p) => p.is_active).map((p) => p.id)).toEqual([restored.id]);
    expect(all.map((p) => p.id).sort()).toEqual([existing.id, idle.id, restored.id].sort()); // nothing is deleted
  });

  it("a backup with no active program leaves the device's active program alone", async () => {
    const source = fresh();
    await source.programs.put(createProgram('Spare', null));
    const backup = await exportBackup(source);

    const target = fresh();
    const existing = { ...createProgram('Cut', null), is_active: true };
    await target.programs.put(existing);
    await restoreBackup(backup, target);

    expect((await target.programs.getAll()).filter((p) => p.is_active).map((p) => p.id)).toEqual([
      existing.id,
    ]);
  });

  it('restoring the same backup twice is still one active program', async () => {
    const source = fresh();
    await source.programs.put({ ...createProgram('Strength Block', null), is_active: true });
    const backup = await exportBackup(source);
    const target = fresh();
    await restoreBackup(backup, target);
    await restoreBackup(backup, target);
    expect((await target.programs.getAll()).filter((p) => p.is_active)).toHaveLength(1);
  });
});

describe('restore keeps each built-in milestone unique', () => {
  const builtin = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    id,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    version: 1,
    device_id: 'd',
    deleted_at: null,
    title,
    exercise_id: 'bench',
    dimension: 'weight' as const,
    target_weight: 185,
    target_reps: 1,
    target_volume: null,
    target_duration_seconds: null,
    target_distance_meters: null,
    target_bodyweight_multiplier: null,
    reference_value: null,
    multiplier: null,
    is_builtin: true,
    active: false,
    achieved_at: null,
    origin_session_id: null,
    origin_set_id: null,
    ...extra,
  });

  it("a device that already seeded its own built-ins does not end up with each one twice; the backup's state wins", async () => {
    const source = fresh();
    await source.milestones.putMany([
      builtin('src-185', '185 lb Bench Press', {
        active: true,
        achieved_at: '2026-09-20T00:00:00.000Z',
      }),
      builtin('src-225', '225 lb Bench Press', { target_weight: 225 }),
    ]);
    const backup = await exportBackup(source);

    const target = fresh();
    await target.milestones.putMany([
      builtin('dev-185', '185 lb Bench Press'), // the device's own seed of the same built-in, with a different id
      builtin('dev-225', '225 lb Bench Press', { target_weight: 225 }),
      builtin('dev-315', '315 lb Bench Press', { target_weight: 315 }), // a built-in the backup does not have: untouched
      builtin('mine', 'My own goal', { is_builtin: false }),
    ]);
    await restoreBackup(backup, target);

    const live = await target.milestones.getAll();
    expect(live.map((m) => m.title).sort()).toEqual([
      '185 lb Bench Press',
      '225 lb Bench Press',
      '315 lb Bench Press',
      'My own goal',
    ]);
    expect(live.find((m) => m.title === '185 lb Bench Press')).toMatchObject({
      id: 'src-185',
      active: true,
      achieved_at: '2026-09-20T00:00:00.000Z',
    });
  });

  it('restoring the same backup twice changes nothing', async () => {
    const source = fresh();
    await source.milestones.put(builtin('src-185', '185 lb Bench Press', { active: true }));
    const backup = await exportBackup(source);
    const target = fresh();
    await target.milestones.put(builtin('dev-185', '185 lb Bench Press'));
    await restoreBackup(backup, target);
    await restoreBackup(backup, target);
    expect((await target.milestones.getAll()).map((m) => m.id)).toEqual(['src-185']);
  });
});
