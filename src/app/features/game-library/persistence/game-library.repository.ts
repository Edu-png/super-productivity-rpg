import { inject, Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { CloudDomainSyncService } from '../../../core/persistence/cloud-domain-sync.service';
import {
  LibraryGame,
  GameLibraryGroup,
  GameLibrarySettings,
  GameChallenge,
  GameDailyAggregate,
  PlaySession,
} from '../domain/game-library.models';

interface GameLibraryDb extends DBSchema {
  games: {
    key: string;
    value: LibraryGame;
    indexes: { 'by-profile': string; 'by-profile-status': [string, string] };
  };
  sessions: {
    key: string;
    value: PlaySession;
    indexes: { 'by-profile-date': [string, string]; 'by-game-date': [string, string] };
  };
  groups: {
    key: string;
    value: GameLibraryGroup;
    indexes: { 'by-profile-kind': [string, string] };
  };
  aggregates: {
    key: string;
    value: GameDailyAggregate;
    indexes: { 'by-profile-date': [string, string] };
  };
  challenges: { key: string; value: GameChallenge; indexes: { 'by-profile': string } };
  settings: { key: string; value: GameLibrarySettings };
}

export interface GameLibraryCloudSnapshot {
  games: LibraryGame[];
  sessions: PlaySession[];
  groups: GameLibraryGroup[];
  aggregates: GameDailyAggregate[];
  challenges: GameChallenge[];
  settings?: GameLibrarySettings;
}

@Injectable({ providedIn: 'root' })
export class GameLibraryRepository {
  private readonly cloud = inject(CloudDomainSyncService);
  private readonly cloudTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly db: Promise<IDBPDatabase<GameLibraryDb>> = openDB<GameLibraryDb>(
    'super-productivity-game-library',
    1,
    {
      upgrade(db) {
        const games = db.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('by-profile', 'profileId');
        games.createIndex('by-profile-status', ['profileId', 'status']);
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('by-profile-date', ['profileId', 'date']);
        sessions.createIndex('by-game-date', ['gameId', 'date']);
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
    const localGames = await db.getAllFromIndex('games', 'by-profile', profileId);
    const localUpdatedAt = localGames.reduce(
      (latest, game) => Math.max(latest, game.updatedAt),
      0,
    );
    const remote = await this.cloud.load<GameLibraryCloudSnapshot>(
      'game-library',
      profileId,
    );
    if (remote && remote.updatedAt > localUpdatedAt) {
      const tx = db.transaction(
        ['games', 'sessions', 'groups', 'aggregates', 'challenges', 'settings'],
        'readwrite',
      );
      await Promise.all([
        ...remote.value.games.map((row) => tx.objectStore('games').put(row)),
        ...remote.value.sessions.map((row) => tx.objectStore('sessions').put(row)),
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
    const [games, groups, aggregates, challenges, settings] = await Promise.all([
      db.getAllFromIndex('games', 'by-profile', profileId),
      db
        .getAll('groups')
        .then((rows) => rows.filter((row) => row.profileId === profileId)),
      db
        .getAll('aggregates')
        .then((rows) => rows.filter((row) => row.profileId === profileId)),
      db.getAllFromIndex('challenges', 'by-profile', profileId),
      db.get('settings', profileId),
    ]);
    return { games, groups, aggregates, challenges, settings };
  }

  async exportProfile(profileId: string): Promise<GameLibraryCloudSnapshot> {
    const db = await this.db;
    const [games, sessions, groups, aggregates, challenges, settings] = await Promise.all(
      [
        db.getAllFromIndex('games', 'by-profile', profileId),
        db
          .getAll('sessions')
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
    return { games, sessions, groups, aggregates, challenges, settings };
  }

  async importProfile(snapshot: GameLibraryCloudSnapshot): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(
      ['games', 'sessions', 'groups', 'aggregates', 'challenges', 'settings'],
      'readwrite',
    );
    await Promise.all([
      ...snapshot.games.map((row) => tx.objectStore('games').put(row)),
      ...snapshot.sessions.map((row) => tx.objectStore('sessions').put(row)),
      ...snapshot.groups.map((row) => tx.objectStore('groups').put(row)),
      ...snapshot.aggregates.map((row) => tx.objectStore('aggregates').put(row)),
      ...snapshot.challenges.map((row) => tx.objectStore('challenges').put(row)),
      ...(snapshot.settings ? [tx.objectStore('settings').put(snapshot.settings)] : []),
    ]);
    await tx.done;
  }

  async putGame(game: LibraryGame): Promise<void> {
    await (await this.db).put('games', game);
    this.queueCloudSave(game.profileId);
  }
  async deleteGame(id: string): Promise<void> {
    const db = await this.db;
    const game = await db.get('games', id);
    await db.delete('games', id);
    if (game) this.queueCloudSave(game.profileId);
  }
  async putGroup(group: GameLibraryGroup): Promise<void> {
    await (await this.db).put('groups', group);
    this.queueCloudSave(group.profileId);
  }
  async deleteGroup(id: string): Promise<void> {
    const db = await this.db;
    const group = await db.get('groups', id);
    await db.delete('groups', id);
    if (group) this.queueCloudSave(group.profileId);
  }
  async putChallenge(challenge: GameChallenge): Promise<void> {
    await (await this.db).put('challenges', challenge);
    this.queueCloudSave(challenge.profileId);
  }
  async deleteChallenge(id: string): Promise<void> {
    const db = await this.db;
    const challenge = await db.get('challenges', id);
    await db.delete('challenges', id);
    if (challenge) this.queueCloudSave(challenge.profileId);
  }
  async putSettings(settings: GameLibrarySettings): Promise<void> {
    await (await this.db).put('settings', settings);
    this.queueCloudSave(settings.profileId);
  }

  async addSession(session: PlaySession): Promise<GameDailyAggregate> {
    const db = await this.db;
    const tx = db.transaction(['sessions', 'aggregates'], 'readwrite');
    await tx.objectStore('sessions').put(session);
    const id = `${session.profileId}:${session.date}`;
    const store = tx.objectStore('aggregates');
    const aggregate = (await store.get(id)) ?? {
      id,
      profileId: session.profileId,
      date: session.date,
      minutes: 0,
      sessions: 0,
      xp: 0,
      gold: 0,
      gameMinutes: {},
    };
    aggregate.minutes += session.minutes;
    aggregate.sessions++;
    aggregate.xp += session.xpEarned;
    aggregate.gold += session.goldEarned;
    aggregate.gameMinutes[session.gameId] =
      (aggregate.gameMinutes[session.gameId] ?? 0) + session.minutes;
    await store.put(aggregate);
    await tx.done;
    this.queueCloudSave(session.profileId);
    return aggregate;
  }

  async listSessions(gameId: string): Promise<PlaySession[]> {
    const rows = await (await this.db).getAll('sessions');
    return rows
      .filter((row) => row.gameId === gameId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  private queueCloudSave(profileId: string): void {
    clearTimeout(this.cloudTimers.get(profileId));
    this.cloudTimers.set(
      profileId,
      setTimeout(async () => {
        const db = await this.db;
        const [games, sessions, groups, aggregates, challenges, settings] =
          await Promise.all([
            db.getAllFromIndex('games', 'by-profile', profileId),
            db
              .getAll('sessions')
              .then((rows) => rows.filter((row) => row.profileId === profileId)),
            db
              .getAll('groups')
              .then((rows) => rows.filter((row) => row.profileId === profileId)),
            db
              .getAll('aggregates')
              .then((rows) => rows.filter((row) => row.profileId === profileId)),
            db.getAllFromIndex('challenges', 'by-profile', profileId),
            db.get('settings', profileId),
          ]);
        await this.cloud.save('game-library', profileId, {
          games,
          sessions,
          groups,
          aggregates,
          challenges,
          settings,
        } satisfies GameLibraryCloudSnapshot);
        this.cloudTimers.delete(profileId);
      }, 800),
    );
  }
}
