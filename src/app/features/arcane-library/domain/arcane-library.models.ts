export type BookStatus = 'wishlist' | 'planned' | 'reading' | 'finished' | 'abandoned';
export type BookFormat = 'physical' | 'kindle' | 'audiobook' | 'pdf';
export type LibraryView = 'gallery' | 'list' | 'table' | 'shelf' | 'timeline';

export interface ArcaneBook {
  id: string;
  profileId: string;
  collectionId: string | null;
  shelfId: string | null;
  title: string;
  subtitle: string;
  author: string;
  series: string;
  volume: number | null;
  language: string;
  genre: string;
  subgenres: string[];
  nationality: string;
  publisher: string;
  isbn: string;
  format: BookFormat;
  pages: number;
  currentPage: number;
  publicationYear: number | null;
  purchaseDate: string | null;
  price: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: BookStatus;
  rating: number | null;
  favorite: boolean;
  reread: boolean;
  tags: string[];
  notes: string;
  coverDataUrl: string | null;
  color: string;
  plannedMonth: string | null;
  priority: 1 | 2 | 3 | 4 | 5;
  difficultyMultiplier: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingLog {
  id: string;
  profileId: string;
  bookId: string;
  date: string;
  startedAt: number;
  minutes: number;
  startPage: number;
  endPage: number;
  mood: number | null;
  energy: number | null;
  location: string;
  notes: string;
  quotes: string[];
  favoritePassages: string[];
  music: string;
  xpEarned: number;
  goldEarned: number;
}

export interface LibraryGroup {
  id: string;
  profileId: string;
  parentId: string | null;
  kind: 'collection' | 'shelf';
  title: string;
  color: string;
  createdAt: number;
}

export interface ReadingDailyAggregate {
  id: string;
  profileId: string;
  date: string;
  minutes: number;
  pages: number;
  sessions: number;
  xp: number;
  gold: number;
  bookMinutes: Record<string, number>;
}

export interface ReadingChallenge {
  id: string;
  profileId: string;
  title: string;
  metric: 'books' | 'pages' | 'minutes' | 'streak';
  target: number;
  progress: number;
  xpReward: number;
  goldReward: number;
  completedAt: number | null;
}

export interface LibrarySettings {
  id: string;
  profileId: string;
  view: LibraryView;
  filters: {
    year: string;
    status: string;
    genre: string;
    format: string;
    favorite: boolean;
  };
  annualGoal: number;
}
