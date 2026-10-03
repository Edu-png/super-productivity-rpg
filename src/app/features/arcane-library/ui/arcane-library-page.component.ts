import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { ArcaneLibraryService } from '../application/arcane-library.service';
import {
  ArcaneBook,
  BookFormat,
  BookStatus,
  LibraryGroup,
  LibraryView,
  ReadingLog,
} from '../domain/arcane-library.models';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';
import { confirmDialog, promptDialog } from '../../../util/native-dialogs';
import {
  readFileAsShrunkDataUrl,
  shrinkImageDataUrl,
} from '../../../util/shrink-image-data-url';
import { IS_ELECTRON } from '../../../app.constants';
import { GeminiService } from '../../../core/ai/gemini.service';
import { AiSuggestion, MediaAiService } from '../../../core/ai/media-ai.service';

@Component({
  selector: 'arcane-library-page',
  standalone: true,
  imports: [FormsModule, MatIcon, CharacterRendererComponent, DecimalPipe],
  templateUrl: './arcane-library-page.component.html',
  styleUrl: './arcane-library-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ArcaneLibraryService],
})
export class ArcaneLibraryPageComponent implements OnInit {
  readonly library = inject(ArcaneLibraryService);
  readonly profile = inject(RpgProfileService);
  readonly gemini = inject(GeminiService);
  private readonly mediaAi = inject(MediaAiService);
  readonly selectedCharacterId = signal(this.profile.activeCharacterId());
  readonly tab = signal<'dashboard' | 'library' | 'calendar' | 'planning' | 'challenges'>(
    'dashboard',
  );
  readonly selectedBook = signal<ArcaneBook | null>(null);
  readonly editingBook = signal<ArcaneBook | null>(null);
  readonly calendarPickerDate = signal<string | null>(null);
  /** Logs of the calendar day being viewed, each with an editable copy. */
  readonly dayLogs = signal<{ original: ReadingLog; draft: ReadingLog }[]>([]);
  readonly selectedCollectionId = signal<string | null>(null);
  readonly selectedShelfId = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly calendarMonth = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  readonly annualDays = computed(() => {
    const year = new Date().getFullYear();
    const byDate = new Map(this.library.aggregates().map((row) => [row.date, row]));
    const days: Array<{
      date: string;
      minutes: number;
      books: Array<{ id: string; title: string; minutes: number }>;
    }> = [];
    const cursor = new Date(year, 0, 1);
    while (cursor.getFullYear() === year) {
      const key = `${year}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const aggregate = byDate.get(key);
      const books = Object.entries(aggregate?.bookMinutes ?? {})
        .map(([bookId, minutes]) => {
          const book = this.library.books().find((candidate) => candidate.id === bookId);
          return book ? { id: book.id, title: book.title, minutes } : null;
        })
        .filter((book): book is { id: string; title: string; minutes: number } => !!book)
        .sort((a, b) => b.minutes - a.minutes);
      days.push({ date: key, minutes: aggregate?.minutes ?? 0, books });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  });
  readonly calendarDays = computed(() => {
    const now = new Date();
    const selected = this.calendarMonth();
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const byDate = new Map(this.library.aggregates().map((row) => [row.date, row]));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const aggregate = byDate.get(key);
      const books = Object.entries(aggregate?.bookMinutes ?? {})
        .map(([bookId, minutes]) => {
          const book = this.library.books().find((candidate) => candidate.id === bookId);
          return book
            ? { id: book.id, title: book.title, color: book.color, minutes }
            : null;
        })
        .filter(
          (book): book is { id: string; title: string; color: string; minutes: number } =>
            !!book,
        );
      return {
        key,
        day: date.getDate(),
        currentMonth: date.getMonth() === month,
        today: key === this.localDateKey(now),
        minutes: aggregate?.minutes ?? 0,
        pages: aggregate?.pages ?? 0,
        sessions: aggregate?.sessions ?? 0,
        books,
      };
    });
  });
  readonly calendarLabel = computed(() =>
    this.calendarMonth().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );
  readonly filteredBooks = computed(() => {
    const filters = this.library.settings().filters;
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .books()
      .filter(
        (book) =>
          (book.status === 'reading' || book.status === 'finished') &&
          (!query ||
            `${book.title} ${book.author} ${book.series}`
              .toLocaleLowerCase('pt-BR')
              .includes(query)) &&
          (!this.selectedCollectionId() ||
            book.collectionId === this.selectedCollectionId()) &&
          (!this.selectedShelfId() || book.shelfId === this.selectedShelfId()) &&
          (!filters.genre || this.selectedGenres(book).includes(filters.genre)) &&
          (!filters.format || book.format === filters.format) &&
          (!filters.favorite || book.favorite) &&
          (!filters.year ||
            String(book.finishedAt ?? book.startedAt ?? '').startsWith(filters.year)),
      );
  });
  readonly inProgressBooks = computed(() =>
    this.filteredBooks().filter((book) => book.status === 'reading'),
  );
  readonly completedBooks = computed(() =>
    this.filteredBooks().filter((book) => book.status === 'finished'),
  );
  // The goal is annual, so its progress must be scoped to the current year -
  // library.finished() is all-time, which would keep counting last year's
  // books against this year's goal forever.
  readonly finishedThisYear = computed(() => {
    const year = String(new Date().getFullYear());
    return this.library
      .finished()
      .filter((book) => (book.finishedAt ?? '').startsWith(year));
  });
  readonly weeklyPaceNeeded = computed(() => {
    const goal = this.library.settings().annualGoal;
    const remaining = goal - this.finishedThisYear().length;
    if (remaining <= 0) return null;
    const now = new Date();
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    const weeksLeft = Math.max(
      1,
      Math.ceil((yearEnd.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)),
    );
    return {
      remaining,
      weeksLeft,
      perWeek: Math.ceil((remaining / weeksLeft) * 10) / 10,
    };
  });
  /** Pages per calendar day over the last 60 days - your real reading rhythm. */
  readonly recentPagesPerDay = computed(() => {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const pages = this.library
      .aggregates()
      .filter((row) => this.parseLocalDate(row.date) >= since)
      .reduce((sum, row) => sum + row.pages, 0);
    return pages / 60;
  });
  /**
   * Annual goal forecast: the pages you'd read by Dec 31 at your recent rhythm,
   * spent on the books in progress (closest to done first), then the wishlist
   * (planned month, then the rest).
   */
  readonly goalForecast = computed(() => {
    const perDay = this.recentPagesPerDay();
    const goal = this.library.settings().annualGoal;
    const finished = this.finishedThisYear().length;
    const now = new Date();
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(now.getFullYear(), 11, 31, 23, 59).getTime() - now.getTime()) /
          86_400_000,
      ),
    );
    // Books without a page count use the average of the ones that have it.
    const known = this.library
      .books()
      .map((book) => book.pages)
      .filter((pages) => pages > 0);
    const averagePages = known.length
      ? Math.round(known.reduce((sum, pages) => sum + pages, 0) / known.length)
      : 300;
    const pagesOf = (book: ArcaneBook): number => book.pages || averagePages;
    const reading = this.library
      .reading()
      .map((book) => Math.max(1, pagesOf(book) - book.currentPage))
      .sort((a, b) => a - b);
    const wishlist = this.library
      .wishlist()
      .sort(
        (a, b) =>
          (a.plannedMonth ?? '9999').localeCompare(b.plannedMonth ?? '9999') ||
          b.priority - a.priority,
      )
      .map(pagesOf);
    const queue = [...reading, ...wishlist];
    let budget = perDay * daysLeft;
    let more = 0;
    for (const pages of queue) {
      if (pages > budget) break;
      budget -= pages;
      more++;
    }
    const projected = finished + more;
    const missing = Math.max(0, goal - finished);
    const pagesForGoal = queue.slice(0, missing).reduce((sum, pages) => sum + pages, 0);
    return {
      perDay,
      projected,
      goal,
      meets: projected >= goal,
      shortQueue: queue.length < missing,
      neededPerDay: daysLeft ? pagesForGoal / daysLeft : 0,
    };
  });
  /**
   * Next book from the wishlist: one that fits ~4 weeks at your rhythm and
   * whose genre you've read least in the last 6 months. Top 3, with reasons.
   */
  readonly nextBookSuggestions = computed(() => {
    const perDay = this.recentPagesPerDay();
    const capacity = perDay > 0 ? perDay * 28 : 300;
    const since = this.localDateKey(new Date(Date.now() - 182 * 86_400_000));
    const recentGenres = new Map<string, number>();
    for (const book of this.library.finished()) {
      if ((book.finishedAt ?? '') < since) continue;
      for (const genre of this.selectedGenres(book)) {
        recentGenres.set(genre, (recentGenres.get(genre) ?? 0) + 1);
      }
    }
    return this.library
      .wishlist()
      .map((book) => {
        const genres = this.selectedGenres(book);
        const genreReads = genres.length
          ? Math.min(...genres.map((genre) => recentGenres.get(genre) ?? 0))
          : 1;
        const fit = !book.pages
          ? 0.5
          : book.pages <= capacity
            ? 1
            : capacity / book.pages;
        const novelty = 1 / (1 + genreReads);
        const days = perDay > 0 && book.pages ? Math.ceil(book.pages / perDay) : null;
        const reasons = [
          days
            ? `${book.pages} pág. · ~${days < 14 ? `${days} dias` : `${Math.round(days / 7)} sem.`} no seu ritmo`
            : book.pages
              ? `${book.pages} páginas`
              : 'sem nº de páginas',
          genres.length
            ? genreReads === 0
              ? `${genres[0]}: nenhum lido nos últimos 6 meses`
              : `${genres[0]}: ${genreReads} lido(s) nos últimos 6 meses`
            : 'sem gênero definido',
        ];
        return { book, score: fit * 0.5 + novelty * 0.5, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  });
  readonly visibleWishlistBooks = computed(() => {
    const filters = this.library.settings().filters;
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .books()
      .filter(
        (book) =>
          ['wishlist', 'planned'].includes(book.status) &&
          (!query ||
            `${book.title} ${book.author}`.toLocaleLowerCase('pt-BR').includes(query)) &&
          (!this.selectedCollectionId() ||
            book.collectionId === this.selectedCollectionId()) &&
          (!this.selectedShelfId() || book.shelfId === this.selectedShelfId()) &&
          (!filters.genre || this.selectedGenres(book).includes(filters.genre)) &&
          (!filters.format || book.format === filters.format) &&
          (!filters.favorite || book.favorite),
      );
  });
  readonly wishlistBooks = computed(() => {
    const filters = this.library.settings().filters;
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .wishlist()
      .filter(
        (book) =>
          (!query ||
            `${book.title} ${book.author}`.toLocaleLowerCase('pt-BR').includes(query)) &&
          (!this.selectedCollectionId() ||
            book.collectionId === this.selectedCollectionId()) &&
          (!this.selectedShelfId() || book.shelfId === this.selectedShelfId()) &&
          (!filters.genre || this.selectedGenres(book).includes(filters.genre)) &&
          (!filters.format || book.format === filters.format) &&
          (!filters.favorite || book.favorite),
      );
  });
  readonly genres = computed(() =>
    [
      ...new Set(this.library.books().flatMap((book) => this.selectedGenres(book))),
    ].sort(),
  );
  readonly genreOptions = [
    'Romance',
    'Ficção científica',
    'Fantasia',
    'Clássico',
    'Mistério',
    'Terror',
    'História',
    'Biografia',
    'Filosofia',
    'Ciência',
    'Tecnologia',
    'Matemática',
    'Psicologia',
    'Negócios',
    'Poesia',
  ];
  readonly monthlyPlan = computed(() => [
    {
      key: '',
      label: 'Sem mês',
      books: this.library.wishlist().filter((book) => !book.plannedMonth),
      pages: this.library
        .wishlist()
        .filter((book) => !book.plannedMonth)
        .reduce((sum, book) => sum + book.pages, 0),
    },
    ...Array.from({ length: 12 }, (_, month) => {
      const key = `${new Date().getFullYear()}-${String(month + 1).padStart(2, '0')}`;
      const books = this.library.books().filter((book) => book.plannedMonth === key);
      return {
        key,
        label: new Date(2026, month, 1).toLocaleDateString('pt-BR', { month: 'long' }),
        books,
        pages: books.reduce((sum, book) => sum + book.pages, 0),
      };
    }),
  ]);
  readonly monthlyAverage = computed(
    () =>
      this.monthlyPlan()
        .slice(1)
        .reduce((sum, month) => sum + month.pages, 0) / 12,
  );
  readonly readingDaysCount = computed(
    () => this.library.aggregates().filter((row) => row.minutes > 0).length,
  );
  readonly monthlyReadingHistory = computed(() => {
    const totals = new Map<string, number>();
    for (const row of this.library.aggregates()) {
      const month = row.date.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + row.minutes);
    }
    const rows = [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, minutes]) => ({
        key,
        minutes,
        label: this.parseLocalDate(`${key}-01`).toLocaleDateString('pt-BR', {
          month: 'short',
          year: '2-digit',
        }),
      }));
    const max = Math.max(1, ...rows.map((row) => row.minutes));
    return rows.map((row) => ({
      ...row,
      height: Math.max(4, (row.minutes / max) * 100),
    }));
  });
  /**
   * Challenge progress, computed from the reading data since each challenge's
   * start date (the stored `progress` field is never updated).
   */
  readonly challengeRows = computed(() => {
    const finished = this.library.finished();
    const days = this.library
      .aggregates()
      .filter((row) => row.minutes > 0 || row.pages > 0)
      .map((row) => row.date)
      .sort();
    const aggregates = this.library.aggregates();
    const metricInfo = {
      books: { label: 'livros', icon: 'menu_book' },
      pages: { label: 'páginas', icon: 'auto_stories' },
      minutes: { label: 'minutos', icon: 'schedule' },
      streak: { label: 'dias seguidos', icon: 'local_fire_department' },
    };
    return this.library.challenges().map((challenge) => {
      const start = challenge.startDate ?? `${new Date().getFullYear()}-01-01`;
      let progress = 0;
      if (challenge.metric === 'books') {
        progress = finished.filter((book) => (book.finishedAt ?? '') >= start).length;
      } else if (challenge.metric === 'pages' || challenge.metric === 'minutes') {
        const key = challenge.metric;
        progress = aggregates
          .filter((row) => row.date >= start)
          .reduce((sum, row) => sum + row[key], 0);
      } else {
        // Longest run of consecutive reading days since the start date.
        let run = 0;
        let previous = '';
        for (const day of days.filter((item) => item >= start)) {
          const expected = previous ? this.nextDateKey(previous) : day;
          run = day === expected ? run + 1 : 1;
          progress = Math.max(progress, run);
          previous = day;
        }
      }
      return {
        challenge,
        start,
        progress,
        percent: Math.min(100, (progress / challenge.target) * 100),
        done: progress >= challenge.target,
        ...metricInfo[challenge.metric],
      };
    });
  });

  readonly readingSpeedChart = computed(() => {
    const rows = this.library
      .aggregates()
      .filter((row) => row.minutes > 0 && row.pages > 0)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((row) => ({ ...row, speed: row.pages / row.minutes }));
    // Tukey fences: days outside Q1 - 1.5·IQR .. Q3 + 1.5·IQR stay on the
    // chart but are left out of the mean (needs 4+ days to be meaningful).
    const sorted = rows.map((row) => row.speed).sort((a, b) => a - b);
    const quantile = (q: number): number => {
      const pos = (sorted.length - 1) * q;
      const base = Math.floor(pos);
      const next = sorted[base + 1] ?? sorted[base];
      return sorted[base] + (pos - base) * (next - sorted[base]);
    };
    const iqr = sorted.length >= 4 ? quantile(0.75) - quantile(0.25) : 0;
    const isOutlier = (speed: number): boolean =>
      sorted.length >= 4 &&
      (speed < quantile(0.25) - 1.5 * iqr || speed > quantile(0.75) + 1.5 * iqr);
    const counted = rows.filter((row) => !isOutlier(row.speed));
    const mean = counted.length
      ? counted.reduce((total, row) => total + row.speed, 0) / counted.length
      : 0;
    const max = Math.max(mean, ...rows.map((row) => row.speed), 1);
    const left = 42;
    const top = 22;
    const width = 916;
    const height = 188;
    const points = rows.map((row, index) => {
      const x =
        left + (rows.length <= 1 ? width / 2 : (index / (rows.length - 1)) * width);
      const y = top + height - (row.speed / max) * height;
      const ratio = mean ? row.speed / mean : 1;
      const outlier = isOutlier(row.speed);
      return {
        ...row,
        x,
        y,
        outlier,
        tone: outlier
          ? 'outlier'
          : ratio > 1.1
            ? 'above'
            : ratio < 0.9
              ? 'below'
              : 'similar',
      };
    });
    return {
      mean,
      max,
      outlierCount: rows.length - counted.length,
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
      meanY: top + height - (mean / max) * height,
    };
  });

  newTitle = '';
  newAuthor = '';
  newPages = 0;
  newStatus: BookStatus = 'wishlist';
  newFormat: BookFormat = 'physical';
  collectionTitle = '';
  shelfTitle = '';
  shelfCollectionId = '';
  logMinutes = 30;
  logStartPage = 0;
  logEndPage = 0;
  logNotes = '';
  logDate = this.localDateKey(new Date());
  challengeStart = this.localDateKey(new Date());
  readonly today = this.localDateKey(new Date());
  challengeTitle = '';
  challengeMetric: 'books' | 'pages' | 'minutes' | 'streak' = 'books';
  challengeTarget = 10;

  async ngOnInit(): Promise<void> {
    this.restoreAiSuggestions();
    await this.library.load(this.selectedCharacterId());
  }

  async selectCharacter(characterId: string): Promise<void> {
    if (!characterId || characterId === this.selectedCharacterId()) return;
    this.selectedCharacterId.set(characterId);
    this.selectedBook.set(null);
    this.editingBook.set(null);
    this.selectedCollectionId.set(null);
    this.selectedShelfId.set(null);
    this.restoreAiSuggestions();
    await this.library.load(characterId);
  }

  async createBook(): Promise<void> {
    if (!this.newTitle.trim()) return;
    const book = await this.library.createBook({
      title: this.newTitle,
      author: this.newAuthor,
      pages: this.newPages,
      status: this.newStatus,
      format: this.newFormat,
    });
    this.newTitle = '';
    this.newAuthor = '';
    this.newPages = 0;
    void (async () => {
      if (this.gemini.configured()) await this.autofillStoredBook(book.id);
      await this.fetchCoverFor(book.id);
    })();
  }

  // ---- IA (Gemini) ----
  readonly aiMessage = signal('');
  readonly aiBusy = signal(false);
  readonly aiBookSuggestions = signal<AiSuggestion[]>([]);

  /** Fills only the empty fields of a book's fact sheet from the AI. */
  private async aiFillFields(book: ArcaneBook): Promise<ArcaneBook> {
    const info = await this.mediaAi.fillBook(book.title, book.author, this.genreOptions);
    const genres = (info.genres ?? []).filter((genre) =>
      this.genreOptions.includes(genre),
    );
    const hasGenre = this.selectedGenres(book).length > 0;
    return {
      ...book,
      author: book.author || info.author || '',
      pages: book.pages || Math.max(0, Math.round(Number(info.pages) || 0)),
      publisher: book.publisher || info.publisher || '',
      publicationYear: book.publicationYear ?? (Number(info.publicationYear) || null),
      synopsis: book.synopsis || info.synopsis || '',
      genre: hasGenre ? book.genre : (genres[0] ?? book.genre),
      subgenres: hasGenre ? book.subgenres : genres.slice(1),
    };
  }

  private async autofillStoredBook(bookId: string): Promise<void> {
    const book = this.library.books().find((row) => row.id === bookId);
    if (!book) return;
    this.aiMessage.set(`Preenchendo a ficha de "${book.title}" com IA...`);
    try {
      const filled = await this.aiFillFields(book);
      const current = this.library.books().find((row) => row.id === bookId) ?? book;
      await this.library.updateBook({
        ...current,
        author: filled.author,
        pages: filled.pages,
        publisher: filled.publisher,
        publicationYear: filled.publicationYear,
        synopsis: filled.synopsis,
        genre: filled.genre,
        subgenres: filled.subgenres,
      });
      this.aiMessage.set(`Ficha de "${book.title}" preenchida pela IA - confira.`);
    } catch (e) {
      this.aiMessage.set((e as Error).message);
    }
  }

  async autofillEditingBook(): Promise<void> {
    const book = this.editingBook();
    if (!book) return;
    this.aiBusy.set(true);
    try {
      this.editingBook.set(await this.aiFillFields(structuredClone(book)));
      this.aiMessage.set('Campos vazios preenchidos pela IA - confira antes de salvar.');
    } catch (e) {
      this.aiMessage.set((e as Error).message);
    } finally {
      this.aiBusy.set(false);
    }
  }

  /** append: keep the current ones and only add new titles (up to 5). */
  async loadAiBookSuggestions(append = false): Promise<void> {
    this.aiBusy.set(true);
    this.aiMessage.set('Pedindo sugestões à IA...');
    try {
      const rated = this.library
        .books()
        .filter((book) => book.status === 'finished' || book.rating !== null)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .map((book) => ({
          title: book.title,
          creator: book.author,
          rating: book.rating,
          genres: this.selectedGenres(book),
        }));
      const suggestions = await this.mediaAi.suggest(
        'livros',
        rated,
        [...this.library.books().map((book) => book.title), ...this.seenSuggestions()],
        this.library
          .wishlist()
          .map((book) => (book.author ? ` (${book.author})` : book.title)),
      );
      if (!suggestions.length) {
        // Keep what was on screen instead of blanking the list.
        this.aiMessage.set(
          'A IA só repetiu títulos que você já tem ou já viu - tente de novo daqui a pouco.',
        );
        return;
      }
      this.rememberSuggestions(suggestions);
      const next = append
        ? [...this.aiBookSuggestions(), ...suggestions].slice(0, 5)
        : suggestions;
      this.aiBookSuggestions.set(next);
      this.storeAiSuggestions(next);
      this.aiMessage.set('');
    } catch (e) {
      this.aiMessage.set((e as Error).message);
    } finally {
      this.aiBusy.set(false);
    }
  }

  async addAiSuggestionToWishlist(suggestion: AiSuggestion): Promise<void> {
    const book = await this.library.createBook({
      title: suggestion.title,
      author: suggestion.creator,
      status: 'wishlist',
    });
    const remaining = this.aiBookSuggestions().filter((item) => item !== suggestion);
    this.aiBookSuggestions.set(remaining);
    this.storeAiSuggestions(remaining);
    // Refill the list so a new suggestion takes the added one's place.
    if (remaining.length < 5) void this.loadAiBookSuggestions(true);
    void (async () => {
      await this.autofillStoredBook(book.id);
      await this.fetchCoverFor(book.id);
    })();
  }

  private aiSuggestionsKey(): string {
    return `sp-ai-book-suggestions:${this.selectedCharacterId()}`;
  }

  /** Titles the AI already suggested, so "Novas sugestões" never repeats them. */
  private seenSuggestions(): string[] {
    try {
      return JSON.parse(
        localStorage.getItem(`${this.aiSuggestionsKey()}:seen`) ?? '[]',
      ) as string[];
    } catch {
      return [];
    }
  }

  private rememberSuggestions(suggestions: AiSuggestion[]): void {
    try {
      localStorage.setItem(
        `${this.aiSuggestionsKey()}:seen`,
        JSON.stringify(
          [...this.seenSuggestions(), ...suggestions.map((item) => item.title)].slice(
            -300,
          ),
        ),
      );
    } catch {}
  }

  // ---- capas automáticas (Open Library / Google Books) ----
  readonly coverBusy = signal(false);
  readonly missingCovers = computed(
    () => this.library.books().filter((book) => !book.coverDataUrl).length,
  );

  /** Looks the cover up in free catalogs; true when one was found and saved. */
  private async fetchCoverFor(bookId: string): Promise<boolean> {
    if (!IS_ELECTRON) return false;
    const book = this.library.books().find((row) => row.id === bookId);
    if (!book || book.coverDataUrl) return false;
    const found = await window.ea.coverLookup({
      kind: 'book',
      title: book.title,
      author: book.author,
    });
    if (!found) return false;
    const coverDataUrl = await shrinkImageDataUrl(found, 480);
    const current = this.library.books().find((row) => row.id === bookId) ?? book;
    await this.library.updateBook({ ...current, coverDataUrl });
    if (this.editingBook()?.id === bookId) {
      this.editingBook.set({ ...structuredClone(this.editingBook()!), coverDataUrl });
    }
    return true;
  }

  // ---- escolher capa entre várias opções ----
  readonly coverOptions = signal<
    { dataUrl: string; label: string; source: string }[] | null
  >(null);

  async openCoverPicker(): Promise<void> {
    const item = this.editingBook();
    if (!item || !IS_ELECTRON) return;
    this.coverBusy.set(true);
    this.aiMessage.set('Procurando capas...');
    try {
      const options = await window.ea.coverCandidates({
        kind: 'book',
        title: item.title,
        author: item.author,
      });
      this.coverOptions.set(options);
      this.aiMessage.set(
        options.length ? 'Clique na capa certa.' : 'Nenhuma capa encontrada.',
      );
    } finally {
      this.coverBusy.set(false);
    }
  }

  async chooseCover(dataUrl: string): Promise<void> {
    const item = this.editingBook();
    if (!item) return;
    const coverDataUrl = await shrinkImageDataUrl(dataUrl, 480);
    this.editingBook.set({ ...structuredClone(item), coverDataUrl });
    const stored = this.library.books().find((row) => row.id === item.id);
    if (stored) await this.library.updateBook({ ...stored, coverDataUrl });
    this.coverOptions.set(null);
    this.aiMessage.set('Capa trocada.');
  }

  async fetchEditingBookCover(): Promise<void> {
    const book = this.editingBook();
    if (!book) return;
    this.coverBusy.set(true);
    try {
      const found = await this.fetchCoverFor(book.id);
      this.aiMessage.set(
        found ? 'Capa encontrada e salva.' : 'Não achei a capa deste livro.',
      );
    } finally {
      this.coverBusy.set(false);
    }
  }

  async fetchMissingCovers(): Promise<void> {
    this.coverBusy.set(true);
    let found = 0;
    const missing = this.library.books().filter((book) => !book.coverDataUrl);
    try {
      for (const [index, book] of missing.entries()) {
        this.aiMessage.set(`Buscando capas... ${index + 1}/${missing.length}`);
        if (await this.fetchCoverFor(book.id)) found++;
      }
      this.aiMessage.set(`${found} de ${missing.length} capas encontradas.`);
    } finally {
      this.coverBusy.set(false);
    }
  }

  private storeAiSuggestions(suggestions: AiSuggestion[]): void {
    try {
      localStorage.setItem(this.aiSuggestionsKey(), JSON.stringify(suggestions));
    } catch {}
  }

  private restoreAiSuggestions(): void {
    try {
      this.aiBookSuggestions.set(
        JSON.parse(
          localStorage.getItem(this.aiSuggestionsKey()) ?? '[]',
        ) as AiSuggestion[],
      );
    } catch {
      this.aiBookSuggestions.set([]);
    }
  }

  async createCollection(): Promise<void> {
    await this.library.addGroup('collection', this.collectionTitle, null);
    this.collectionTitle = '';
  }

  async createShelf(): Promise<void> {
    await this.library.addGroup('shelf', this.shelfTitle, this.shelfCollectionId || null);
    this.shelfTitle = '';
  }

  previousCalendarMonth(): void {
    const current = this.calendarMonth();
    this.calendarMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextCalendarMonth(): void {
    const current = this.calendarMonth();
    this.calendarMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  resetCalendarMonth(): void {
    const now = new Date();
    this.calendarMonth.set(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  async moveBookToMonth(book: ArcaneBook, month: string): Promise<void> {
    await this.library.updateBook({ ...book, plannedMonth: month || null });
  }

  dragBook(event: DragEvent, book: ArcaneBook): void {
    event.dataTransfer?.setData('text/book-id', book.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  allowBookDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async dropBook(event: DragEvent, month: string): Promise<void> {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/book-id');
    const book = this.library.books().find((row) => row.id === id);
    if (book) await this.moveBookToMonth(book, month);
  }

  async dropBookOnStatus(event: DragEvent, status: ArcaneBook['status']): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer?.getData('text/book-id');
    const book = this.library.books().find((row) => row.id === id);
    if (book && book.status !== status) await this.changeBookStatus(book, status);
  }

  async changeBookStatus(book: ArcaneBook, status: ArcaneBook['status']): Promise<void> {
    const wasFinished = book.status === 'finished';
    const updated: ArcaneBook = {
      ...book,
      status,
      startedAt:
        status === 'reading'
          ? book.startedAt || this.localDateKey(new Date())
          : book.startedAt,
      finishedAt:
        status === 'finished' ? book.finishedAt || this.localDateKey(new Date()) : null,
      currentPage: status === 'finished' ? book.pages : book.currentPage,
    };
    if (status === 'finished' && !wasFinished) {
      // Completing a book (drag or otherwise) now opens the edit dialog with
      // this draft instead of saving straight away - rating is mandatory
      // there (see isCompletionInfoMissing) before "Salvar ficha" commits it.
      this.editingBook.set(updated);
      return;
    }
    await this.library.updateBook(updated);
  }

  ratingStars(rating: number): string {
    return '⭐'.repeat(Math.max(0, Math.min(5, Math.round(rating))));
  }

  isCompletionInfoMissing(book: ArcaneBook): boolean {
    return book.status === 'finished' && !book.rating;
  }

  async updateAnnualGoal(value: number): Promise<void> {
    const annualGoal = Math.max(1, Math.round(Number(value) || 1));
    await this.library.saveSettings({ ...this.library.settings(), annualGoal });
  }

  async deleteCollection(event: Event, id: string): Promise<void> {
    event.stopPropagation();
    await this.library.removeGroup(id);
    if (this.selectedCollectionId() === id) this.selectCollection(null);
  }

  selectCollection(collectionId: string | null): void {
    this.selectedCollectionId.set(collectionId);
    this.selectedShelfId.set(null);
  }

  selectShelf(shelfId: string | null): void {
    this.selectedShelfId.set(shelfId);
  }

  collectionBooksCount(collectionId: string): number {
    return this.library.books().filter((book) => book.collectionId === collectionId)
      .length;
  }

  shelvesForCollection(collectionId: string | null): LibraryGroup[] {
    return this.library
      .groups()
      .filter((group) => group.kind === 'shelf' && group.parentId === collectionId);
  }

  bookCollectionChanged(book: ArcaneBook, collectionId: string): void {
    book.collectionId = collectionId || null;
    if (
      !this.shelvesForCollection(book.collectionId).some(
        (shelf) => shelf.id === book.shelfId,
      )
    ) {
      book.shelfId = null;
    }
  }

  openBook(book: ArcaneBook): void {
    this.selectedBook.set(book);
    this.logStartPage = book.currentPage;
    this.logEndPage = book.currentPage;
    this.logDate = this.localDateKey(new Date());
  }

  startReadingLog(book: ArcaneBook, event?: Event): void {
    event?.stopPropagation();
    this.openBook(book);
  }

  openCalendarDayLog(day: { key: string }): void {
    this.calendarPickerDate.set(day.key);
    this.dayLogs.set([]);
    void this.library.listLogsByDate(day.key).then((logs) => {
      if (this.calendarPickerDate() !== day.key) return;
      this.dayLogs.set(logs.map((log) => ({ original: log, draft: { ...log } })));
    });
  }

  bookTitle(bookId: string): string {
    return (
      this.library.books().find((book) => book.id === bookId)?.title ?? 'Livro removido'
    );
  }

  async saveDayLog(entry: { original: ReadingLog; draft: ReadingLog }): Promise<void> {
    const draft = entry.draft;
    const startedAt = this.combineDateWithTimeOf(
      draft.date,
      new Date(entry.original.startedAt),
    );
    await this.library.replaceLog(entry.original, {
      ...draft,
      minutes: Math.round(Number(draft.minutes) || 0),
      startPage: Math.round(Number(draft.startPage) || 0),
      endPage: Math.round(Number(draft.endPage) || 0),
      startedAt,
    });
    this.calendarPickerDate.set(null);
  }

  async deleteDayLog(entry: { original: ReadingLog }): Promise<void> {
    if (
      !confirmDialog(
        `Excluir esta leitura de "${this.bookTitle(entry.original.bookId)}"?`,
      )
    ) {
      return;
    }
    await this.library.replaceLog(entry.original, null);
    this.dayLogs.update((rows) => rows.filter((row) => row !== entry));
  }

  pickBookForCalendarDay(bookId: string, date: string): void {
    const book = this.library.books().find((candidate) => candidate.id === bookId);
    this.calendarPickerDate.set(null);
    if (!book) return;
    this.openBook(book);
    this.logDate = date;
  }

  editBook(book: ArcaneBook, event?: Event): void {
    event?.stopPropagation();
    this.editingBook.set(structuredClone(book));
    this.coverOptions.set(null);
  }

  async saveBook(): Promise<void> {
    const book = this.editingBook();
    // Defense in depth alongside the disabled "Salvar ficha" button - a
    // completed book must carry a rating before this actually commits.
    if (!book || this.isCompletionInfoMissing(book)) return;
    await this.library.updateBook(book);
    this.editingBook.set(null);
  }

  async syncBookDates(book: ArcaneBook, status: BookStatus): Promise<void> {
    const today = this.localDateKey(new Date());
    const wasFinished = book.status === 'finished';
    book.status = status;
    if (status === 'reading') {
      book.startedAt ??= today;
      book.finishedAt = null;
    } else if (status === 'finished') {
      book.startedAt ??= today;
      book.finishedAt ??= today;
      book.currentPage = book.pages;
    } else if (status === 'wishlist' || status === 'planned') {
      book.startedAt = null;
      book.finishedAt = null;
    } else {
      book.finishedAt = null;
    }
    // Marking a book done straight from this selector (rather than through
    // "Registrar leitura") means no reading time was ever logged for it -
    // ask for the final push's minutes so it still shows up on the heatmap,
    // instead of silently completing with zero recorded time.
    if (status === 'finished' && !wasFinished) {
      const answer = promptDialog(
        `Quantos minutos você demorou para terminar "${book.title}"?`,
        '20',
      );
      const minutes = answer ? Math.round(Number(answer)) : 0;
      if (minutes > 0) {
        const finishedAt = book.finishedAt ?? today;
        await this.library.addLog(
          book,
          minutes,
          book.currentPage,
          book.pages || book.currentPage,
          '',
          this.combineDateWithTimeOf(finishedAt, new Date()),
        );
      }
    }
  }

  async saveLog(): Promise<void> {
    const book = this.selectedBook();
    if (!book) return;
    await this.library.addLog(
      book,
      this.logMinutes,
      this.logStartPage,
      this.logEndPage,
      this.logNotes,
      this.logDateTimestamp(),
    );
    this.selectedBook.set(null);
    this.logNotes = '';
    // Logging up to the last page auto-completes the book inside addLog, so
    // the mandatory completion info (rating) must be requested here too.
    const updated = this.library.books().find((row) => row.id === book.id);
    if (updated && book.status !== 'finished' && this.isCompletionInfoMissing(updated)) {
      this.editingBook.set(structuredClone(updated));
    }
  }

  // Combines a picked "Data" (Y-M-D only) with the current wall-clock time,
  // so backdating a log doesn't collapse its time-of-day to midnight.
  private combineDateWithTimeOf(dateStr: string, reference: Date): number {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(
      year,
      Math.max(0, month - 1),
      day || 1,
      reference.getHours(),
      reference.getMinutes(),
      reference.getSeconds(),
    ).getTime();
  }

  private logDateTimestamp(): number {
    return this.combineDateWithTimeOf(this.logDate, new Date());
  }

  async setView(view: LibraryView): Promise<void> {
    await this.library.saveSettings({ ...this.library.settings(), view });
  }

  async persistFilters(): Promise<void> {
    await this.library.saveSettings({
      ...this.library.settings(),
      filters: { ...this.library.settings().filters },
    });
  }

  dayTooltip(day: {
    date: string;
    minutes: number;
    books: Array<{ title: string; minutes: number }>;
  }): string {
    const header = `${day.date} · ${day.minutes} min`;
    if (!day.books.length) return header;
    const lines = day.books.map((book) => `${book.title}: ${book.minutes} min`);
    return `${header}\n${lines.join('\n')}`;
  }

  /**
   * Level cut-offs from the reader's own year (quartiles of the days with any
   * reading), so the colours spread over their real range instead of fixed
   * 20/45/90-minute steps that put a steady 50-min/day reader all in one shade.
   */
  readonly heatThresholds = computed(() => {
    const minutes = this.annualDays()
      .map((day) => day.minutes)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (minutes.length < 4) return [20, 45, 90];
    const at = (q: number): number => minutes[Math.floor((minutes.length - 1) * q)];
    return [at(0.25), at(0.5), at(0.75)];
  });

  heatLevel(minutes: number): number {
    if (!minutes) return 0;
    const [low, mid, high] = this.heatThresholds();
    if (minutes <= low) return 1;
    if (minutes <= mid) return 2;
    if (minutes <= high) return 3;
    return 4;
  }

  planLoad(pages: number): 'light' | 'balanced' | 'heavy' {
    const average = this.monthlyAverage();
    if (!pages || pages < average * 0.8) return 'light';
    if (pages <= average * 1.25) return 'balanced';
    return 'heavy';
  }

  async coverSelected(event: Event, book: ArcaneBook): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const data = await readFileAsShrunkDataUrl(file);
    await this.library.updateBook({ ...book, coverDataUrl: data });
    if (this.editingBook()?.id === book.id)
      this.editingBook.set({ ...book, coverDataUrl: data });
  }

  progress(book: ArcaneBook): number {
    return book.pages
      ? Math.min(100, Math.round((book.currentPage / book.pages) * 100))
      : 0;
  }

  /**
   * Reading time left for every book being read: pages left / your reading
   * speed (pages per minute, mean without outlier days - the same as the speed
   * chart). Time the book sat untouched never counts.
   */
  readonly bookEtas = computed(() => {
    const speed = this.readingSpeedChart().mean;
    const result = new Map<string, { label: string; title: string }>();
    for (const book of this.library.reading()) {
      const left = book.pages - book.currentPage;
      if (!book.pages || left <= 0) continue;
      if (!speed) {
        result.set(book.id, {
          label: 'sem velocidade registrada',
          title: 'Registre leituras com páginas e minutos para estimar o tempo restante.',
        });
        continue;
      }
      const minutes = Math.ceil(left / speed);
      const span =
        minutes < 60
          ? `~${minutes} min`
          : `~${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
      const blocks = Math.ceil(minutes / 50);
      const pages = (speed * 60).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      result.set(book.id, {
        label: `faltam ${span} de leitura (${blocks} ${blocks === 1 ? 'bloco' : 'blocos'})`,
        title:
          `Faltam ${left} páginas. Na sua velocidade média (${pages} pág./hora, ` +
          `sem os dias fora da curva) são ${span} de leitura - ${blocks} ` +
          `${blocks === 1 ? 'bloco' : 'blocos'} de 50 min.`,
      });
    }
    return result;
  });

  readingDays(book: ArcaneBook): number | null {
    if (!book.startedAt) return null;
    const start = this.parseLocalDate(book.startedAt);
    const end = book.finishedAt ? this.parseLocalDate(book.finishedAt) : new Date();
    const elapsed = Math.floor(
      (this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) / 86_400_000,
    );
    return Math.max(1, elapsed + 1);
  }

  genreCount(genre: string): number {
    return this.filteredBooks().filter((book) =>
      this.selectedGenres(book).includes(genre),
    ).length;
  }

  genreBarWidth(genre: string): number {
    const max = Math.max(1, ...this.genres().map((item) => this.genreCount(item)));
    return (this.genreCount(genre) / max) * 100;
  }

  selectedGenres(book: ArcaneBook): string[] {
    return [
      ...new Set(
        [book.genre, ...book.subgenres].filter(
          (genre) => genre && genre !== 'Não definido',
        ),
      ),
    ];
  }

  toggleGenre(book: ArcaneBook, genre: string): void {
    const selected = new Set(this.selectedGenres(book));
    selected.has(genre) ? selected.delete(genre) : selected.add(genre);
    const genres = [...selected];
    book.genre = genres[0] ?? 'Não definido';
    book.subgenres = genres.slice(1);
  }

  private nextDateKey(value: string): string {
    const date = this.parseLocalDate(value);
    date.setDate(date.getDate() + 1);
    return this.localDateKey(date);
  }

  private localDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private parseLocalDate(value: string): Date {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, Math.max(0, month - 1), day || 1);
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}
