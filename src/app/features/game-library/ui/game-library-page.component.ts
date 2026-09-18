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
import { GameLibraryService } from '../application/game-library.service';
import {
  LibraryGame,
  GamePlatform,
  GameStatus,
  GameLibraryGroup,
  GameLibraryView,
} from '../domain/game-library.models';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';
import { promptDialog } from '../../../util/native-dialogs';

const PLATFORM_LABELS: Record<GamePlatform, string> = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  switch: 'Switch',
  mobile: 'Mobile',
  other: 'Outra',
};

@Component({
  selector: 'game-library-page',
  standalone: true,
  imports: [FormsModule, MatIcon, CharacterRendererComponent],
  templateUrl: './game-library-page.component.html',
  styleUrl: './game-library-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GameLibraryService],
})
export class GameLibraryPageComponent implements OnInit {
  readonly library = inject(GameLibraryService);
  readonly profile = inject(RpgProfileService);
  readonly selectedCharacterId = signal(this.profile.activeCharacterId());
  readonly tab = signal<'dashboard' | 'library' | 'calendar' | 'planning' | 'challenges'>(
    'dashboard',
  );
  readonly selectedGame = signal<LibraryGame | null>(null);
  readonly editingGame = signal<LibraryGame | null>(null);
  readonly calendarPickerDate = signal<string | null>(null);
  readonly today = this.localDateKey(new Date());
  readonly selectedCollectionId = signal<string | null>(null);
  readonly selectedShelfId = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly calendarMonth = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  readonly platformOptions: GamePlatform[] = [
    'pc',
    'playstation',
    'xbox',
    'switch',
    'mobile',
    'other',
  ];
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
      const games = Object.entries(aggregate?.gameMinutes ?? {})
        .map(([gameId, minutes]) => {
          const game = this.library.games().find((candidate) => candidate.id === gameId);
          return game
            ? { id: game.id, title: game.title, color: game.color, minutes }
            : null;
        })
        .filter(
          (game): game is { id: string; title: string; color: string; minutes: number } =>
            !!game,
        );
      return {
        key,
        day: date.getDate(),
        currentMonth: date.getMonth() === month,
        today: key === this.localDateKey(now),
        minutes: aggregate?.minutes ?? 0,
        sessions: aggregate?.sessions ?? 0,
        games,
      };
    });
  });
  readonly calendarLabel = computed(() =>
    this.calendarMonth().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );
  readonly filteredGames = computed(() => {
    const filters = this.library.settings().filters;
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .games()
      .filter(
        (game) =>
          (game.status === 'playing' || game.status === 'finished') &&
          (!query ||
            `${game.title} ${game.developer} ${game.series}`
              .toLocaleLowerCase('pt-BR')
              .includes(query)) &&
          (!this.selectedCollectionId() ||
            game.collectionId === this.selectedCollectionId()) &&
          (!this.selectedShelfId() || game.shelfId === this.selectedShelfId()) &&
          (!filters.genre || this.selectedGenres(game).includes(filters.genre)) &&
          (!filters.platform ||
            game.platforms.includes(filters.platform as GamePlatform)) &&
          (!filters.favorite || game.favorite) &&
          (!filters.year ||
            String(game.finishedAt ?? game.startedAt ?? '').startsWith(filters.year)),
      );
  });
  readonly inProgressGames = computed(() =>
    this.filteredGames().filter((game) => game.status === 'playing'),
  );
  readonly completedGames = computed(() =>
    this.filteredGames().filter((game) => game.status === 'finished'),
  );
  readonly visibleWishlistGames = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .games()
      .filter(
        (game) =>
          ['wishlist', 'planned'].includes(game.status) &&
          (!query ||
            `${game.title} ${game.developer}`.toLocaleLowerCase('pt-BR').includes(query)),
      );
  });
  readonly wishlistGames = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('pt-BR');
    return this.library
      .wishlist()
      .filter(
        (game) =>
          (!query ||
            `${game.title} ${game.developer}`
              .toLocaleLowerCase('pt-BR')
              .includes(query)) &&
          (!this.selectedCollectionId() ||
            game.collectionId === this.selectedCollectionId()) &&
          (!this.selectedShelfId() || game.shelfId === this.selectedShelfId()),
      );
  });
  readonly genres = computed(() =>
    [
      ...new Set(this.library.games().flatMap((game) => this.selectedGenres(game))),
    ].sort(),
  );
  readonly genreOptions = [
    'Ação',
    'Aventura',
    'RPG',
    'Estratégia',
    'Simulação',
    'Esporte',
    'Corrida',
    'Luta',
    'Terror',
    'Puzzle',
    'Plataforma',
    'Mundo aberto',
    'Indie',
    'Multiplayer',
  ];
  readonly monthlyPlan = computed(() => [
    {
      key: '',
      label: 'Sem mês',
      games: this.library.wishlist().filter((game) => !game.plannedMonth),
      count: this.library.wishlist().filter((game) => !game.plannedMonth).length,
    },
    ...Array.from({ length: 12 }, (_, month) => {
      const key = `${new Date().getFullYear()}-${String(month + 1).padStart(2, '0')}`;
      const games = this.library.games().filter((game) => game.plannedMonth === key);
      return {
        key,
        label: new Date(2026, month, 1).toLocaleDateString('pt-BR', { month: 'long' }),
        games,
        count: games.length,
      };
    }),
  ]);
  readonly monthlyAverage = computed(
    () =>
      this.monthlyPlan()
        .slice(1)
        .reduce((sum, month) => sum + month.count, 0) / 12,
  );
  readonly playingDaysCount = computed(
    () => this.library.aggregates().filter((row) => row.minutes > 0).length,
  );
  readonly monthlyPlaytimeHistory = computed(() => {
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

  newTitle = '';
  newDeveloper = '';
  newCollectionId = '';
  newStatus: GameStatus = 'wishlist';
  collectionTitle = '';
  shelfTitle = '';
  shelfCollectionId = '';
  sessionMinutes = 30;
  sessionNotes = '';
  sessionPercent = 0;
  sessionDate = this.localDateKey(new Date());
  challengeTitle = '';
  challengeMetric: 'games' | 'minutes' | 'streak' = 'games';
  challengeTarget = 10;

  async ngOnInit(): Promise<void> {
    await this.library.load(this.selectedCharacterId());
  }

  async selectCharacter(characterId: string): Promise<void> {
    if (!characterId || characterId === this.selectedCharacterId()) return;
    this.selectedCharacterId.set(characterId);
    this.selectedGame.set(null);
    this.editingGame.set(null);
    this.selectedCollectionId.set(null);
    this.selectedShelfId.set(null);
    await this.library.load(characterId);
  }

  async createGame(): Promise<void> {
    if (!this.newTitle.trim()) return;
    await this.library.createGame({
      title: this.newTitle,
      developer: this.newDeveloper,
      status: this.newStatus,
      collectionId: this.newCollectionId || null,
    });
    this.newTitle = '';
    this.newDeveloper = '';
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

  async moveGameToMonth(game: LibraryGame, month: string): Promise<void> {
    await this.library.updateGame({ ...game, plannedMonth: month || null });
  }

  dragGame(event: DragEvent, game: LibraryGame): void {
    event.dataTransfer?.setData('text/game-id', game.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  allowGameDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async dropGame(event: DragEvent, month: string): Promise<void> {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/game-id');
    const game = this.library.games().find((row) => row.id === id);
    if (game) await this.moveGameToMonth(game, month);
  }

  async dropGameOnStatus(event: DragEvent, status: LibraryGame['status']): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer?.getData('text/game-id');
    const game = this.library.games().find((row) => row.id === id);
    if (game && game.status !== status) await this.changeGameStatus(game, status);
  }

  async changeGameStatus(
    game: LibraryGame,
    status: LibraryGame['status'],
  ): Promise<void> {
    await this.library.updateGame({
      ...game,
      status,
      startedAt:
        status === 'playing'
          ? game.startedAt || this.localDateKey(new Date())
          : game.startedAt,
      finishedAt:
        status === 'finished' ? game.finishedAt || this.localDateKey(new Date()) : null,
      completionPercent: status === 'finished' ? 100 : game.completionPercent,
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

  collectionGamesCount(collectionId: string): number {
    return this.library.games().filter((game) => game.collectionId === collectionId)
      .length;
  }

  shelvesForCollection(collectionId: string | null): GameLibraryGroup[] {
    return this.library
      .groups()
      .filter((group) => group.kind === 'shelf' && group.parentId === collectionId);
  }

  gameCollectionChanged(game: LibraryGame, collectionId: string): void {
    game.collectionId = collectionId || null;
    if (
      !this.shelvesForCollection(game.collectionId).some(
        (shelf) => shelf.id === game.shelfId,
      )
    ) {
      game.shelfId = null;
    }
  }

  openGame(game: LibraryGame): void {
    this.selectedGame.set(game);
    this.sessionMinutes = 30;
    this.sessionNotes = '';
    this.sessionPercent = game.completionPercent;
    this.sessionDate = this.localDateKey(new Date());
  }

  startPlaySession(game: LibraryGame, event?: Event): void {
    event?.stopPropagation();
    this.openGame(game);
  }

  openCalendarDayLog(day: { key: string }): void {
    this.calendarPickerDate.set(day.key);
  }

  pickGameForCalendarDay(gameId: string, date: string): void {
    const game = this.library.games().find((candidate) => candidate.id === gameId);
    this.calendarPickerDate.set(null);
    if (!game) return;
    this.openGame(game);
    this.sessionDate = date;
  }

  editGame(game: LibraryGame, event?: Event): void {
    event?.stopPropagation();
    this.editingGame.set(structuredClone(game));
  }

  async saveGame(): Promise<void> {
    const game = this.editingGame();
    if (!game) return;
    await this.library.updateGame(game);
    this.editingGame.set(null);
  }

  async syncGameDates(game: LibraryGame, status: GameStatus): Promise<void> {
    const today = this.localDateKey(new Date());
    const wasFinished = game.status === 'finished';
    game.status = status;
    if (status === 'playing') {
      game.startedAt ??= today;
      game.finishedAt = null;
    } else if (status === 'finished') {
      game.startedAt ??= today;
      game.finishedAt ??= today;
      game.completionPercent = 100;
    } else if (status === 'wishlist' || status === 'planned') {
      game.startedAt = null;
      game.finishedAt = null;
    } else {
      game.finishedAt = null;
    }
    // Marking a game done straight from this selector (rather than through
    // "Registrar sessão") means no playtime was ever logged for it - ask for
    // the final push's minutes so it still shows up on the heatmap, instead
    // of silently completing with zero recorded time.
    if (status === 'finished' && !wasFinished) {
      const answer = promptDialog(
        `Quantos minutos você jogou até terminar "${game.title}"?`,
        '30',
      );
      const minutes = answer ? Math.round(Number(answer)) : 0;
      if (minutes > 0) {
        const finishedAt = game.finishedAt ?? today;
        await this.library.addSession(
          game,
          minutes,
          '',
          100,
          this.combineDateWithTimeOf(finishedAt, new Date()),
        );
      }
    }
  }

  async saveSession(): Promise<void> {
    const game = this.selectedGame();
    if (!game) return;
    await this.library.addSession(
      game,
      this.sessionMinutes,
      this.sessionNotes,
      this.sessionPercent,
      this.sessionDateTimestamp(),
    );
    this.selectedGame.set(null);
    this.sessionNotes = '';
  }

  async setView(view: GameLibraryView): Promise<void> {
    await this.library.saveSettings({ ...this.library.settings(), view });
  }

  async persistFilters(): Promise<void> {
    await this.library.saveSettings({
      ...this.library.settings(),
      filters: { ...this.library.settings().filters },
    });
  }

  heatLevel(minutes: number): number {
    if (!minutes) return 0;
    if (minutes < 20) return 1;
    if (minutes < 45) return 2;
    if (minutes < 90) return 3;
    return 4;
  }

  planLoad(count: number): 'light' | 'balanced' | 'heavy' {
    const average = this.monthlyAverage();
    if (!count || count < average * 0.8) return 'light';
    if (count <= average * 1.25) return 'balanced';
    return 'heavy';
  }

  async coverSelected(event: Event, game: LibraryGame): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await this.library.updateGame({ ...game, coverDataUrl: data });
    if (this.editingGame()?.id === game.id)
      this.editingGame.set({ ...game, coverDataUrl: data });
  }

  minutesPlayed(game: LibraryGame): number {
    return this.library.gameMinutesTotals().get(game.id) ?? 0;
  }

  hoursPlayedLabel(game: LibraryGame): string {
    return (this.minutesPlayed(game) / 60).toFixed(1);
  }

  playingDays(game: LibraryGame): number | null {
    if (!game.startedAt) return null;
    const start = this.parseLocalDate(game.startedAt);
    const end = game.finishedAt ? this.parseLocalDate(game.finishedAt) : new Date();
    const elapsed = Math.floor(
      (this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) / 86_400_000,
    );
    return Math.max(1, elapsed + 1);
  }

  genreCount(genre: string): number {
    return this.filteredGames().filter((game) =>
      this.selectedGenres(game).includes(genre),
    ).length;
  }

  genreBarWidth(genre: string): number {
    const max = Math.max(1, ...this.genres().map((item) => this.genreCount(item)));
    return (this.genreCount(genre) / max) * 100;
  }

  selectedGenres(game: LibraryGame): string[] {
    return [
      ...new Set(
        [game.genre, ...game.subgenres].filter(
          (genre) => genre && genre !== 'Não definido',
        ),
      ),
    ];
  }

  toggleGenre(game: LibraryGame, genre: string): void {
    const selected = new Set(this.selectedGenres(game));
    selected.has(genre) ? selected.delete(genre) : selected.add(genre);
    const genres = [...selected];
    game.genre = genres[0] ?? 'Não definido';
    game.subgenres = genres.slice(1);
  }

  togglePlatform(game: LibraryGame, platform: GamePlatform): void {
    const selected = new Set(game.platforms);
    selected.has(platform) ? selected.delete(platform) : selected.add(platform);
    game.platforms = [...selected];
  }

  platformLabel(platform: GamePlatform): string {
    return PLATFORM_LABELS[platform];
  }

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

  private sessionDateTimestamp(): number {
    return this.combineDateWithTimeOf(this.sessionDate, new Date());
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
