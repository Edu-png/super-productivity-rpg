export type AcademyEntityId = string;
export type StudyNodeKind =
  | 'folder'
  | 'course'
  | 'module'
  | 'topic'
  | 'subtopic';

export interface SyncMetadata {
  createdAt: number;
  updatedAt: number;
  revision: number;
  deviceId: string;
  deletedAt: number | null;
}

export interface StudyArea extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  coverUrl: string | null;
  position: number;
}

export interface StudyNode extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  areaId: AcademyEntityId;
  parentId: AcademyEntityId | null;
  kind: StudyNodeKind;
  title: string;
  description: string;
  notesMarkdown?: string;
  links?: Array<{ label: string; url: string }>;
  drawing?: ExcalidrawDrawing | null;
  color: string;
  icon: string;
  coverUrl: string | null;
  position: number;
  difficulty: number;
  weight: number;
  completedAt: number | null;
}

export interface ExcalidrawDrawing {
  version: 1;
  ownerNodeId: AcademyEntityId;
  elements: unknown[];
  appState: {
    viewBackgroundColor?: string;
    gridSize?: number | null;
    theme?: 'light' | 'dark';
  };
  files: Record<string, unknown>;
  previewDataUrl: string | null;
  updatedAt: number;
}

export type StudyMaterialKind =
  | 'video'
  | 'pdf'
  | 'book'
  | 'link'
  | 'playlist'
  | 'article'
  | 'image'
  | 'code';

export interface StudyMaterial extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  nodeId: AcademyEntityId;
  title: string;
  kind: StudyMaterialKind;
  origin: string;
  url: string | null;
  notes: string;
}

export interface StudySession extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  characterId: string | null;
  projectId: string | null;
  areaId: AcademyEntityId;
  nodeId: AcademyEntityId | null;
  materialId: AcademyEntityId | null;
  title: string;
  scheduledStart: number | null;
  startedAt: number;
  endedAt: number | null;
  plannedMinutes: number;
  actualMinutes: number;
  priority: 1 | 2 | 3 | 4 | 5;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  notes: string;
  mood: number | null;
  energy: number | null;
  xpEarned: number;
  goldEarned: number;
  flashcardsReviewed: number;
}

export interface Flashcard extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  areaId: AcademyEntityId;
  nodeId: AcademyEntityId | null;
  deckId: string;
  parentDeckId: string | null;
  question: string;
  answer: string;
  tags: string[];
  media: { imageUrl?: string; audioUrl?: string };
  source: string;
  favorite: boolean;
  suspended: boolean;
  difficulty: number;
  stability: number;
  dueAt: number;
  lastReviewedAt: number | null;
  reviewCount: number;
  lapseCount: number;
}

export interface FlashcardReview extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  cardId: AcademyEntityId;
  sessionId: AcademyEntityId | null;
  reviewedAt: number;
  rating: 1 | 2 | 3 | 4;
  elapsedMs: number;
  previousIntervalDays: number;
  nextIntervalDays: number;
  retention: number;
}

export interface DailyStudyAggregate {
  id: string;
  profileId: string;
  date: string;
  totalMinutes: number;
  sessionCount: number;
  flashcardsReviewed: number;
  correctReviews: number;
  xpEarned: number;
  goldEarned: number;
  areaMinutes: Record<string, number>;
  nodeMinutes: Record<string, number>;
  projectMinutes: Record<string, number>;
  updatedAt: number;
}

export interface AcademySettings {
  id: string;
  profileId: string;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  monthlyGoalMinutes: number;
  reviewStepsDays: number[];
  updatedAt: number;
}

export interface AcademyDashboardSnapshot {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  totalMinutes: number;
  streak: number;
  pendingReviews: number;
  flashcardCount: number;
  learnedCards: number;
  accuracy: number;
  completedTopics: number;
  totalTopics: number;
  recentDays: DailyStudyAggregate[];
}

export interface AcademyBackup {
  format: 'academy-arcana';
  version: 1;
  exportedAt: number;
  domains: Partial<{
    studies: { areas: StudyArea[]; nodes: StudyNode[]; materials: StudyMaterial[] };
    sessions: StudySession[];
    flashcards: Flashcard[];
    reviews: FlashcardReview[];
    analytics: DailyStudyAggregate[];
    settings: AcademySettings[];
  }>;
}
