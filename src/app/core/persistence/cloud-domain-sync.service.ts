import { Injectable } from '@angular/core';

export interface CloudDomainSnapshot<T> {
  value: T;
  updatedAt: number;
}

/**
 * Stores versioned domain snapshots in pluginUserData so RPG/Academy
 * Arcana/Arcane Library state can sync across devices via the existing
 * plugin persistence channel.
 *
 * EMERGENCY STABILIZATION (2026-08-01): disabled. The real implementation
 * chunked each domain value into ~48KB pieces and persisted each chunk via
 * `PluginUserPersistenceService`, where every chunk becomes its own op-log
 * operation (dispatch -> capture -> validate -> vector clock -> potential
 * compaction/snapshot). A single RPG roster save could fan out into a dozen
 * or more such operations; this was traced to the renderer hanging/crashing
 * shortly after startup while replaying and re-flushing that op volume
 * (reported: app freezing after marking a task done, then a startup
 * crash-loop). `load()` always returning null and `save()` being a no-op
 * makes every caller (DomainStateStore, ArcaneLibraryRepository,
 * AcademyStudyService) fall back to their local-only IndexedDB path, which
 * is already each domain's source of truth on this device - nothing here
 * deletes or bypasses local persistence, cross-device sync is just paused
 * until the write-amplification issue is fixed at its root.
 */
@Injectable({ providedIn: 'root' })
export class CloudDomainSyncService {
  async load<T>(_domain: string, _scope: string): Promise<CloudDomainSnapshot<T> | null> {
    return null;
  }

  async save<T>(_domain: string, _scope: string, _value: T): Promise<void> {
    return;
  }
}
