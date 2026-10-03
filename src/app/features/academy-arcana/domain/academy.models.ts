export type AcademyEntityId = string;
export type StudyNodeKind = 'folder' | 'course' | 'module' | 'topic' | 'subtopic';

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
  /**
   * What kind of material this item is (mind map, video, article...), separate
   * from `kind`, which is only its place in the folder > course > ... tree.
   * Absent on nodes created before categories existed.
   */
  category?: StudyNodeCategory;
  /** Kanban column - read it through studyNodeStatus(). */
  status?: StudyNodeStatus;
  /** Sorts ahead of `position`. Absent means 'medium'. */
  priority?: StudyNodePriority;
  /** Photos attached from disk (downscaled data URLs). */
  photos?: StudyNodePhoto[];
  /** Where this content was written down on paper: notebook + page range. */
  notebooks?: StudyNodeNotebookRef[];
  /** Quiz/exam grade, when there was one: score out of `max` (max optional). */
  quizScore?: { score: number; max: number | null; at?: number } | null;
}

/**
 * Quiz/exam grade as 0-100. Without a max, a score up to 10 is read as out of
 * 10 and anything larger as out of 100.
 */
export function quizScorePercent(node: StudyNode): number | null {
  const quiz = node.quizScore;
  if (!quiz || !Number.isFinite(quiz.score)) return null;
  const max = quiz.max && quiz.max > 0 ? quiz.max : quiz.score <= 10 ? 10 : 100;
  return Math.max(0, Math.min(100, (quiz.score / max) * 100));
}

export interface StudyNodePhoto {
  id: string;
  name: string;
  dataUrl: string;
  /** Text read from the photo by the AI (editable), used by the search. */
  text?: string;
}

export interface StudyNodeNotebookRef {
  id: string;
  notebook: string;
  fromPage: number | null;
  toPage: number | null;
}

export type StudyNodePriority = 'high' | 'medium' | 'low';

export const STUDY_NODE_PRIORITIES: Array<{ id: StudyNodePriority; label: string }> = [
  { id: 'high', label: 'Alta' },
  { id: 'medium', label: 'Média' },
  { id: 'low', label: 'Baixa' },
];

export function studyNodePriorityRank(node: StudyNode): number {
  return { high: 0, medium: 1, low: 2 }[node.priority ?? 'medium'];
}

export type StudyNodeStatus =
  | 'backlog'
  | 'studying'
  | 'reviewing'
  | 'studied'
  | 'completed'
  | 'paused';

export const STUDY_NODE_STATUSES: Array<{
  id: StudyNodeStatus;
  label: string;
  icon: string;
}> = [
  { id: 'backlog', label: 'Backlog', icon: 'inventory_2' },
  { id: 'studying', label: 'Estudando', icon: 'auto_stories' },
  { id: 'reviewing', label: 'Revisando', icon: 'replay' },
  { id: 'studied', label: 'Estudado', icon: 'task_alt' },
  { id: 'completed', label: 'Completo', icon: 'workspace_premium' },
  { id: 'paused', label: 'Parado', icon: 'pause_circle' },
];

/** Stored column, falling back to 'completed'/'backlog' for older nodes. */
export function studyNodeStatus(node: StudyNode): StudyNodeStatus {
  return node.status ?? (node.completedAt ? 'completed' : 'backlog');
}

export type StudyNodeCategory =
  | 'course'
  | 'mind-map'
  | 'video'
  | 'article'
  | 'book'
  | 'review'
  | 'quiz'
  | 'exam'
  | 'other';

export interface StudyNodeCategoryInfo {
  id: StudyNodeCategory;
  label: string;
  icon: string;
  /** Higher comes first in the due-review queue. */
  reviewPriority: number;
  /**
   * Scales the interval until the next topic review. Below 1 brings the item
   * back more often - used for mind maps, which recap a whole subject at once.
   */
  reviewIntervalFactor: number;
}

