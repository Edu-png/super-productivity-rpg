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
  StudyDistraction,
  StudySession,
  SyncMetadata,
  TopicReviewLog,
  TopicReviewState,
} from '../domain/academy.models';
import { AcademyRepository } from '../domain/academy.repository';
import { importCronogramaSchedule } from './cronograma-import';
import { scheduleNextReview } from './spaced-repetition';
import { DEFAULT_DISTRACTION_CATEGORIES } from './distraction-stats';
import { PERSONAL_STUDY_DATA } from './personal-study-data';

const DAY_MS = 86_400_000;

const CRONOGRAMA_IMPORT_KEY = 'academy-cronograma-import-2026-08-03-v1';
const CRONOGRAMA_OWNER_PROFILE_ID = PERSONAL_STUDY_DATA.ownerProfileId;

const EMPTY_DASHBOARD: AcademyDashboardSnapshot = {
  todayMinutes: 0,
  weekMinutes: 0,
  monthMinutes: 0,
  totalMinutes: 0,
  streak: 0,
  pendingReviews: 0,
  pendingTopicReviews: 0,
  flashcardCount: 0,
  learnedCards: 0,
  accuracy: 0,
  completedTopics: 0,
  totalTopics: 0,
  recentDays: [],
};
const ACADEMY_RESET_KEY = 'academy-data-reset-2026-07-30-v2';

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
  /** Last 60 days of sessions, for the distraction charts (recentSessions stops at 30). */
  readonly distractionSessions = signal<StudySession[]>([]);
  readonly topicReviews = signal<TopicReviewState[]>([]);
  readonly recentTopicReviewLogs = signal<TopicReviewLog[]>([]);
  readonly loading = signal(false);
  readonly activeSession = computed(
    () => this.recentSessions().find((session) => session.status === 'active') ?? null,
  );
  readonly distractionCategories = computed(
    () => this.settings()?.distractionCategories ?? DEFAULT_DISTRACTION_CATEGORIES,
  );
  readonly dueTopicReviews = computed(() =>
    this.topicReviews()
      .filter((state) => state.dueAt <= Date.now())
      .sort((a, b) => a.dueAt - b.dueAt),
  );

  constructor(private readonly repository: AcademyRepository) {}

  async load(profileId: string): Promise<void> {
    this.loading.set(true);
    this.profileId.set(profileId);
    if (!localStorage.getItem(ACADEMY_RESET_KEY)) {
      const affectedProfiles = new Set(await this.repository.clearAll());
      affectedProfiles.add(profileId);
      for (const affectedProfileId of affectedProfiles) {
        await this.cloud.save(
          'academy',
          affectedProfileId,
          await this.repository.export(affectedProfileId),
        );
      }
      localStorage.setItem(ACADEMY_RESET_KEY, String(Date.now()));
    }
    if (
      profileId === CRONOGRAMA_OWNER_PROFILE_ID &&
      !localStorage.getItem(CRONOGRAMA_IMPORT_KEY)
    ) {
      await importCronogramaSchedule(this.repository, profileId);
      localStorage.setItem(CRONOGRAMA_IMPORT_KEY, String(Date.now()));
    }
    const localBackup = await this.repository.export(profileId);
    const remote = await this.cloud.load<
      import('../domain/academy.models').AcademyBackup
    >('academy', profileId);
    const localUpdatedAt = this.latestTimestamp(localBackup.domains);
    if (remote && remote.updatedAt > localUpdatedAt) {
      await this.repository.import(remote.value);
    } else if (localUpdatedAt > 0) {
      this.queueCloudSave();
    }
    const [
      areas,
      nodes,
      dashboard,
      settings,
      dueCards,
      sessions,
      topicReviews,
      topicReviewLogs,
    ] = await Promise.all([
      this.repository.listAreas(profileId),
      this.repository.listNodes(profileId),
      this.repository.dashboard(profileId, new Date()),
      this.repository.getSettings(profileId),
      this.repository.getDueFlashcards(profileId, Date.now(), 50),
      this.repository.listSessions(profileId, 0, Date.now(), 0, 30),
      this.repository.listTopicReviews(profileId),
      this.repository.listTopicReviewLogs(profileId, 30),
    ]);
    this.areas.set(areas.filter((item) => !item.deletedAt));
    this.nodes.set(nodes.filter((item) => !item.deletedAt));
    this.dashboard.set(dashboard);
    this.settings.set(settings);
    this.dueCards.set(dueCards.filter((card) => !card.suspended && !card.deletedAt));
    this.recentSessions.set(sessions);
    const now = Date.now();
    const sixtyDaysMs = 60 * 86_400_000;
    const sixtyDaysAgo = now - sixtyDaysMs;
    this.distractionSessions.set(
      await this.repository.listSessions(profileId, sixtyDaysAgo, now, 0, 2000),
    );
    this.topicReviews.set(topicReviews);
    this.recentTopicReviewLogs.set(topicReviewLogs);
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

  async deleteArea(areaId: string): Promise<void> {
    const area = this.areas().find((item) => item.id === areaId);
    if (!area) return;
    const now = Date.now();
    await this.repository.putArea({
      ...area,
      deletedAt: now,
      updatedAt: now,
      revision: area.revision + 1,
    });
    const nodesToRemove = this.nodes().filter((node) => node.areaId === areaId);
    await Promise.all(
      nodesToRemove.map((node) =>
        this.repository.putNode({
          ...node,
          deletedAt: now,
          updatedAt: now,
          revision: node.revision + 1,
        }),
      ),
    );
    this.areas.update((areas) => areas.filter((item) => item.id !== areaId));
    this.nodes.update((nodes) => nodes.filter((node) => node.areaId !== areaId));
    this.queueCloudSave();
  }

  async deleteNode(nodeId: string): Promise<void> {
    const idsToRemove = this.nodeSubtreeIds(nodeId);
    const now = Date.now();
    const nodesToRemove = this.nodes().filter((node) => idsToRemove.has(node.id));
    await Promise.all(
      nodesToRemove.map((node) =>
        this.repository.putNode({
          ...node,
          deletedAt: now,
          updatedAt: now,
          revision: node.revision + 1,
        }),
      ),
    );
    this.nodes.update((nodes) => nodes.filter((node) => !idsToRemove.has(node.id)));
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
      distractions: [],
    };
    await this.repository.putSession(session);
    this.recentSessions.update((sessions) => [session, ...sessions]);
    this.distractionSessions.update((sessions) => [session, ...sessions]);
    this.queueCloudSave();
  }

  /**
   * Registers a study session that already happened, without running the live
   * countdown - mirrors the Arcane Library's "log a reading session" flow.
   * Same XP/gold formula as finishActiveSession, applied to the minutes given
   * directly instead of derived from startedAt/endedAt elapsed time.
   */
  async logSession(
    areaId: string,
    nodeId: string | null,
    title: string,
    minutes: number,
    characterId: string,
    notes = '',
    endedAtOverride?: number,
    distractions: { category: string; note: string }[] = [],
  ): Promise<StudySession | null> {
    if (!areaId) return null;
    const actualMinutes = Math.max(1, Math.round(minutes));
    const endedAt = endedAtOverride ?? Date.now();
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
      startedAt: endedAt - actualMinutes * 60_000,
      endedAt,
      plannedMinutes: actualMinutes,
      actualMinutes,
      priority: 3,
      status: 'completed',
      notes,
      mood: null,
      energy: null,
      xpEarned: Math.max(1, Math.round(actualMinutes * 0.35)),
      goldEarned: Math.floor(actualMinutes / 45),
      flashcardsReviewed: 0,
      distractions: [],
    };
    // A past block's exact distraction times aren't known - stamp them at its start.
    session.distractions = distractions.map((item) => ({
      id: crypto.randomUUID(),
      at: session.startedAt,
      category: item.category,
      note: item.note.trim(),
    }));
    await this.repository.putSession(session);
    await this.load(this.profileId());
    this.queueCloudSave();
    return session;
  }

  async deleteSession(id: string): Promise<StudySession | null> {
    const session = this.recentSessions().find((item) => item.id === id) ?? null;
    if (!session) return null;
    await this.repository.deleteSession(id);
    this.recentSessions.update((sessions) => sessions.filter((item) => item.id !== id));
    this.distractionSessions.update((sessions) =>
      sessions.filter((item) => item.id !== id),
    );
    await this.refreshDashboard();
    this.queueCloudSave();
    return session;
  }

  /**
   * Edits a logged session's title/date/duration. Recomputes xpEarned/
   * goldEarned from the new duration UNLESS the session already carried zero
   * reward (the bulk-imported historical entries are deliberately
   * reward-free - see importOwnerStudyHistory - and must stay that way even
   * if their duration is corrected). Returns both the pre- and post-edit
   * session so the caller can reconcile the RPG XP/gold already granted for
   * the old duration.
   */
  async updateSessionDetails(
    id: string,
    changes: { title: string; startedAt: number; actualMinutes: number },
  ): Promise<{ previous: StudySession; updated: StudySession } | null> {
    const previous = this.recentSessions().find((item) => item.id === id);
    if (!previous) return null;
    const actualMinutes = Math.max(1, Math.round(changes.actualMinutes));
    const hadReward = previous.xpEarned > 0 || previous.goldEarned > 0;
    const updated: StudySession = {
      ...previous,
      title: changes.title.trim() || previous.title,
      startedAt: changes.startedAt,
      endedAt: changes.startedAt + actualMinutes * 60_000,
      plannedMinutes: actualMinutes,
      actualMinutes,
      xpEarned: hadReward ? Math.max(1, Math.round(actualMinutes * 0.35)) : 0,
      goldEarned: hadReward ? Math.floor(actualMinutes / 45) : 0,
      updatedAt: Date.now(),
      revision: previous.revision + 1,
    };
    await this.repository.putSession(updated);
    this.recentSessions.update((sessions) =>
      sessions.map((item) => (item.id === id ? updated : item)),
    );
    this.distractionSessions.update((sessions) =>
      sessions.map((item) => (item.id === id ? updated : item)),
    );
    await this.refreshDashboard();
    this.queueCloudSave();
    return { previous, updated };
  }

  async finishActiveSession(notes = ''): Promise<StudySession | null> {
    const active = this.activeSession();
    if (!active) return null;
    const endedAt = Date.now();
    const actualMinutes = Math.max(1, Math.round((endedAt - active.startedAt) / 60_000));
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

  topicReviewFor(nodeId: string): TopicReviewState | null {
    return this.topicReviews().find((state) => state.nodeId === nodeId) ?? null;
  }

  isNodeInReview(nodeId: string): boolean {
    return this.topicReviewFor(nodeId) !== null;
  }

  async addNodeToReview(nodeId: string, areaId: string): Promise<void> {
    if (this.isNodeInReview(nodeId)) return;
    const now = Date.now();
    const state: TopicReviewState = {
      ...this.metadata(),
      id: nodeId,
      profileId: this.profileId(),
      nodeId,
      areaId,
      addedAt: now,
      dueAt: now + DAY_MS,
      stability: 1,
      difficulty: 5,
      lastReviewedAt: null,
      reviewCount: 0,
      lapseCount: 0,
    };
    await this.repository.putTopicReview(state);
    this.topicReviews.update((rows) => [...rows, state]);
    await this.refreshDashboard();
    this.queueCloudSave();
  }

  /**
   * "Pular" - postpones a review without touching stability/difficulty and
   * without logging a review (it isn't one - spec rules out treating a skip
   * as if it had happened, and rules out ever silently dropping an overdue
   * review, so this just moves dueAt forward instead of clearing anything).
   */
  async skipTopicReview(nodeId: string, snoozeDays = 1): Promise<void> {
    const state = this.topicReviewFor(nodeId);
    if (!state) return;
    const now = Date.now();
    const updated: TopicReviewState = {
      ...state,
      dueAt: now + snoozeDays * DAY_MS,
      updatedAt: now,
      revision: state.revision + 1,
    };
    await this.repository.putTopicReview(updated);
    this.topicReviews.update((rows) =>
      rows.map((row) => (row.nodeId === nodeId ? updated : row)),
    );
    await this.refreshDashboard();
    this.queueCloudSave();
  }

  async removeNodeFromReview(nodeId: string): Promise<void> {
    await this.repository.deleteTopicReview(nodeId);
    this.topicReviews.update((rows) => rows.filter((row) => row.nodeId !== nodeId));
    await this.refreshDashboard();
    this.queueCloudSave();
  }

  /**
   * Records a topic review and schedules the next one. See spaced-repetition.ts
   * for the scheduling model - deliberately separate from StudySession/
   * flashcard review so studying a topic again never resets its review clock.
   */
  async reviewTopic(
    nodeId: string,
    rating: 1 | 2 | 3 | 4,
  ): Promise<{ nextIntervalDays: number } | null> {
    const state = this.topicReviewFor(nodeId);
    if (!state) return null;
    const now = Date.now();
    const referenceTime = state.lastReviewedAt ?? state.addedAt;
    const elapsedDays = Math.max(0, (now - referenceTime) / DAY_MS);
    const previousIntervalDays = Math.max(
      0,
      Math.round((state.dueAt - referenceTime) / DAY_MS),
    );
    const result = scheduleNextReview(
      state.stability,
      state.difficulty,
      elapsedDays,
      rating,
    );
    const updated: TopicReviewState = {
      ...state,
      stability: result.stability,
      difficulty: result.difficulty,
      dueAt: now + result.intervalDays * DAY_MS,
      lastReviewedAt: now,
      reviewCount: state.reviewCount + 1,
      lapseCount: state.lapseCount + (rating === 1 ? 1 : 0),
      updatedAt: now,
      revision: state.revision + 1,
    };
    const log: TopicReviewLog = {
      ...this.metadata(),
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      nodeId,
      reviewedAt: now,
      rating,
      previousIntervalDays,
      nextIntervalDays: result.intervalDays,
      stabilityBefore: state.stability,
      stabilityAfter: result.stability,
      difficultyBefore: state.difficulty,
      difficultyAfter: result.difficulty,
    };
    await Promise.all([
      this.repository.putTopicReview(updated),
      this.repository.putTopicReviewLog(log),
    ]);
    this.topicReviews.update((rows) =>
      rows.map((row) => (row.nodeId === nodeId ? updated : row)),
    );
    this.recentTopicReviewLogs.update((rows) => [log, ...rows].slice(0, 30));
    await this.refreshDashboard();
    this.queueCloudSave();
    return { nextIntervalDays: result.intervalDays };
  }

  /** Logs one loss of focus (with its reason) in a study block. */
  async addDistraction(
    sessionId: string,
    category: string,
    note = '',
    at = Date.now(),
  ): Promise<void> {
    if (!category.trim()) return;
    await this.updateSessionDistractions(sessionId, (list) => [
      ...list,
      { id: crypto.randomUUID(), at, category: category.trim(), note: note.trim() },
    ]);
  }

  async updateDistraction(
    sessionId: string,
    distractionId: string,
    changes: { category: string; note: string },
  ): Promise<void> {
    await this.updateSessionDistractions(sessionId, (list) =>
      list.map((item) =>
        item.id === distractionId
          ? { ...item, category: changes.category, note: changes.note.trim() }
          : item,
      ),
    );
  }

  async removeDistraction(sessionId: string, distractionId: string): Promise<void> {
    await this.updateSessionDistractions(sessionId, (list) =>
      list.filter((item) => item.id !== distractionId),
    );
  }

  async setDistractionCategories(categories: string[]): Promise<void> {
    const unique = [...new Set(categories.map((item) => item.trim()).filter(Boolean))];
    if (!unique.length) return;
    const current = await this.repository.getSettings(this.profileId());
    const settings = { ...current, distractionCategories: unique, updatedAt: Date.now() };
    await this.repository.putSettings(settings);
    this.settings.set(settings);
    this.queueCloudSave();
  }

  private async updateSessionDistractions(
    sessionId: string,
    change: (list: StudyDistraction[]) => StudyDistraction[],
  ): Promise<void> {
    const previous =
      this.recentSessions().find((item) => item.id === sessionId) ??
      this.distractionSessions().find((item) => item.id === sessionId);
    if (!previous) return;
    const updated: StudySession = {
      ...previous,
      distractions: change(previous.distractions ?? []),
      updatedAt: Date.now(),
      revision: previous.revision + 1,
    };
    await this.repository.putSession(updated);
    this.recentSessions.update((sessions) =>
      sessions.map((item) => (item.id === sessionId ? updated : item)),
    );
    this.distractionSessions.update((sessions) =>
      sessions.map((item) => (item.id === sessionId ? updated : item)),
    );
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
      await this.cloud.save(
        'academy',
        profileId,
        await this.repository.export(profileId),
      );
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

  /**
   * One-time, idempotent migration of the study totals supplied by the owner.
   * Fixed entity ids make the migration safe across restarts, backups and cloud merges.
   */
  private async importOwnerStudyHistory(profileId: string): Promise<boolean> {
    const ownerId = PERSONAL_STUDY_DATA.ownerProfileId;
    if (!ownerId || profileId !== ownerId) return false;

    const areaId = 'historical-data-science-finance';
    const monthlyMinutes = PERSONAL_STUDY_DATA.monthlyMinutes;
    let changed = false;
    const areas = await this.repository.listAreas(profileId);
    if (!areas.some((area) => area.id === areaId)) {
      const createdAt = new Date(2025, 11, 1, 12).getTime();
      await this.repository.putArea({
        id: areaId,
        profileId,
        title: PERSONAL_STUDY_DATA.historyAreaTitle,
        description: 'Histórico de estudos importado',
        color: '#ff5c7a',
        icon: 'query_stats',
        coverUrl: null,
        position: areas.length,
        createdAt,
        updatedAt: createdAt,
        revision: 1,
        deviceId: 'historical-import',
        deletedAt: null,
      });
      changed = true;
    }

    for (const entry of monthlyMinutes) {
      // The source only contains monthly totals. Splitting them over ten stable
      // dates preserves the exact total while producing a useful daily chart.
      const sessionCount = Math.min(
        10,
        new Date(entry.year, entry.month + 1, 0).getDate(),
      );
      const baseMinutes = Math.floor(entry.minutes / sessionCount);
      let remainder = entry.minutes % sessionCount;
      for (let index = 0; index < sessionCount; index++) {
        const day = 1 + Math.floor((index * 27) / Math.max(1, sessionCount - 1));
        const id = `historical-study-${entry.year}-${String(entry.month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
        if (await this.repository.getSession(id)) continue;
        const actualMinutes = baseMinutes + (remainder-- > 0 ? 1 : 0);
        const endedAt = new Date(entry.year, entry.month, day, 20, 0, 0, 0).getTime();
        const startedAt = endedAt - actualMinutes * 60_000;
        await this.repository.putSession({
          id,
          profileId,
          characterId: profileId,
          projectId: null,
          areaId,
          nodeId: null,
          materialId: null,
          title: `Estudo — ${PERSONAL_STUDY_DATA.historyAreaTitle}`,
          scheduledStart: null,
          startedAt,
          endedAt,
          plannedMinutes: actualMinutes,
          actualMinutes,
          priority: 3,
          status: 'completed',
          notes: 'Histórico mensal importado sem recompensa retroativa.',
          mood: null,
          energy: null,
          xpEarned: 0,
          goldEarned: 0,
          flashcardsReviewed: 0,
          createdAt: endedAt,
          updatedAt: endedAt,
          revision: 1,
          deviceId: 'historical-import',
          deletedAt: null,
        });
        changed = true;
      }
    }
    return changed;
  }

  private nodeSubtreeIds(nodeId: string): Set<string> {
    const result = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length) {
      const current = queue.shift() as string;
      for (const node of this.nodes()) {
        if (node.parentId === current && !result.has(node.id)) {
          result.add(node.id);
          queue.push(node.id);
        }
      }
    }
    return result;
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
