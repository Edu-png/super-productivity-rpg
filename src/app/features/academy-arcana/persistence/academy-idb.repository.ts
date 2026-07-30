import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import {
  AcademyBackup,
  AcademyDashboardSnapshot,
  AcademySettings,
  DailyStudyAggregate,
  Flashcard,
  FlashcardReview,
  StudyArea,
  StudyMaterial,
  StudyNode,
  StudySession,
} from '../domain/academy.models';
import { AcademyRepository } from '../domain/academy.repository';

interface AcademyDbSchema extends DBSchema {
  areas: {
    key: string;
    value: StudyArea;
    indexes: { 'by-profile-position': [string, number] };
  };
  nodes: {
    key: string;
    value: StudyNode;
    indexes: {
      'by-profile-area': [string, string];
      'by-profile-parent': [string, string];
      'by-profile-kind': [string, string];
    };
  };
  materials: {
    key: string;
    value: StudyMaterial;
    indexes: { 'by-profile-node': [string, string] };
  };
  sessions: {
    key: string;
    value: StudySession;
    indexes: {
      'by-profile-started': [string, number];
      'by-profile-status': [string, string];
    };
  };
  flashcards: {
    key: string;
    value: Flashcard;
    indexes: {
      'by-profile': string;
      'by-profile-due': [string, number];
      'by-profile-reviews': [string, number];
      'by-profile-deck': [string, string];
    };
  };
  reviews: {
    key: string;
    value: FlashcardReview;
    indexes: {
      'by-profile-reviewed': [string, number];
      'by-card-reviewed': [string, number];
    };
  };
  aggregates: {
    key: string;
    value: DailyStudyAggregate;
    indexes: { 'by-profile-date': [string, string] };
  };
  settings: { key: string; value: AcademySettings };
}

const DB_NAME = 'super-productivity-academy-arcana';
const DB_VERSION = 1;
const lower = (profileId: string): [string, number] => [profileId, 0];
const upper = (profileId: string): [string, number] => [
  profileId,
  Number.MAX_SAFE_INTEGER,
];
const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