export const STUDY_NODE_CATEGORIES: StudyNodeCategoryInfo[] = [
  {
    id: 'course',
    label: 'Curso',
    icon: 'school',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
  {
    id: 'mind-map',
    label: 'Mapa mental',
    icon: 'account_tree',
    reviewPriority: 3,
    reviewIntervalFactor: 0.7,
  },
  {
    id: 'review',
    label: 'Revisão',
    icon: 'history_edu',
    reviewPriority: 2,
    reviewIntervalFactor: 0.85,
  },
  {
    id: 'video',
    label: 'Vídeo',
    icon: 'smart_display',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
  {
    id: 'article',
    label: 'Artigo',
    icon: 'article',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
  {
    id: 'book',
    label: 'Livro',
    icon: 'menu_book',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: 'quiz',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
  {
    id: 'exam',
    label: 'Prova',
    icon: 'assignment',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
  {
    id: 'other',
    label: 'Outro',
    icon: 'category',
    reviewPriority: 1,
    reviewIntervalFactor: 1,
  },
];

export function studyNodeCategoryInfo(
  category: StudyNodeCategory | undefined,
): StudyNodeCategoryInfo | null {
  return STUDY_NODE_CATEGORIES.find((item) => item.id === category) ?? null;
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
  /**
   * Every loss of focus logged during this block, one entry each. Absent on
   * sessions created before distraction tracking existed (they're left out of
   * the distraction stats instead of counting as zero).
   */
  distractions?: StudyDistraction[];
}

export interface StudyDistraction {
  id: string;
  at: number;
  category: string;
  /** Free-text reason, e.g. "vi notificação do WhatsApp". */
  note: string;
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
  // Minutes from sessions logged with no specific topic (nodeId), tracked
  // separately at write time so the tooltip can show them without having to
  // infer them from areaMinutes/nodeMinutes at display time - the node a
  // nodeMinutes entry belonged to may no longer exist (topic deleted), which
  // made that inference silently drop the deleted topic's minutes from the
  // subtraction and double-count them. Optional: absent on aggregates written
  // before this field existed.
  areaOnlyMinutes?: Record<string, number>;
  updatedAt: number;
}

export interface AcademySettings {
  id: string;
  profileId: string;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  monthlyGoalMinutes: number;
  reviewStepsDays: number[];
  /** Player-defined distraction categories; defaults apply when absent. */
  distractionCategories?: string[];
  updatedAt: number;
}

export interface AcademyDashboardSnapshot {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  totalMinutes: number;
  streak: number;
  pendingReviews: number;
  pendingTopicReviews: number;
  flashcardCount: number;
  learnedCards: number;
  accuracy: number;
  completedTopics: number;
  totalTopics: number;
  recentDays: DailyStudyAggregate[];
}

/**
 * Per-node spaced-repetition schedule ("adicionar à revisão"). Separate from
 * StudyNode itself (most nodes - folders, courses - never opt into review) and
 * separate from Flashcard's own scheduling (topic review = broad recall of a
 * whole topic; flashcards = specific facts - see academy-arcana spec §7).
 * One row per node, keyed by nodeId itself for simple upsert/lookup.
 */
export interface TopicReviewState extends SyncMetadata {
  id: AcademyEntityId; // === nodeId
  profileId: string;
  nodeId: AcademyEntityId;
  areaId: AcademyEntityId;
  addedAt: number;
  dueAt: number;
  stability: number;
  difficulty: number;
  lastReviewedAt: number | null;
  reviewCount: number;
  lapseCount: number;
}

export interface TopicReviewLog extends SyncMetadata {
  id: AcademyEntityId;
  profileId: string;
  nodeId: AcademyEntityId;
  reviewedAt: number;
  rating: 1 | 2 | 3 | 4;
  previousIntervalDays: number;
  nextIntervalDays: number;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyBefore: number;
  difficultyAfter: number;
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
    topicReviews: TopicReviewState[];
    topicReviewLogs: TopicReviewLog[];
  }>;
}
