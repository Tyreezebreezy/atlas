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

  async softDelete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    const now = new Date().toISOString();
    await this.put({ ...existing, deleted_at: now, updated_at: now });
  }
}
