import { computed, inject, Injectable, signal } from '@angular/core';
import {
  ArcaneBook,
  BookFormat,
  BookStatus,
  LibraryGroup,
  LibrarySettings,
  ReadingChallenge,
  ReadingDailyAggregate,
  ReadingLog,
} from '../domain/arcane-library.models';
import { ArcaneLibraryRepository } from '../persistence/arcane-library.repository';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';

const COLORS = ['#6857d9', '#b54b62', '#338eaa', '#c49335', '#5e9b61', '#9b52b3'];
const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

@Injectable()
export class ArcaneLibraryService {
  private readonly repository = inject(ArcaneLibraryRepository);
  private readonly rpg = inject(RpgProfileService);
  readonly profileId = signal('');
  readonly books = signal<ArcaneBook[]>([]);
  readonly groups = signal<LibraryGroup[]>([]);
  readonly aggregates = signal<ReadingDailyAggregate[]>([]);
  readonly challenges = signal<ReadingChallenge[]>([]);
  readonly settings = signal<LibrarySettings>({
    id: '', profileId: '', view: 'gallery',
    filters: { year: '', status: '', genre: '', format: '', favorite: false },
    annualGoal: 40,
  });
  readonly totalMinutes = computed(() => this.aggregates().reduce((sum, day) => sum + day.minutes, 0));
  readonly totalPages = computed(() => this.aggregates().reduce((sum, day) => sum + day.pages, 0));
  readonly finished = computed(() => this.books().filter((book) => book.status === 'finished'));
  readonly reading = computed(() => this.books().filter((book) => book.status === 'reading'));
  readonly wishlist = computed(() => this.books().filter((book) => ['wishlist', 'planned'].includes(book.status)));

  async load(profileId: string): Promise<void> {
    this.profileId.set(profileId);
    const data = await this.repository.load(profileId);
    this.books.set(data.books);
    this.groups.set(data.groups);
    this.aggregates.set(data.aggregates);
    this.challenges.set(data.challenges);
    this.settings.set(data.settings ?? {
      id: profileId, profileId, view: 'gallery',
      filters: { year: '', status: '', genre: '', format: '', favorite: false },
      annualGoal: 40,
    });
  }

  async createBook(input: Partial<ArcaneBook> & Pick<ArcaneBook, 'title'>): Promise<ArcaneBook> {
    const now = Date.now();
    const today = dateKey();
    const status = input.status ?? 'wishlist';
    const book: ArcaneBook = {
      id: crypto.randomUUID(), profileId: this.profileId(), collectionId: null, shelfId: null,
      title: input.title.trim(), subtitle: input.subtitle ?? '', author: input.author ?? '',
      series: '', volume: null, language: 'Português', genre: input.genre ?? 'Não definido',
      subgenres: [], nationality: '', publisher: '', isbn: '', format: input.format ?? 'physical',
      pages: input.pages ?? 0, currentPage: 0, publicationYear: null, purchaseDate: null,
      price: null,
      startedAt: status === 'reading' || status === 'finished' ? today : null,
      finishedAt: status === 'finished' ? today : null,
      status,
      rating: null, favorite: false, reread: false, tags: [], notes: '',
      coverDataUrl: input.coverDataUrl ?? null, color: COLORS[this.books().length % COLORS.length],
      plannedMonth: input.plannedMonth ?? null, priority: 3, difficultyMultiplier: 1,
      createdAt: now, updatedAt: now,
    };
    await this.repository.putBook(book);
    this.books.update((rows) => [...rows, book]);
    return book;
  }

  async updateBook(book: ArcaneBook): Promise<void> {
    const today = dateKey();
    const updated = {
      ...book,
      startedAt: book.status === 'reading' || book.status === 'finished'
        ? book.startedAt ?? today
        : book.status === 'abandoned' ? book.startedAt : null,
      finishedAt: book.status === 'finished' ? book.finishedAt ?? today : null,
      updatedAt: Date.now(),
    };
    await this.repository.putBook(updated);
    this.books.update((rows) => rows.map((row) => row.id === updated.id ? updated : row));
  }

  async removeBook(id: string): Promise<void> {
    await this.repository.deleteBook(id);
    this.books.update((rows) => rows.filter((row) => row.id !== id));
  }

  async addGroup(kind: 'collection' | 'shelf', title: string, parentId: string | null): Promise<void> {
    if (!title.trim()) return;
    const group: LibraryGroup = {
      id: crypto.randomUUID(), profileId: this.profileId(), parentId, kind,
      title: title.trim(), color: COLORS[this.groups().length % COLORS.length], createdAt: Date.now(),
    };
    await this.repository.putGroup(group);
    this.groups.update((rows) => [...rows, group]);
  }

  async addLog(book: ArcaneBook, minutes: number, startPage: number, endPage: number, notes: string): Promise<void> {
    const pages = Math.max(0, endPage - startPage);
    const xp = pages > 0 ? Math.max(1, Math.ceil(pages / 5)) : 0;
    const log: ReadingLog = {
      id: crypto.randomUUID(), profileId: this.profileId(), bookId: book.id,
      date: dateKey(), startedAt: Date.now(), minutes: Math.max(1, minutes),
      startPage, endPage, mood: null, energy: null, location: '', notes,
      quotes: [], favoritePassages: [], music: '', xpEarned: xp, goldEarned: Math.floor(pages / 50),
    };
    const aggregate = await this.repository.addLog(log);
    this.rpg.grantExternalReward(
      log.id,
      log.xpEarned,
      log.goldEarned,
      'arcane-library',
      this.profileId(),
    );
    this.aggregates.update((rows) => [...rows.filter((row) => row.id !== aggregate.id), aggregate]);
    await this.updateBook({
      ...book, currentPage: Math.max(book.currentPage, endPage),
      status: endPage >= book.pages && book.pages > 0 ? 'finished' : 'reading',
      startedAt: book.startedAt ?? log.date,
      finishedAt: endPage >= book.pages && book.pages > 0 ? log.date : null,
    });
  }

  async saveSettings(settings: LibrarySettings): Promise<void> {
    this.settings.set(settings);
    await this.repository.putSettings(settings);
  }

  async addChallenge(title: string, metric: ReadingChallenge['metric'], target: number): Promise<void> {
    if (!title.trim() || target < 1) return;
    const challenge: ReadingChallenge = {
      id: crypto.randomUUID(), profileId: this.profileId(), title: title.trim(),
      metric, target, progress: 0, xpReward: target * 2, goldReward: Math.ceil(target / 2), completedAt: null,
    };
    await this.repository.putChallenge(challenge);
    this.challenges.update((rows) => [...rows, challenge]);
  }
}
