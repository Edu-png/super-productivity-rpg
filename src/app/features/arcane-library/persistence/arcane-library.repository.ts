import { inject, Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { CloudDomainSyncService } from '../../../core/persistence/cloud-domain-sync.service';
import {
  ArcaneBook,
  LibraryGroup,
  LibrarySettings,
  ReadingChallenge,
  ReadingDailyAggregate,
  ReadingLog,
} from '../domain/arcane-library.models';

interface LibraryDb extends DBSchema {
  books: {
    key: string;
    value: ArcaneBook;
    indexes: { 'by-profile': string; 'by-profile-status': [string, string] };
  };
  logs: {
    key: string;
    value: ReadingLog;
    indexes: { 'by-profile-date': [string, string]; 'by-book-date': [string, string] };
  };
  groups: {
    key: string;
    value: LibraryGroup;
    indexes: { 'by-profile-kind': [string, string] };
  };
  aggregates: {
    key: string;
    value: ReadingDailyAggregate;
    indexes: { 'by-profile-date': [string, string] };
  };
  challenges: { key: string; value: ReadingChallenge; indexes: { 'by-profile': string } };
  settings: { key: string; value: LibrarySettings };
}

export interface LibraryCloudSnapshot {
  books: ArcaneBook[];
  logs: ReadingLog[];
  groups: LibraryGroup[];
  aggregates: ReadingDailyAggregate[];
  challenges: ReadingChallenge[];
  settings?: LibrarySettings;
}

@Injectable({ providedIn: 'root' })
export class ArcaneLibraryRepository {
  private readonly cloud = inject(CloudDomainSyncService);
  private readonly cloudTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly db: Promise<IDBPDatabase<LibraryDb>> = openDB<LibraryDb>(
    'super-productivity-arcane-library',
    1,
    {
      upgrade(db) {
        const books = db.createObjectStore('books', { keyPath: 'id' });
        books.createIndex('by-profile', 'profileId');
        books.createIndex('by-profile-status', ['profileId', 'status']);
        const logs = db.createObjectStore('logs', { keyPath: 'id' });
        logs.createIndex('by-profile-date', ['profileId', 'date']);
        logs.createIndex('by-book-date', ['bookId', 'date']);
        const groups = db.createObjectStore('groups', { keyPath: 'id' });
        groups.createIndex('by-profile-kind', ['profileId', 'kind']);
        const aggregates = db.createObjectStore('aggregates', { keyPath: 'id' });
        aggregates.createIndex('by-profile-date', ['profileId', 'date']);
        const challenges = db.createObjectStore('challenges', { keyPath: 'id' });
        challenges.createIndex('by-profile', 'profileId');
        db.createObjectStore('settings', { keyPath: 'id' });
      },
    },
  );

  async load(profileId: string) {
    const db = await this.db;
    const localBooks = await db.getAllFromIndex('books', 'by-profile', profileId);
    const localUpdatedAt = localBooks.reduce(
      (latest, book) => Math.max(latest, book.updatedAt),
      0,
    );
    const remote = await this.cloud.load<LibraryCloudSnapshot>('library', profileId);
    if (remote && remote.updatedAt > localUpdatedAt) {
      const tx = db.transaction(
        ['books', 'logs', 'groups', 'aggregates', 'challenges', 'settings'],
        'readwrite',
      );
      await Promise.all([
        ...remote.value.books.map((row) => tx.objectStore('books').put(row)),
        ...remote.value.logs.map((row) => tx.objectStore('logs').put(row)),
        ...remote.value.groups.map((row) => tx.objectStore('groups').put(row)),
        ...remote.value.aggregates.map((row) => tx.objectStore('aggregates').put(row)),
        ...remote.value.challenges.map((row) => tx.objectStore('challenges').put(row)),
        ...(remote.value.settings
          ? [tx.objectStore('settings').put(remote.value.settings)]
          : []),
      ]);
      await tx.done;
    } else if (localUpdatedAt > 0) {
      this.queueCloudSave(profileId);
    }
    const [books, groups, aggregates, challenges, settings] = await Promise.all([
      db.getAllFromIndex('books', 'by-profile', profileId),
      db
        .getAll('groups')
        .then((rows) => rows.filter((row) => row.profileId === profileId)),
      db
        .getAll('aggregates')
        .then((rows) => rows.filter((row) => row.profileId === profileId)),
      db.getAllFromIndex('challenges', 'by-profile', profileId),
      db.get('settings', profileId),
    ]);
    return { books, groups, aggregates, challenges, settings };
  }

  async exportProfile(profileId: string): Promise<LibraryCloudSnapshot> {
    const db = await this.db;
    const [books, logs, groups, aggregates, challenges, settings] = await Promise.all([
      db.getAllFromIndex('books', 'by-profile', profileId),
      db.getAll('logs').then((rows) => rows.filter((row) => row.profileId === profileId)),
      db
        .getAll('groups')
        .then((rows) => rows.filter((row) => row.profileId === profileId)),
      db
        .getAll('aggregates')
        .then((rows) => rows.filter((row) => row.profileId === profileId)),
      db.getAllFromIndex('challenges', 'by-profile', profileId),
      db.get('settings', profileId),
    ]);
    return { books, logs, groups, aggregates, challenges, settings };
  }

  async importProfile(snapshot: LibraryCloudSnapshot): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(
      ['books', 'logs', 'groups', 'aggregates', 'challenges', 'settings'],
      'readwrite',
    );
    await Promise.all([
      ...snapshot.books.map((row) => tx.objectStore('books').put(row)),
      ...snapshot.logs.map((row) => tx.objectStore('logs').put(row)),
      ...snapshot.groups.map((row) => tx.objectStore('groups').put(row)),
      ...snapshot.aggregates.map((row) => tx.objectStore('aggregates').put(row)),
      ...snapshot.challenges.map((row) => tx.objectStore('challenges').put(row)),
      ...(snapshot.settings ? [tx.objectStore('settings').put(snapshot.settings)] : []),
    ]);
    await tx.done;
  }

  async putBook(book: ArcaneBook): Promise<void> {
    await (await this.db).put('books', book);
    this.queueCloudSave(book.profileId);
  }
  async deleteBook(id: string): Promise<void> {
    const db = await this.db;
    const book = await db.get('books', id);
    await db.delete('books', id);
    if (book) this.queueCloudSave(book.profileId);
  }
  async putGroup(group: LibraryGroup): Promise<void> {
    await (await this.db).put('groups', group);
    this.queueCloudSave(group.profileId);
  }
  async deleteGroup(id: string): Promise<void> {
    const db = await this.db;
    const group = await db.get('groups', id);
    await db.delete('groups', id);
    if (group) this.queueCloudSave(group.profileId);
  }
  async putChallenge(challenge: ReadingChallenge): Promise<void> {
    await (await this.db).put('challenges', challenge);
    this.queueCloudSave(challenge.profileId);
  }
  async deleteChallenge(id: string): Promise<void> {
    const db = await this.db;
    const challenge = await db.get('challenges', id);
    await db.delete('challenges', id);
    if (challenge) this.queueCloudSave(challenge.profileId);
  }
  async putSettings(settings: LibrarySettings): Promise<void> {
    await (await this.db).put('settings', settings);
    this.queueCloudSave(settings.profileId);
  }

  async addLog(log: ReadingLog): Promise<ReadingDailyAggregate> {
    const db = await this.db;
    const tx = db.transaction(['logs', 'aggregates'], 'readwrite');
    await tx.objectStore('logs').put(log);
    const id = `${log.profileId}:${log.date}`;
    const store = tx.objectStore('aggregates');
    const aggregate = (await store.get(id)) ?? {
      id,
      profileId: log.profileId,
      date: log.date,
      minutes: 0,
      pages: 0,
      sessions: 0,
      xp: 0,
      gold: 0,
      bookMinutes: {},
    };
    const pages = Math.max(0, log.endPage - log.startPage);
    aggregate.minutes += log.minutes;
    aggregate.pages += pages;
    aggregate.sessions++;
    aggregate.xp += log.xpEarned;
    aggregate.gold += log.goldEarned;
    aggregate.bookMinutes[log.bookId] =
      (aggregate.bookMinutes[log.bookId] ?? 0) + log.minutes;
    await store.put(aggregate);
    await tx.done;
    this.queueCloudSave(log.profileId);
    return aggregate;
  }

  async listLogs(bookId: string): Promise<ReadingLog[]> {
    const rows = await (await this.db).getAll('logs');
    return rows
      .filter((row) => row.bookId === bookId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  private queueCloudSave(profileId: string): void {
    clearTimeout(this.cloudTimers.get(profileId));
    this.cloudTimers.set(
      profileId,
      setTimeout(async () => {
        const db = await this.db;
        const [books, logs, groups, aggregates, challenges, settings] = await Promise.all(
          [
            db.getAllFromIndex('books', 'by-profile', profileId),
            db
              .getAll('logs')
              .then((rows) => rows.filter((row) => row.profileId === profileId)),
            db
              .getAll('groups')
              .then((rows) => rows.filter((row) => row.profileId === profileId)),
            db
              .getAll('aggregates')
              .then((rows) => rows.filter((row) => row.profileId === profileId)),
            db.getAllFromIndex('challenges', 'by-profile', profileId),
            db.get('settings', profileId),
          ],
        );
        await this.cloud.save('library', profileId, {
          books,
          logs,
          groups,
          aggregates,
          challenges,
          settings,
        } satisfies LibraryCloudSnapshot);
        this.cloudTimers.delete(profileId);
      }, 800),
    );
  }
}
