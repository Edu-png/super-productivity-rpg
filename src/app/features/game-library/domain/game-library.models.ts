export type GameStatus = 'wishlist' | 'planned' | 'playing' | 'finished' | 'abandoned';
export type GamePlatform = 'pc' | 'playstation' | 'xbox' | 'switch' | 'mobile' | 'other';
export type GameLibraryView = 'gallery' | 'list' | 'table' | 'shelf' | 'timeline';

export interface LibraryGame {
  id: string;
  profileId: string;
  collectionId: string | null;
  shelfId: string | null;
  title: string;
  subtitle: string;
  developer: string;
  series: string;
  volume: number | null;
  language: string;
  genre: string;
  subgenres: string[];
  publisher: string;
  platforms: GamePlatform[];
  releaseYear: number | null;
  purchaseDate: string | null;
  price: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: GameStatus;
  rating: number | null;
  favorite: boolean;
  tags: string[];
  notes: string;
  coverDataUrl: string | null;
  color: string;
  plannedMonth: string | null;
  priority: 1 | 2 | 3 | 4 | 5;
  difficultyMultiplier: number;
  completionPercent: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlaySession {
  id: string;
  profileId: string;
  gameId: string;
  date: string;
  startedAt: number;
  minutes: number;
  notes: string;
  xpEarned: number;
  goldEarned: number;
}

export interface GameLibraryGroup {
  id: string;
  profileId: string;
  parentId: string | null;
  kind: 'collection' | 'shelf';
  title: string;
  color: string;
  coverDataUrl: string | null;
  createdAt: number;
}

export interface GameDailyAggregate {
  id: string;
  profileId: string;
  date: string;
  minutes: number;
  sessions: number;
  xp: number;
  gold: number;
  gameMinutes: Record<string, number>;
}

export interface GameChallenge {
  id: string;
  profileId: string;
  title: string;
  metric: 'games' | 'minutes' | 'streak';
  target: number;
  progress: number;
  xpReward: number;
  goldReward: number;
  completedAt: number | null;
}

export interface GameLibrarySettings {
  id: string;
  profileId: string;
  view: GameLibraryView;
  filters: {
    year: string;
    status: string;
    genre: string;
    platform: string;
    favorite: boolean;
  };
  annualGoal: number;
}
