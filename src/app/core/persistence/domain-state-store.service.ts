import { inject, Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { CloudDomainSyncService } from './cloud-domain-sync.service';

interface DomainStateRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
  schemaVersion: number;
}

interface DomainStateDb extends DBSchema {
  states: {
    key: string;
    value: DomainStateRecord;
    indexes: { 'by-updated': number };
  };
}

@Injectable({ providedIn: 'root' })
export class DomainStateStore {
  private readonly cloud = inject(CloudDomainSyncService);
  private readonly db: Promise<IDBPDatabase<DomainStateDb>> = openDB<DomainStateDb>(
    'super-productivity-domain-state',
    1,
    {
      upgrade(database) {
        const store = database.createObjectStore('states', { keyPath: 'key' });
        store.createIndex('by-updated', 'updatedAt');
      },
    },
  );

  async get<T>(key: string): Promise<T | undefined> {
    const local = await (await this.db).get('states', key);
    const remote = await this.cloud.load<T>('state', key);
    if (remote && (!local || remote.updatedAt > local.updatedAt)) {
      await (await this.db).put('states', {
        key,
        value: remote.value,
        updatedAt: remote.updatedAt,
        schemaVersion: 1,
      });
      return remote.value;
    }
    return local?.value as T | undefined;
  }

  async put<T>(key: string, value: T, schemaVersion = 1): Promise<void> {
    await (await this.db).put('states', {
      key,
      value,
      updatedAt: Date.now(),
      schemaVersion,
    });
    await this.cloud.save('state', key, value);
  }

  async migrateLegacy<T>(
    key: string,
    legacyStorageKey: string,
    fallbackValue: T,
  ): Promise<T> {
    const legacy = localStorage.getItem(legacyStorageKey);
    if (legacy) {
      const parsed = JSON.parse(legacy) as T;
      await this.put(key, parsed);
      localStorage.removeItem(legacyStorageKey);
      return parsed;
    }
    return (await this.get<T>(key)) ?? fallbackValue;
  }
}
