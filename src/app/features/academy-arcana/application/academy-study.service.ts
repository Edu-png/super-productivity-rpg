import { computed, inject, Injectable, signal } from '@angular/core';
import { CloudDomainSyncService } from '../../../core/persistence/cloud-domain-sync.service';
import {
  AcademyDashboardSnapshot,
  AcademySettings,
  Flashcard,
  FlashcardReview,
  StudyArea,
  StudyNode,
  StudyNodeKind,
  StudySession,
  SyncMetadata,
} from '../domain/academy.models';
import { AcademyRepository } from '../domain/academy.repository';

const EMPTY_DASHBOARD: AcademyDashboardSnapshot = {
  todayMinutes: 0,
  weekMinutes: 0,
  monthMinutes: 0,
  totalMinutes: 0,
  streak: 0,
  pendingReviews: 0,
  flashcardCount: 0,
  learnedCards: 0,
  accuracy: 0,
  completedTopics: 0,
  totalTopics: 0,
  recentDays: [],
};

@Injectable()
export class AcademyStudyService {
  private readonly cloud = inject(CloudDomainSyncService);
  private cloudSaveTimer?: ReturnType<typeof setTimeout>;
  private readonly profileId = signal('');
  readonly areas = signal<StudyArea[]>([]);
  readonly nodes = signal<StudyNode[]>([]);
  readonly dashboard = signal<AcademyDashboardSnapshot>(EMPTY_DASHBOARD);
  readonly settings = signal<AcademySettings | null>(null);
  readonly dueCards = signal<Flashcard[]>([]);
  readonly recentSessions = signal<StudySession[]>([]);
  readonly loading = signal(false);
  readonly activeSession = computed(
    () => this.recentSessions().find((session) => session.status === 'active') ?? null,
  );

  constructor(private readonly repository: AcademyRepository) {}

  async load(profileId: string): Promise<void> {
    this.loading.set(true);
    this.profileId.set(profileId);
    const localBackup = await this.repository.export(profileId);
    const remote = await this.cloud.load<import('../domain/academy.models').AcademyBackup>(
      'academy',
      profileId,
    );
    const localUpdatedAt = this.latestTimestamp(localBackup.domains);
    if (remote && remote.updatedAt > localUpdatedAt) {
      await this.repository.import(remote.value);
    } else if (localUpdatedAt > 0) {
      this.queueCloudSave();
    }
    const [areas, nodes, dashboard, settings, dueCards, sessions] =
      await Promise.all([
        this.repository.listAreas(profileId),
        this.repository.listNodes(profileId),
        this.repository.dashboard(profileId, new Date()),
        this.repository.getSettings(profileId),
        this.repository.getDueFlashcards(profileId, Date.now(), 50),
        this.repository.listSessions(profileId, 0, Date.now(), 0, 30),
      ]);
    this.areas.set(areas.filter((item) => !item.deletedAt));
    this.nodes.set(nodes.filter((item) => !item.deletedAt));
    this.dashboard.set(dashboard);
    this.settings.set(settings);
    this.dueCards.set(dueCards.filter((card) => !card.suspended && !card.deletedAt));
    this.recentSessions.set(sessions);
    this.loading.set(false);
  }

  async addArea(title: string, color: string): Promise<void> {
    const profileId = this.profileId();
    if (!profileId || !title.trim()) return;
    const area: StudyArea = {
      ...this.metadata(),
      id: crypto.randomUUID(),
      profileId,
      title: title.trim(),
      description: '',
      color,
      icon: 'auto_stories',
      coverUrl: null,
      position: this.areas().length,
    };
    await this.repository.putArea(area);
    this.areas.update((areas) => [...areas, area]);
    this.queueCloudSave();
  }

