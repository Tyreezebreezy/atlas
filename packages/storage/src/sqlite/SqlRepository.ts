import type Database from '@tauri-apps/plugin-sql';
import type { SyncMeta } from '@atlas/data-model';
import type { Repository } from '../types';

/**
 * ponytail: rows are (id, deleted_at, data JSON) — not a fully normalized
 * relational schema. Keeps this adapter behaviorally identical to the
 * IndexedDB one (both are "whole document" stores) and avoids hand-writing a
 * column mapping for ten entities that nothing queries relationally yet.
 * Move a table to real columns when the progress/analytics engine (v0.0.6+)
 * needs SQL-level aggregation over it.
 */
export class SqlRepository<T extends SyncMeta> implements Repository<T> {
  constructor(
    private readonly db: Database,
    private readonly table: string,
  ) {}

  async get(id: string): Promise<T | undefined> {
    const rows = await this.db.select<{ data: string }[]>(
      `SELECT data FROM ${this.table} WHERE id = $1`,
      [id],
    );
    return rows[0] ? (JSON.parse(rows[0].data) as T) : undefined;
  }

  async getAll(): Promise<T[]> {
    const rows = await this.db.select<{ data: string }[]>(
      `SELECT data FROM ${this.table} WHERE deleted_at IS NULL`,
    );
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  async put(entity: T): Promise<void> {
    await this.db.execute(
      `INSERT INTO ${this.table} (id, deleted_at, data) VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, data = excluded.data`,
      [entity.id, entity.deleted_at, JSON.stringify(entity)],
    );
  }

  // ponytail: 50 rows/statement, not one call per row -- cuts a 1,324-row
  // seed from that many IPC round trips to ~27. No explicit BEGIN/COMMIT:
  // tauri-plugin-sql pools connections per call, so a transaction opened on
  // one call isn't guaranteed to be the one a later call runs on -- confirmed
  // by testing (the second execute in a "transaction" throws "no transaction
  // is active" on COMMIT). Each multi-row INSERT is already atomic on its
  // own, which is all a bulk seed needs; ON CONFLICT DO UPDATE keeps re-runs
  // idempotent if a batch partway through ever needs retrying.
  async putMany(entities: T[]): Promise<void> {
    const BATCH_SIZE = 50;
    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE);
      const placeholders = batch
        .map((_, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`)
        .join(', ');
      const values = batch.flatMap((entity) => [
        entity.id,
        entity.deleted_at,
        JSON.stringify(entity),
      ]);
      await this.db.execute(
        `INSERT INTO ${this.table} (id, deleted_at, data) VALUES ${placeholders}
         ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, data = excluded.data`,
        values,
      );
    }
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    const now = new Date().toISOString();
    await this.put({ ...existing, deleted_at: now, updated_at: now });
  }
}
