import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { ArcaneLibraryService } from '../application/arcane-library.service';
import { ArcaneBook, BookFormat, BookStatus, LibraryGroup, LibraryView } from '../domain/arcane-library.models';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';

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
  readonly tab = signal<'dashboard' | 'library' | 'calendar' | 'planning' | 'challenges'>('dashboard');
  readonly selectedBook = signal<ArcaneBook | null>(null);
  readonly editingBook = signal<ArcaneBook | null>(null);
  readonly selectedCollectionId = signal<string | null>(null);
  readonly selectedShelfId = signal<string | null>(null);
  readonly annualDays = computed(() => {
    const year = new Date().getFullYear();
    const byDate = new Map(this.library.aggregates().map((row) => [row.date, row]));
    const days: Array<{ date: string; minutes: number }> = [];
    const cursor = new Date(year, 0, 1);
    while (cursor.getFullYear() === year) {
      const key = `${year}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      days.push({ date: key, minutes: byDate.get(key)?.minutes ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  });
  readonly calendarDays = computed(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
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
          return book ? { id: book.id, title: book.title, color: book.color, minutes } : null;
        })
        .filter((book): book is { id: string; title: string; color: string; minutes: number } => !!book);
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
    new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );
  readonly filteredBooks = computed(() => {
    const filters = this.library.settings().filters;
    return this.library.books().filter((book) =>
      (book.status === 'reading' || book.status === 'finished') &&
      (!this.selectedCollectionId() || book.collectionId === this.selectedCollectionId()) &&
      (!this.selectedShelfId() || book.shelfId === this.selectedShelfId()) &&
      (!filters.genre || this.selectedGenres(book).includes(filters.genre)) &&
      (!filters.format || book.format === filters.format) &&
      (!filters.favorite || book.favorite) &&
      (!filters.year || String(book.finishedAt ?? book.startedAt ?? '').startsWith(filters.year)),
    );
  });
  readonly inProgressBooks = computed(() =>
    this.filteredBooks().filter((book) => book.status === 'reading'),
  );
  readonly completedBooks = computed(() =>
    this.filteredBooks().filter((book) => book.status === 'finished'),
  );
  readonly genres = computed(() =>
    [...new Set(this.library.books().flatMap((book) => this.selectedGenres(book)))].sort(),
  );
  readonly genreOptions = [
    'Romance', 'Ficção científica', 'Fantasia', 'Clássico', 'Mistério',
    'Terror', 'História', 'Biografia', 'Filosofia', 'Ciência',
    'Tecnologia', 'Matemática', 'Psicologia', 'Negócios', 'Poesia',
  ];
  readonly monthlyPlan = computed(() => Array.from({ length: 12 }, (_, month) => {
    const key = `${new Date().getFullYear()}-${String(month + 1).padStart(2, '0')}`;
    const books = this.library.books().filter((book) => book.plannedMonth === key);
    return { key, label: new Date(2026, month, 1).toLocaleDateString('pt-BR', { month: 'long' }), books, pages: books.reduce((sum, book) => sum + book.pages, 0) };
  }));
  readonly monthlyAverage = computed(() => this.monthlyPlan().reduce((sum, month) => sum + month.pages, 0) / 12);

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
    await this.library.createBook({ title: this.newTitle, author: this.newAuthor, pages: this.newPages, status: this.newStatus, format: this.newFormat });
    this.newTitle = ''; this.newAuthor = ''; this.newPages = 0;
  }

  async createCollection(): Promise<void> {
    await this.library.addGroup('collection', this.collectionTitle, null);
    this.collectionTitle = '';
  }

  async createShelf(): Promise<void> {
    await this.library.addGroup(
      'shelf',
      this.shelfTitle,
      this.shelfCollectionId || null,
    );
    this.shelfTitle = '';
  }

  selectCollection(collectionId: string | null): void {
    this.selectedCollectionId.set(collectionId);
    this.selectedShelfId.set(null);
  }

  selectShelf(shelfId: string | null): void {
    this.selectedShelfId.set(shelfId);
  }

  collectionBooksCount(collectionId: string): number {
    return this.library.books().filter((book) => book.collectionId === collectionId).length;
  }

  shelvesForCollection(collectionId: string | null): LibraryGroup[] {
    return this.library.groups().filter(
      (group) => group.kind === 'shelf' && group.parentId === collectionId,
    );
  }

  bookCollectionChanged(book: ArcaneBook, collectionId: string): void {
    book.collectionId = collectionId || null;
    if (!this.shelvesForCollection(book.collectionId).some((shelf) => shelf.id === book.shelfId)) {
      book.shelfId = null;
    }
  }

  openBook(book: ArcaneBook): void {
    this.selectedBook.set(book);
    this.logStartPage = book.currentPage;
    this.logEndPage = book.currentPage;
  }

  startReadingLog(book: ArcaneBook, event?: Event): void {
    event?.stopPropagation();
    this.openBook(book);
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

  syncBookDates(book: ArcaneBook, status: BookStatus): void {
    const today = this.localDateKey(new Date());
    book.status = status;
    if (status === 'reading') {
      book.startedAt ??= today;
      book.finishedAt = null;
    } else if (status === 'finished') {
      book.startedAt ??= today;
      book.finishedAt ??= today;
    } else if (status === 'wishlist' || status === 'planned') {
      book.startedAt = null;
      book.finishedAt = null;
    } else {
      book.finishedAt = null;
    }
  }

  async saveLog(): Promise<void> {
    const book = this.selectedBook();
    if (!book) return;
    await this.library.addLog(book, this.logMinutes, this.logStartPage, this.logEndPage, this.logNotes);
    this.selectedBook.set(null);
    this.logNotes = '';
  }

  async setView(view: LibraryView): Promise<void> {
    await this.library.saveSettings({ ...this.library.settings(), view });
  }

  async persistFilters(): Promise<void> {
    await this.library.saveSettings({ ...this.library.settings(), filters: { ...this.library.settings().filters } });
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
    if (this.editingBook()?.id === book.id) this.editingBook.set({ ...book, coverDataUrl: data });
  }

  progress(book: ArcaneBook): number {
    return book.pages ? Math.min(100, Math.round((book.currentPage / book.pages) * 100)) : 0;
  }

  readingDays(book: ArcaneBook): number | null {
    if (!book.startedAt) return null;
    const start = this.parseLocalDate(book.startedAt);
    const end = book.finishedAt ? this.parseLocalDate(book.finishedAt) : new Date();
    const elapsed = Math.floor((this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) / 86_400_000);
    return Math.max(1, elapsed + 1);
  }

  genreCount(genre: string): number {
    return this.filteredBooks().filter((book) => this.selectedGenres(book).includes(genre)).length;
  }

  genreBarWidth(genre: string): number {
    const max = Math.max(1, ...this.genres().map((item) => this.genreCount(item)));
    return (this.genreCount(genre) / max) * 100;
  }

  selectedGenres(book: ArcaneBook): string[] {
    return [...new Set([book.genre, ...book.subgenres].filter((genre) => genre && genre !== 'Não definido'))];
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
