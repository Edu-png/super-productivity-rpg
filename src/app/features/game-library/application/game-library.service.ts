import { computed, inject, Injectable, signal } from '@angular/core';
import {
  LibraryGame,
  GameLibraryGroup,
  GameLibrarySettings,
  GameChallenge,
  GameDailyAggregate,
  PlaySession,
} from '../domain/game-library.models';
import { GameLibraryRepository } from '../persistence/game-library.repository';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';

const COLORS = ['#6857d9', '#b54b62', '#338eaa', '#c49335', '#5e9b61', '#9b52b3'];
const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

@Injectable()
export class GameLibraryService {
  private readonly repository = inject(GameLibraryRepository);
  private readonly rpg = inject(RpgProfileService);
  readonly profileId = signal('');
  readonly games = signal<LibraryGame[]>([]);
  readonly groups = signal<GameLibraryGroup[]>([]);
  readonly aggregates = signal<GameDailyAggregate[]>([]);
  readonly challenges = signal<GameChallenge[]>([]);
  readonly settings = signal<GameLibrarySettings>({
    id: '',
    profileId: '',
    view: 'gallery',
    filters: { year: '', status: '', genre: '', platform: '', favorite: false },
    annualGoal: 12,
  });
  readonly totalMinutes = computed(() =>
    this.aggregates().reduce((sum, day) => sum + day.minutes, 0),
  );
  readonly finished = computed(() =>
    this.games().filter((game) => game.status === 'finished'),
  );
  readonly playing = computed(() =>
    this.games().filter((game) => game.status === 'playing'),
  );
  readonly wishlist = computed(() =>
    this.games().filter((game) => ['wishlist', 'planned'].includes(game.status)),
  );
  readonly gameMinutesTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const day of this.aggregates()) {
      for (const [gameId, minutes] of Object.entries(day.gameMinutes)) {
        totals.set(gameId, (totals.get(gameId) ?? 0) + minutes);
      }
    }
    return totals;
  });

  async load(profileId: string): Promise<void> {
    this.profileId.set(profileId);
    const data = await this.repository.load(profileId);
    this.games.set(data.games);
    this.groups.set(data.groups);
    this.aggregates.set(data.aggregates);
    this.challenges.set(data.challenges);
    this.settings.set(
      data.settings ?? {
        id: profileId,
        profileId,
        view: 'gallery',
        filters: { year: '', status: '', genre: '', platform: '', favorite: false },
        annualGoal: 12,
      },
    );
  }

  async createGame(
    input: Partial<LibraryGame> & Pick<LibraryGame, 'title'>,
  ): Promise<LibraryGame> {
    const now = Date.now();
    const today = dateKey();
    const status = input.status ?? 'wishlist';
    const game: LibraryGame = {
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      collectionId: input.collectionId ?? null,
      shelfId: null,
      title: input.title.trim(),
      subtitle: input.subtitle ?? '',
      developer: input.developer ?? '',
      series: '',
      volume: null,
      language: 'Português',
      genre: input.genre ?? 'Não definido',
      subgenres: [],
      publisher: '',
      platforms: input.platforms ?? ['pc'],
      releaseYear: null,
      purchaseDate: null,
      price: null,
      startedAt: status === 'playing' || status === 'finished' ? today : null,
      finishedAt: status === 'finished' ? today : null,
      status,
      rating: null,
      favorite: false,
      tags: [],
      notes: '',
      coverDataUrl: input.coverDataUrl ?? null,
      color: COLORS[this.games().length % COLORS.length],
      plannedMonth: input.plannedMonth ?? null,
      priority: 3,
      difficultyMultiplier: 1,
      completionPercent: input.completionPercent ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.putGame(game);
    this.games.update((rows) => [...rows, game]);
    return game;
  }

  async updateGame(game: LibraryGame): Promise<void> {
    const today = dateKey();
    const updated = {
      ...game,
      startedAt:
        game.status === 'playing' || game.status === 'finished'
          ? (game.startedAt ?? today)
          : game.status === 'abandoned'
            ? game.startedAt
            : null,
      finishedAt: game.status === 'finished' ? (game.finishedAt ?? today) : null,
      updatedAt: Date.now(),
    };
    await this.repository.putGame(updated);
    this.games.update((rows) =>
      rows.map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  async removeGame(id: string): Promise<void> {
    await this.repository.deleteGame(id);
    this.games.update((rows) => rows.filter((row) => row.id !== id));
  }

  async addGroup(
    kind: 'collection' | 'shelf',
    title: string,
    parentId: string | null,
    coverDataUrl: string | null = null,
  ): Promise<void> {
    if (!title.trim()) return;
    const group: GameLibraryGroup = {
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      parentId,
      kind,
      title: title.trim(),
      color: COLORS[this.groups().length % COLORS.length],
      coverDataUrl,
      createdAt: Date.now(),
    };
    await this.repository.putGroup(group);
    this.groups.update((rows) => [...rows, group]);
  }

  async setGroupCover(id: string, coverDataUrl: string | null): Promise<void> {
    const group = this.groups().find((row) => row.id === id);
    if (!group) return;
    const updated = { ...group, coverDataUrl };
    await this.repository.putGroup(updated);
    this.groups.update((rows) => rows.map((row) => (row.id === id ? updated : row)));
  }

  async removeGroup(id: string): Promise<void> {
    const children = this.groups().filter((group) => group.parentId === id);
    for (const child of children) await this.repository.deleteGroup(child.id);
    for (const game of this.games()) {
      if (game.collectionId === id || game.shelfId === id) {
        await this.updateGame({
          ...game,
          collectionId: game.collectionId === id ? null : game.collectionId,
          shelfId: game.shelfId === id || game.collectionId === id ? null : game.shelfId,
        });
      }
    }
    await this.repository.deleteGroup(id);
    this.groups.update((rows) =>
      rows.filter((row) => row.id !== id && row.parentId !== id),
    );
  }

  async addSession(
    game: LibraryGame,
    minutes: number,
    notes: string,
    completionPercent?: number,
    loggedAtOverride?: number,
  ): Promise<void> {
    const safeMinutes = Math.max(1, minutes);
    const xp = Math.max(1, Math.ceil(safeMinutes / 10));
    const gold = Math.floor(safeMinutes / 120);
    const loggedAt = loggedAtOverride ?? Date.now();
    const session: PlaySession = {
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      gameId: game.id,
      date: dateKey(new Date(loggedAt)),
      startedAt: loggedAt,
      minutes: safeMinutes,
      notes,
      xpEarned: xp,
      goldEarned: gold,
    };
    const aggregate = await this.repository.addSession(session);
    this.rpg.grantExternalReward(
      session.id,
      session.xpEarned,
      session.goldEarned,
      'game-library',
      this.profileId(),
    );
    this.aggregates.update((rows) => [
      ...rows.filter((row) => row.id !== aggregate.id),
      aggregate,
    ]);
    const percent = Math.min(
      100,
      Math.max(0, completionPercent ?? game.completionPercent),
    );
    const finished = percent >= 100;
    await this.updateGame({
      ...game,
      completionPercent: percent,
      status: finished
        ? 'finished'
        : game.status === 'wishlist' || game.status === 'planned'
          ? 'playing'
          : game.status,
      startedAt: game.startedAt ?? session.date,
      finishedAt: finished ? session.date : null,
    });
  }

  async saveSettings(settings: GameLibrarySettings): Promise<void> {
    this.settings.set(settings);
    await this.repository.putSettings(settings);
  }

  async addChallenge(
    title: string,
    metric: GameChallenge['metric'],
    target: number,
  ): Promise<void> {
    if (!title.trim() || target < 1) return;
    const challenge: GameChallenge = {
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      title: title.trim(),
      metric,
      target,
      progress: 0,
      xpReward: target * 2,
      goldReward: Math.ceil(target / 2),
      completedAt: null,
    };
    await this.repository.putChallenge(challenge);
    this.challenges.update((rows) => [...rows, challenge]);
  }

  async removeChallenge(id: string): Promise<void> {
    await this.repository.deleteChallenge(id);
    this.challenges.update((rows) => rows.filter((row) => row.id !== id));
  }
}