  async addNode(
    areaId: string,
    parentId: string | null,
    kind: StudyNodeKind,
    title: string,
  ): Promise<void> {
    if (!title.trim()) return;
    const node: StudyNode = {
      ...this.metadata(),
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      areaId,
      parentId,
      kind,
      title: title.trim(),
      description: '',
      notesMarkdown: '',
      links: [],
      drawing: null,
      color: this.areas().find((area) => area.id === areaId)?.color ?? '#7456c8',
      icon: this.nodeIcon(kind),
      coverUrl: null,
      position: this.nodes().filter((item) => item.parentId === parentId).length,
      difficulty: 3,
      weight: 1,
      completedAt: null,
    };
    await this.repository.putNode(node);
    this.nodes.update((nodes) => [...nodes, node]);
    this.queueCloudSave();
  }

  async updateNodeDetails(
    nodeId: string,
    details: {
      title: string;
      description: string;
      notesMarkdown: string;
      links: Array<{ label: string; url: string }>;
      drawing: StudyNode['drawing'];
    },
  ): Promise<void> {
    const current = this.nodes().find((node) => node.id === nodeId);
    if (!current || !details.title.trim()) return;
    const updated: StudyNode = {
      ...current,
      title: details.title.trim(),
      description: details.description.trim(),
      notesMarkdown: details.notesMarkdown,
      links: details.links.filter((link) => link.url.trim()),
      drawing: details.drawing,
      updatedAt: Date.now(),
      revision: current.revision + 1,
    };
    await this.repository.putNode(updated);
    this.nodes.update((nodes) =>
      nodes.map((node) => (node.id === nodeId ? updated : node)),
    );
    this.queueCloudSave();
  }

  async startSession(
    areaId: string,
    nodeId: string | null,
    title: string,
    plannedMinutes: number,
    characterId: string,
  ): Promise<void> {
    const session: StudySession = {
      ...this.metadata(),
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      characterId,
      projectId: null,
      areaId,
      nodeId,
      materialId: null,
      title: title.trim() || 'Sessão de estudos',
      scheduledStart: null,
      startedAt: Date.now(),
      endedAt: null,
      plannedMinutes: Math.max(1, Math.round(plannedMinutes)),
      actualMinutes: 0,
      priority: 3,
      status: 'active',
      notes: '',
      mood: null,
      energy: null,
      xpEarned: 0,
      goldEarned: 0,
      flashcardsReviewed: 0,
    };
    await this.repository.putSession(session);
    this.recentSessions.update((sessions) => [session, ...sessions]);
    this.queueCloudSave();
  }

  async finishActiveSession(notes = ''): Promise<StudySession | null> {
    const active = this.activeSession();
    if (!active) return null;
    const endedAt = Date.now();
    const actualMinutes = Math.max(
      1,
      Math.round((endedAt - active.startedAt) / 60_000),
    );
    const completed: StudySession = {
      ...active,
      endedAt,
      actualMinutes,
      status: 'completed',
      notes,
      xpEarned: Math.max(1, Math.round(actualMinutes * 0.35)),
      goldEarned: Math.floor(actualMinutes / 45),
      updatedAt: endedAt,
      revision: active.revision + 1,
    };
    await this.repository.putSession(completed);
    await this.load(this.profileId());
    this.queueCloudSave();
    return completed;
  }

  async addFlashcard(
    areaId: string,
    nodeId: string | null,
    question: string,
    answer: string,
  ): Promise<void> {
    if (!question.trim() || !answer.trim()) return;
    const card: Flashcard = {
      ...this.metadata(),
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      areaId,
      nodeId,
      deckId: areaId,
      parentDeckId: null,
      question: question.trim(),
      answer: answer.trim(),
      tags: [],
      media: {},
      source: '',
      favorite: false,
      suspended: false,
      difficulty: 5,
      stability: 0,
      dueAt: Date.now(),
      lastReviewedAt: null,
      reviewCount: 0,
      lapseCount: 0,
    };
    await this.repository.putFlashcard(card);
    this.dueCards.update((cards) => [...cards, card]);
    await this.refreshDashboard();
    this.queueCloudSave();
  }

