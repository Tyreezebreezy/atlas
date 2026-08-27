import type { Table } from 'dexie';
import type { SyncMeta } from '@atlas/data-model';
import type { Repository } from '../types';

export class DexieRepository<T extends SyncMeta> implements Repository<T> {
  constructor(private readonly table: Table<T, string>) {}

  get(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  getAll(): Promise<T[]> {
    return this.table.filter((entity) => entity.deleted_at === null).toArray();
  }

  put(entity: T): Promise<void> {
    return this.table.put(entity).then(() => undefined);
  }

  putMany(entities: T[]): Promise<void> {
    return this.table.bulkPut(entities).then(() => undefined);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.table.get(id);
    if (!existing) return;
    const now = new Date().toISOString();
    await this.table.put({ ...existing, deleted_at: now, updated_at: now });
  }
}