@Injectable({ providedIn: 'root' })
export class AcademyIdbRepository extends AcademyRepository {
  private readonly db: Promise<IDBPDatabase<AcademyDbSchema>> = openDB<
    AcademyDbSchema
  >(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const areas = database.createObjectStore('areas', { keyPath: 'id' });
      areas.createIndex('by-profile-position', ['profileId', 'position']);

      const nodes = database.createObjectStore('nodes', { keyPath: 'id' });
      nodes.createIndex('by-profile-area', ['profileId', 'areaId']);
      nodes.createIndex('by-profile-parent', ['profileId', 'parentId']);
      nodes.createIndex('by-profile-kind', ['profileId', 'kind']);

      const materials = database.createObjectStore('materials', { keyPath: 'id' });
      materials.createIndex('by-profile-node', ['profileId', 'nodeId']);

      const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('by-profile-started', ['profileId', 'startedAt']);
      sessions.createIndex('by-profile-status', ['profileId', 'status']);

      const cards = database.createObjectStore('flashcards', { keyPath: 'id' });
      cards.createIndex('by-profile', 'profileId');
      cards.createIndex('by-profile-due', ['profileId', 'dueAt']);
      cards.createIndex('by-profile-reviews', ['profileId', 'reviewCount']);
      cards.createIndex('by-profile-deck', ['profileId', 'deckId']);

      const reviews = database.createObjectStore('reviews', { keyPath: 'id' });
      reviews.createIndex('by-profile-reviewed', ['profileId', 'reviewedAt']);
      reviews.createIndex('by-card-reviewed', ['cardId', 'reviewedAt']);

      const aggregates = database.createObjectStore('aggregates', { keyPath: 'id' });
      aggregates.createIndex('by-profile-date', ['profileId', 'date']);
      database.createObjectStore('settings', { keyPath: 'id' });
    },
  });

  async listAreas(profileId: string): Promise<StudyArea[]> {
    const db = await this.db;
    return db.getAllFromIndex(
      'areas',
      'by-profile-position',
      IDBKeyRange.bound([profileId, 0], [profileId, Number.MAX_SAFE_INTEGER]),
    );
  }

  async putArea(area: StudyArea): Promise<void> {
    await (await this.db).put('areas', area);
  }

  async listNodes(profileId: string, areaId?: string): Promise<StudyNode[]> {
    const db = await this.db;
    if (areaId) {
      return db.getAllFromIndex(
        'nodes',
        'by-profile-area',
        IDBKeyRange.only([profileId, areaId]),
      );
    }
    const transaction = db.transaction('nodes');
    const all = await transaction.store.getAll();
    return all.filter((node) => node.profileId === profileId && !node.deletedAt);
  }

  async putNode(node: StudyNode): Promise<void> {
    await (await this.db).put('nodes', node);
  }

  async listMaterials(profileId: string, nodeId: string): Promise<StudyMaterial[]> {
    return (await this.db).getAllFromIndex(
      'materials',
      'by-profile-node',
      IDBKeyRange.only([profileId, nodeId]),
    );
  }

  async putMaterial(material: StudyMaterial): Promise<void> {
    await (await this.db).put('materials', material);
  }

  async putSession(session: StudySession): Promise<void> {
    const db = await this.db;
    const previous = await db.get('sessions', session.id);
    const transaction = db.transaction(['sessions', 'aggregates'], 'readwrite');
    await transaction.objectStore('sessions').put(session);
    if (session.status === 'completed') {
      const date = dateKey(new Date(session.endedAt ?? session.startedAt));
      const aggregateId = `${session.profileId}:${date}`;
      const store = transaction.objectStore('aggregates');
      const current = (await store.get(aggregateId)) ?? {
        id: aggregateId,
        profileId: session.profileId,
        date,
        totalMinutes: 0,
        sessionCount: 0,
        flashcardsReviewed: 0,
        correctReviews: 0,
        xpEarned: 0,
        goldEarned: 0,
        areaMinutes: {},
        nodeMinutes: {},
        projectMinutes: {},
        updatedAt: Date.now(),
      };
      const previousMinutes =
        previous?.status === 'completed' ? previous.actualMinutes : 0;
      const delta = session.actualMinutes - previousMinutes;
      current.totalMinutes = Math.max(0, current.totalMinutes + delta);
      if (previous?.status !== 'completed') current.sessionCount++;
      current.flashcardsReviewed +=
        session.flashcardsReviewed -
        (previous?.status === 'completed' ? previous.flashcardsReviewed : 0);
      current.xpEarned +=
        session.xpEarned - (previous?.status === 'completed' ? previous.xpEarned : 0);
      current.goldEarned +=
        session.goldEarned -
        (previous?.status === 'completed' ? previous.goldEarned : 0);
      current.areaMinutes[session.areaId] =
        (current.areaMinutes[session.areaId] ?? 0) + delta;
      if (session.nodeId) {
        current.nodeMinutes ??= {};
        current.nodeMinutes[session.nodeId] =
          (current.nodeMinutes[session.nodeId] ?? 0) + delta;
      }
      if (session.projectId) {
        current.projectMinutes[session.projectId] =
          (current.projectMinutes[session.projectId] ?? 0) + delta;
      }
      current.updatedAt = Date.now();
      await store.put(current);
    }
    await transaction.done;
  }

  async getSession(id: string): Promise<StudySession | undefined> {
    return (await this.db).get('sessions', id);
  }

  async listSessions(
    profileId: string,
    from: number,
    to: number,
    offset: number,
    limit: number,
  ): Promise<StudySession[]> {
    const db = await this.db;
    const index = db
      .transaction('sessions')
      .store.index('by-profile-started');
    let cursor = await index.openCursor(
      IDBKeyRange.bound([profileId, from], [profileId, to]),
      'prev',
    );
    const result: StudySession[] = [];
    let skipped = 0;
    while (cursor && result.length < limit) {
      if (skipped++ >= offset) result.push(cursor.value);
      cursor = await cursor.continue();
    }
    return result;
  }

  async putFlashcard(card: Flashcard): Promise<void> {
    await (await this.db).put('flashcards', card);
  }

  async countFlashcards(profileId: string): Promise<number> {
    return (await this.db).countFromIndex(
      'flashcards',
      'by-profile',
      IDBKeyRange.only(profileId),
    );
  }

  async countLearnedCards(profileId: string): Promise<number> {
    return (await this.db).countFromIndex(
      'flashcards',
      'by-profile-reviews',
      IDBKeyRange.bound([profileId, 1], upper(profileId)),
    );
  }

  async getDueFlashcards(
    profileId: string,
    before: number,
    limit: number,
  ): Promise<Flashcard[]> {
    return (await this.db).getAllFromIndex(
      'flashcards',
      'by-profile-due',
      IDBKeyRange.bound(lower(profileId), [profileId, before]),
      limit,
    );
  }

  async putReview(review: FlashcardReview): Promise<void> {
    const db = await this.db;
    const transaction = db.transaction(['reviews', 'aggregates'], 'readwrite');
    await transaction.objectStore('reviews').put(review);
    const date = dateKey(new Date(review.reviewedAt));
    const id = `${review.profileId}:${date}`;
    const aggregates = transaction.objectStore('aggregates');
    const current = (await aggregates.get(id)) ?? {
      id,
      profileId: review.profileId,
      date,
      totalMinutes: 0,
      sessionCount: 0,
      flashcardsReviewed: 0,
      correctReviews: 0,
      xpEarned: 0,
      goldEarned: 0,
      areaMinutes: {},
      nodeMinutes: {},
      projectMinutes: {},
      updatedAt: Date.now(),
    };
    current.flashcardsReviewed++;
    if (review.rating >= 3) current.correctReviews++;
    current.updatedAt = Date.now();
    await aggregates.put(current);
    await transaction.done;
  }

  async getFlashcard(id: string): Promise<Flashcard | undefined> {
    return (await this.db).get('flashcards', id);
  }

  async dashboard(
    profileId: string,
    now: Date,
  ): Promise<AcademyDashboardSnapshot> {
    const db = await this.db;
    const end = dateKey(now);
    const start = '0000-00-00';
    const aggregates = await db.getAllFromIndex(
      'aggregates',
      'by-profile-date',
      IDBKeyRange.bound([profileId, start], [profileId, end]),
    );
    const today = dateKey(now);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const nodes = await this.listNodes(profileId);
    const cards = await this.countFlashcards(profileId);
    const learned = await this.countLearnedCards(profileId);
    const dueCount = await db.countFromIndex(
      'flashcards',
      'by-profile-due',
      IDBKeyRange.bound(lower(profileId), [profileId, Date.now()]),
    );
    const recentDays = aggregates;
    let streak = 0;
    const studied = new Set(aggregates.filter((a) => a.totalMinutes > 0).map((a) => a.date));
    const cursor = new Date(now);
    for (let day = 0; day < 366; day++) {
      if (!studied.has(dateKey(cursor))) {
        if (day === 0) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    const reviewed = aggregates.reduce((sum, a) => sum + a.flashcardsReviewed, 0);
    const correct = aggregates.reduce((sum, a) => sum + a.correctReviews, 0);
    const topicNodes = nodes.filter((node) =>
      ['topic', 'subtopic'].includes(node.kind),
    );
    return {
      todayMinutes: aggregates.find((a) => a.date === today)?.totalMinutes ?? 0,
      weekMinutes: aggregates
        .filter((a) => a.date >= dateKey(weekStart))
        .reduce((sum, a) => sum + a.totalMinutes, 0),
      monthMinutes: aggregates
        .filter((a) => a.date >= monthStart)
        .reduce((sum, a) => sum + a.totalMinutes, 0),
      totalMinutes: aggregates.reduce((sum, a) => sum + a.totalMinutes, 0),
      streak,
      pendingReviews: dueCount,
      flashcardCount: cards,
      learnedCards: learned,
      accuracy: reviewed ? Math.round((correct / reviewed) * 100) : 0,
      completedTopics: topicNodes.filter((node) => node.completedAt).length,
      totalTopics: topicNodes.length,
      recentDays,
    };
  }

  async getSettings(profileId: string): Promise<AcademySettings> {
    const id = `settings:${profileId}`;
    return (
      (await (await this.db).get('settings', id)) ?? {
        id,
        profileId,
        dailyGoalMinutes: 120,
        weeklyGoalMinutes: 720,
        monthlyGoalMinutes: 3000,
        reviewStepsDays: [1, 3, 7, 15, 30, 60, 120],
        updatedAt: Date.now(),
      }
    );
  }

  async putSettings(settings: AcademySettings): Promise<void> {
    await (await this.db).put('settings', settings);
  }

  async export(profileId: string, domains: string[] = []): Promise<AcademyBackup> {
    const db = await this.db;
    const include = (domain: string): boolean =>
      !domains.length || domains.includes(domain);
    const filter = <T extends { profileId: string }>(records: T[]): T[] =>
      records.filter((record) => record.profileId === profileId);
    return {
      format: 'academy-arcana',
      version: 1,
      exportedAt: Date.now(),
      domains: {
        studies: include('studies')
          ? {
              areas: filter(await db.getAll('areas')),
              nodes: filter(await db.getAll('nodes')),
              materials: filter(await db.getAll('materials')),
            }
          : undefined,
        sessions: include('sessions')
          ? filter(await db.getAll('sessions'))
          : undefined,
        flashcards: include('flashcards')
          ? filter(await db.getAll('flashcards'))
          : undefined,
        reviews: include('reviews') ? filter(await db.getAll('reviews')) : undefined,
        analytics: include('analytics')
          ? filter(await db.getAll('aggregates'))
          : undefined,
        settings: include('settings')
          ? filter(await db.getAll('settings'))
          : undefined,
      },
    };
  }

  async import(backup: AcademyBackup): Promise<void> {
    if (backup.format !== 'academy-arcana' || backup.version !== 1) {
      throw new Error('Backup da Academia Arcana incompatível.');
    }
    const db = await this.db;
    const writes: Promise<unknown>[] = [];
    const studies = backup.domains.studies;
    if (studies) {
      writes.push(...studies.areas.map((item) => db.put('areas', item)));
      writes.push(...studies.nodes.map((item) => db.put('nodes', item)));
      writes.push(...studies.materials.map((item) => db.put('materials', item)));
    }
    writes.push(
      ...(backup.domains.sessions ?? []).map((item) => db.put('sessions', item)),
      ...(backup.domains.flashcards ?? []).map((item) =>
        db.put('flashcards', item),
      ),
      ...(backup.domains.reviews ?? []).map((item) => db.put('reviews', item)),
      ...(backup.domains.analytics ?? []).map((item) =>
        db.put('aggregates', item),
      ),
      ...(backup.domains.settings ?? []).map((item) => db.put('settings', item)),
    );
    await Promise.all(writes);
  }
}