  async reviewCard(card: Flashcard, rating: 1 | 2 | 3 | 4): Promise<void> {
    const intervals = this.settings()?.reviewStepsDays ?? [1, 3, 7, 15, 30, 60, 120];
    const previousDays = Math.max(
      0,
      Math.round((card.dueAt - (card.lastReviewedAt ?? card.createdAt)) / 86_400_000),
    );
    const base = intervals[Math.min(card.reviewCount, intervals.length - 1)];
    const ratingMultiplier = [0, 0.2, 0.75, 1, 1.35][rating];
    const nextDays = rating === 1 ? 1 : Math.max(1, Math.round(base * ratingMultiplier));
    const now = Date.now();
    const updated: Flashcard = {
      ...card,
      difficulty: Math.max(1, Math.min(10, card.difficulty + (3 - rating) * 0.35)),
      stability: Math.max(1, card.stability * 1.35 + nextDays),
      dueAt: now + nextDays * 86_400_000,
      lastReviewedAt: now,
      reviewCount: card.reviewCount + 1,
      lapseCount: card.lapseCount + (rating === 1 ? 1 : 0),
      updatedAt: now,
      revision: card.revision + 1,
    };
    const review: FlashcardReview = {
      ...this.metadata(),
      id: crypto.randomUUID(),
      profileId: card.profileId,
      cardId: card.id,
      sessionId: this.activeSession()?.id ?? null,
      reviewedAt: now,
      rating,
      elapsedMs: 0,
      previousIntervalDays: previousDays,
      nextIntervalDays: nextDays,
      retention: rating >= 3 ? 1 : rating === 2 ? 0.6 : 0,
    };
    await Promise.all([
      this.repository.putFlashcard(updated),
      this.repository.putReview(review),
    ]);
    this.dueCards.update((cards) => cards.filter((item) => item.id !== card.id));
    await this.refreshDashboard();
    this.queueCloudSave();
  }

  async updateSettings(
    dailyGoalMinutes: number,
    weeklyGoalMinutes: number,
    monthlyGoalMinutes: number,
  ): Promise<void> {
    const current = await this.repository.getSettings(this.profileId());
    const settings = {
      ...current,
      dailyGoalMinutes: Math.max(1, Math.round(dailyGoalMinutes)),
      weeklyGoalMinutes: Math.max(1, Math.round(weeklyGoalMinutes)),
      monthlyGoalMinutes: Math.max(1, Math.round(monthlyGoalMinutes)),
      updatedAt: Date.now(),
    };
    await this.repository.putSettings(settings);
    this.settings.set(settings);
    this.queueCloudSave();
  }

  private queueCloudSave(): void {
    clearTimeout(this.cloudSaveTimer);
    this.cloudSaveTimer = setTimeout(async () => {
      const profileId = this.profileId();
      if (!profileId) return;
      await this.cloud.save('academy', profileId, await this.repository.export(profileId));
    }, 800);
  }

  private latestTimestamp(value: unknown): number {
    if (Array.isArray(value)) {
      return value.reduce(
        (latest, item) => Math.max(latest, this.latestTimestamp(item)),
        0,
      );
    }
    if (!value || typeof value !== 'object') return 0;
    const record = value as Record<string, unknown>;
    return Object.entries(record).reduce((latest, [key, item]) => {
      const timestamp =
        (key === 'updatedAt' || key === 'createdAt') && typeof item === 'number'
          ? item
          : this.latestTimestamp(item);
      return Math.max(latest, timestamp);
    }, 0);
  }

  private async refreshDashboard(): Promise<void> {
    this.dashboard.set(await this.repository.dashboard(this.profileId(), new Date()));
  }

  private metadata(): SyncMetadata {
    const now = Date.now();
    return {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deviceId: 'local-device',
      deletedAt: null,
    };
  }

  private nodeIcon(kind: StudyNodeKind): string {
    return {
      folder: 'folder',
      course: 'school',
      module: 'view_module',
      topic: 'topic',
      subtopic: 'subdirectory_arrow_right',
    }[kind];
  }
}
