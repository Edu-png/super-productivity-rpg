import { inject, Injectable } from '@angular/core';
import { PluginUserPersistenceService } from '../../plugins/plugin-user-persistence.service';

interface CloudManifest {
  version: 1;
  updatedAt: number;
  chunks: number;
}

export interface CloudDomainSnapshot<T> {
  value: T;
  updatedAt: number;
}

/**
 * Stores versioned domain snapshots in pluginUserData. That state already
 * participates in every Super Productivity sync provider, while chunking
 * keeps each entity below the persistence limit.
 */
@Injectable({ providedIn: 'root' })
export class CloudDomainSyncService {
  private readonly persistence = inject(PluginUserPersistenceService);
  private readonly queued = new Map<string, Promise<void>>();
  private readonly chunkSize = 48_000;

  async load<T>(domain: string, scope: string): Promise<CloudDomainSnapshot<T> | null> {
    const key = this.key(domain, scope);
    const rawManifest = await this.persistence.loadPluginUserData(`${key}:manifest`);
    if (!rawManifest) return null;
    try {
      const manifest = JSON.parse(rawManifest) as CloudManifest;
      const chunks = await Promise.all(
        Array.from({ length: manifest.chunks }, (_, index) =>
          this.persistence.loadPluginUserData(`${key}:chunk:${index}`),
        ),
      );
      if (chunks.some((chunk) => chunk === null)) return null;
      return {
        value: JSON.parse(chunks.join('')) as T,
        updatedAt: manifest.updatedAt,
      };
    } catch {
      return null;
    }
  }

  save<T>(domain: string, scope: string, value: T): Promise<void> {
    const key = this.key(domain, scope);
    const previous = this.queued.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const serialized = JSON.stringify(value);
        const chunks: string[] = [];
        for (let index = 0; index < serialized.length; index += this.chunkSize) {
          chunks.push(serialized.slice(index, index + this.chunkSize));
        }
        if (!chunks.length) chunks.push('');
        for (let index = 0; index < chunks.length; index++) {
          await this.persistence.persistPluginUserData(
            `${key}:chunk:${index}`,
            chunks[index],
          );
        }
        await this.persistence.persistPluginUserData(
          `${key}:manifest`,
          JSON.stringify({
            version: 1,
            updatedAt: Date.now(),
            chunks: chunks.length,
          } satisfies CloudManifest),
        );
      });
    this.queued.set(key, next);
    void next.finally(() => {
      if (this.queued.get(key) === next) this.queued.delete(key);
    });
    return next;
  }

  private key(domain: string, scope: string): string {
    return `life-rpg:${domain}:${scope}`;
  }
}
