import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { ArcaneLibraryService } from '../application/arcane-library.service';
import {
  ArcaneBook,
  BookFormat,
  BookStatus,
  LibraryGroup,
  LibraryView,
} from '../domain/arcane-library.models';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';
import { promptDialog } from '../../../util/native-dialogs';

@Component({
  selector: 'arcane-library-page',
  standalone: true,
  imports: [FormsModule, MatIcon, CharacterRendererComponent],
  templateUrl: './arcane-library-page.component.html',
  styleUrl: './arcane-library-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ArcaneLibraryService],
})
export class ArcaneLibraryPageComponent implements OnInit {
  readonly library = inject(ArcaneLibraryService);
  readonly profile = inject(RpgProfileService);
  readonly selectedCharacterId = signal(this.profile.activeCharacterId());
  readonly tab = signal<'dashboard' | 'library' | 'calendar' | 'planning' | 'challenges'>(
    'dashboard',
  );
  readonly selectedBook = signal<ArcaneBook | null>(null);
  readonly editingBook = signal<ArcaneBook | null>(null);
  readonly calendarPickerDate = signal<string | null>(null);
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
  readonly visibleWishlistBooks = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .books()
      .filter(
        (book) =>
          ['wishlist', 'planned'].includes(book.status) &&
          (!query ||
            `${book.title} ${book.author}`.toLocaleLowerCase('pt-BR').includes(query)),
      );
  });
  readonly wishlistBooks = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .wishlist()
      .filter(
        (book) =>
          (!query ||
            `${book.title} ${book.author}`.toLocaleLowerCase('pt-BR').includes(query)) &&
          (!this.selectedCollectionId() ||
            book.collectionId === this.selectedCollectionId()) &&
          (!this.selectedShelfId() || book.shelfId === this.selectedShelfId()),
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
  readonly readingSpeedChart = computed(() => {
    const rows = this.library
      .aggregates()
      .filter((row) => row.minutes > 0 && row.pages > 0)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((row) => ({ ...row, speed: row.pages / row.minutes }));
    const mean = rows.length
      ? rows.reduce((total, row) => total + row.speed, 0) / rows.length
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
      return {
        ...row,
        x,
        y,
        tone: ratio > 1.1 ? 'above' : ratio < 0.9 ? 'below' : 'similar',
      };
    });
    return {
      mean,
      max,
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
  readonly today = this.localDateKey(new Date());
  challengeTitle = '';
  challengeMetric: 'books' | 'pages' | 'minutes' | 'streak' = 'books';
  challengeTarget = 10;

  async ngOnInit(): Promise<void> {
    await this.library.load(this.selectedCharacterId());
  }

  async selectCharacter(characterId: string): Promise<void> {
    if (!characterId || characterId === this.selectedCharacterId()) return;
    this.selectedCharacterId.set(characterId);
    this.selectedBook.set(null);
    this.editingBook.set(null);
    this.selectedCollectionId.set(null);
    this.selectedShelfId.set(null);
    await this.library.load(characterId);
  }

  async createBook(): Promise<void> {
    if (!this.newTitle.trim()) return;
    await this.library.createBook({
      title: this.newTitle,
      author: this.newAuthor,
      pages: this.newPages,
      status: this.newStatus,
      format: this.newFormat,
    });
    this.newTitle = '';
    this.newAuthor = '';
    this.newPages = 0;
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
    await this.library.updateBook({
      ...book,
      status,
      startedAt:
        status === 'reading'
          ? book.startedAt || this.localDateKey(new Date())
          : book.startedAt,
      finishedAt:
        status === 'finished' ? book.finishedAt || this.localDateKey(new Date()) : null,
      currentPage: status === 'finished' ? book.pages : book.currentPage,
    });
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
  }

  async saveBook(): Promise<void> {
    const book = this.editingBook();
    if (!book) return;
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

  heatLevel(minutes: number): number {
    if (!minutes) return 0;
    if (minutes < 20) return 1;
    if (minutes < 45) return 2;
    if (minutes < 90) return 3;
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
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await this.library.updateBook({ ...book, coverDataUrl: data });
    if (this.editingBook()?.id === book.id)
      this.editingBook.set({ ...book, coverDataUrl: data });
  }

  progress(book: ArcaneBook): number {
    return book.pages
      ? Math.min(100, Math.round((book.currentPage / book.pages) * 100))
      : 0;
  }

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
