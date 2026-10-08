/** Kanban columns, in board order. Moving a card to `done` marks its task as done. */
export const WORK_COLUMNS = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'A fazer' },
  { id: 'doing', title: 'Em andamento' },
  { id: 'review', title: 'Revisão' },
  { id: 'done', title: 'Concluído' },
] as const;

export type WorkColumnId = (typeof WORK_COLUMNS)[number]['id'];

/** GitHub-style urgency labels. */
export const WORK_PRIORITIES = [
  { id: 'urgent', label: 'Urgente', color: '#e5484d' },
  { id: 'high', label: 'Alta', color: '#f08a24' },
  { id: 'medium', label: 'Média', color: '#e0b33a' },
  { id: 'low', label: 'Baixa', color: '#5b8be0' },
] as const;

export type WorkPriority = (typeof WORK_PRIORITIES)[number]['id'];

/** A company/client the work belongs to. */
export interface WorkCompany {
  id: string;
  name: string;
  color: string;
}

/** Board data for one task; estimate and deadline live on the task itself. */
/** A project inside a company; cards of its linked repos join it automatically. */
export interface WorkProject {
  id: string;
  companyId: string;
  name: string;
  description: string;
  /** GitHub/GitLab issue providers (repos) whose tasks belong to this project. */
  issueProviderIds: string[];
}

/** meta.projectId value that keeps a card out of any project, even a linked repo's. */
export const NO_PROJECT = 'none';

export interface WorkCardMeta {
  taskId: string;
  columnId: WorkColumnId;
  order: number;
  companyId?: string;
  /** Project id, or NO_PROJECT; unset = the project linked to the card's repo, if any. */
  projectId?: string;
  priority?: WorkPriority;
  /** Created in this tab (not imported from GitHub/GitLab). */
  isManual?: boolean;
  /** Removed from the board; the task itself is kept. */
  isHidden?: boolean;
  /** Academia Arcana topics the AI tied to this card. */
  academyLinks?: WorkAcademyLink[];
}

export interface WorkAcademyLink {
  nodeId: string;
  title: string;
  reason: string;
}

/** A finished card, kept even after its task is archived (heatmap / daily minutes). */
export interface WorkDoneEntry {
  /** YYYY-MM-DD the task was finished. */
  day: string;
  title: string;
  estimateMin: number;
  /** Time actually tracked on the task, in minutes. */
  spentMin?: number;
  companyId?: string;
  projectId?: string;
  priority?: WorkPriority;
}

/** Tracked minutes per day of one card, kept after the task is archived (timesheet). */
export interface WorkTimeEntry {
  title: string;
  companyId?: string;
  projectId?: string;
  minutesByDay: Record<string, number>;
}

/** End-of-day state of the board, for the work missions. */
export interface WorkDailySnapshot {
  reviewCount: number;
  urgentOpen: number;
}

export interface WorkChatMessage {
  id: string;
  question: string;
  answer: string;
  at: number;
}

/** One character's board. */
export interface WorkAgendaBoard {
  profileId: string;
  companies: WorkCompany[];
  projects?: WorkProject[];
  cards: Record<string, WorkCardMeta>;
  /** Finished cards by task id. */
  doneLog?: Record<string, WorkDoneEntry>;
  /** Latest AI implementation suggestions, by project id. */
  suggestions?: Record<string, WorkSuggestionSet>;
  /** Tracked time per card (task id). */
  timeLog?: Record<string, WorkTimeEntry>;
  /** Board state per day (YYYY-MM-DD). */
  dailySnapshots?: Record<string, WorkDailySnapshot>;
  /** Days the "Revisão" column was emptied. */
  reviewClearedDays?: string[];
  /** Questions asked to each project, by project id. */
  projectChats?: Record<string, WorkChatMessage[]>;
  updatedAt: number;
}

/** An implementation idea Gemini derived from a company's cards and notes. */
export interface WorkSuggestion {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  effort: 'baixo' | 'médio' | 'alto';
  /** Titles of the cards it builds on. */
  relatedCards: string[];
}

export interface WorkSuggestionSet {
  generatedAt: number;
  items: WorkSuggestion[];
}

/** Daily goal of estimated work, in minutes (6h). */
export const WORK_DAILY_GOAL_MIN = 360;

export interface WorkAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  /** Text read from the image/PDF (Gemini), used by the search. */
  ocrText?: string;
  ocrError?: string;
}

/** A dated note on a card, with photos/files. */
export interface WorkNote {
  id: string;
  profileId: string;
  taskId: string;
  /** YYYY-MM-DD */
  day: string;
  text: string;
  attachments: WorkAttachment[];
  createdAt: number;
  updatedAt: number;
}

/** What goes into the character backup. */
export interface WorkAgendaSnapshot {
  board?: WorkAgendaBoard;
  notes: WorkNote[];
}

export const WORK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Card templates: urgency plus a checklist written as the first note. */
export const WORK_TEMPLATES: Array<{
  id: string;
  label: string;
  priority?: WorkPriority;
  checklist: string[];
}> = [
  {
    id: 'bug',
    label: 'Bug',
    priority: 'high',
    checklist: [
      'Reproduzir o problema e anotar os passos',
      'Comportamento esperado x atual',
      'Achar a causa (logs, stack trace)',
      'Corrigir e escrever teste que cobre o caso',
      'Validar em homologação',
      'Atualizar a issue e avisar quem reportou',
    ],
  },
  {
    id: 'feature',
    label: 'Feature',
    priority: 'medium',
    checklist: [
      'Entender o requisito e os critérios de aceite',
      'Desenhar a solução (dados, API, telas)',
      'Implementar',
      'Testes automatizados',
      'Documentar / atualizar README',
      'Abrir PR e pedir revisão',
    ],
  },
  {
    id: 'review',
    label: 'Code review',
    checklist: [
      'Ler a descrição do PR e a issue ligada',
      'Rodar localmente / conferir CI',
      'Lógica e casos de borda',
      'Testes cobrem a mudança',
      'Nomes, legibilidade e duplicação',
      'Aprovar ou pedir mudanças com comentários claros',
    ],
  },
  {
    id: 'meeting',
    label: 'Reunião',
    checklist: [
      'Pauta',
      'Decisões tomadas',
      'Próximos passos e responsáveis',
      'Prazos combinados',
    ],
  },
];
