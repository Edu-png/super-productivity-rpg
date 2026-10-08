import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { PlannerActions } from '../planner/store/planner.actions';
import { Store } from '@ngrx/store';
import { TaskService } from '../tasks/task.service';
import { Task } from '../tasks/task.model';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { getDeadlineAutoPlanFields } from '../tasks/util/get-deadline-auto-plan-fields';
import { DateService } from '../../core/date/date.service';
import { RpgProfileService } from '../rpg-profile/rpg-profile.service';
import { GeminiService } from '../../core/ai/gemini.service';
import { getDbDateStr } from '../../util/get-db-date-str';
import { readFileAsShrunkDataUrl } from '../../util/shrink-image-data-url';
import { WorkAgendaRepository } from './work-agenda.repository';
import { AcademyIdbRepository } from '../academy-arcana/persistence/academy-idb.repository';
import { StudyArea, StudyNode } from '../academy-arcana/domain/academy.models';
import {
  WORK_ATTACHMENT_MAX_BYTES,
  WORK_COLUMNS,
  WORK_TEMPLATES,
  WorkAcademyLink,
  WorkChatMessage,
  WorkAgendaBoard,
  WorkAttachment,
  WorkCardMeta,
  WorkColumnId,
  WorkCompany,
  WorkNote,
  WorkProject,
  WorkSuggestion,
  NO_PROJECT,
} from './work-agenda.model';
import {
  buildSuggestionContext,
  cardColumn,
  cardCompanyId,
  cardProject,
  isBoardTask,
  addDays,
  isGitIssueTask,
  nextDailySnapshot,
  syncDoneLog,
  syncTimeLog,
  todayBlockTasks,
  workDayStats,
} from './work-agenda.util';

export interface WorkCard {
  task: Task;
  meta?: WorkCardMeta;
  column: WorkColumnId;
  company?: WorkCompany;
  project?: WorkProject;
  notes: WorkNote[];
  attachmentCount: number;
  source: 'github' | 'gitlab' | 'manual';
  parentTitle?: string;
}

const OCR_PROMPT =
  'Transcreva fielmente todo o texto deste arquivo (podem ser anotações de caderno ' +
  'escritas à mão). Mantenha as quebras de linha e o idioma original. Responda ' +
  'apenas com o texto transcrito; se não houver texto, responda com uma linha vazia.';

const COMPANY_COLORS = ['#5b8be0', '#e5484d', '#52df9d', '#f08a24', '#a77ae6', '#e0b33a'];

/**
 * Work board of the active character: GitHub/GitLab tasks plus manual cards,
 * with company, urgency, dated notes and attachments (OCR'd for search).
 * Estimate and deadline are stored on the task itself so the rest of the app
 * (schedule, planner) sees them too.
 */
@Injectable({ providedIn: 'root' })
export class WorkAgendaService {
  private readonly _repo = inject(WorkAgendaRepository);
  private readonly _taskService = inject(TaskService);
  private readonly _store = inject(Store);
  private readonly _dateService = inject(DateService);
  private readonly _profile = inject(RpgProfileService);
  private readonly _gemini = inject(GeminiService);
  private readonly _academyRepo = inject(AcademyIdbRepository);

  /** Academia Arcana topics (no folders) of the active character, for linking cards. */
  readonly academyTopics = signal<{ id: string; title: string; areaTitle: string }[]>([]);

  private readonly _tasks = toSignal(this._taskService.allTasks$, { initialValue: [] });
  readonly board = signal<WorkAgendaBoard | null>(null);
  readonly notes = signal<WorkNote[]>([]);
  readonly ocrRunning = signal<Set<string>>(new Set());

  readonly companies = computed(() => this.board()?.companies ?? []);
  readonly projects = computed(() => this.board()?.projects ?? []);

  readonly cards = computed<WorkCard[]>(() => {
    const board = this.board();
    if (!board) return [];
    const tasks = this._tasks();
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const notesByTask = new Map<string, WorkNote[]>();
    for (const note of this.notes()) {
      notesByTask.set(note.taskId, [...(notesByTask.get(note.taskId) ?? []), note]);
    }
    return tasks
      .filter((task) => isBoardTask(task, board.cards))
      .map((task) => {
        const meta = board.cards[task.id];
        const project = cardProject(task, meta, board.projects ?? []);
        const companyId = cardCompanyId(meta, project);
        const notes = (notesByTask.get(task.id) ?? []).sort((a, b) =>
          b.day.localeCompare(a.day),
        );
        return {
          task,
          meta,
          column: cardColumn(task, meta),
          company: board.companies.find((company) => company.id === companyId),
          project,
          notes,
          attachmentCount: notes.reduce((sum, note) => sum + note.attachments.length, 0),
          source: isGitIssueTask(task)
            ? /gitlab/i.test(task.issueType ?? '')
              ? 'gitlab'
              : 'github'
            : 'manual',
          parentTitle: task.parentId ? byId.get(task.parentId)?.title : undefined,
        };
      });
  });

  /** Blocks of today a card can be added to as a subtask. */
  readonly todayBlocks = computed(() =>
    todayBlockTasks(this._tasks(), this._dateService.todayStr(), (ms) =>
      getDbDateStr(ms),
    ),
  );

  constructor() {
    effect(() => {
      const profileId = this._profile.activeCharacterId();
      untracked(() => void this._load(profileId));
    });
    // Keeps the board's history up to date: finished cards (with real time and
    // urgency), tracked time per day (timesheet) and today's board state
    // (work missions). Each survives the tasks being archived.
    effect(() => {
      const board = this.board();
      const cards = this.cards();
      if (!board) return;
      const doneLog = syncDoneLog(
        board.doneLog ?? {},
        cards.map((card) => ({
          taskId: card.task.id,
          isDone: card.task.isDone,
          doneOn: card.task.doneOn,
          title: card.task.title,
          estimateMs: card.task.timeEstimate ?? 0,
          spentMs: card.task.timeSpent ?? 0,
          companyId: card.company?.id,
          projectId: card.project?.id,
          priority: card.meta?.priority,
        })),
        (ms) => getDbDateStr(ms),
      );
      const timeLog = syncTimeLog(
        board.timeLog ?? {},
        cards.map((card) => ({
          taskId: card.task.id,
          title: card.task.title,
          companyId: card.company?.id,
          projectId: card.project?.id,
          timeSpentOnDay: card.task.timeSpentOnDay,
        })),
      );
      // An empty card list is most likely tasks still loading - never record it.
      const snapshot = cards.length
        ? nextDailySnapshot(
            board.dailySnapshots ?? {},
            board.reviewClearedDays ?? [],
            this._dateService.todayStr(),
            {
              reviewCount: cards.filter((card) => card.column === 'review').length,
              urgentOpen: cards.filter(
                (card) => !card.task.isDone && card.meta?.priority === 'urgent',
              ).length,
            },
          )
        : null;
      if (doneLog === board.doneLog && timeLog === board.timeLog && !snapshot) return;
      untracked(() =>
        this._saveBoard((b) => ({
          ...b,
          doneLog,
          timeLog,
          ...(snapshot
            ? {
                dailySnapshots: snapshot.snapshots,
                reviewClearedDays: snapshot.clearedDays,
              }
            : {}),
        })),
      );
    });
    // Work facts per day for the RPG's automatic work missions.
    effect(() => {
      const board = this.board();
      if (!board) return;
      const today = this._dateService.todayStr();
      const stats = workDayStats(
        board.doneLog ?? {},
        board.dailySnapshots ?? {},
        board.reviewClearedDays ?? [],
        addDays(today, -400),
        today,
      );
      untracked(() => this._profile.setWorkDayStats(board.profileId, stats));
    });
  }

  private async _load(profileId: string): Promise<void> {
    const [{ board, notes }, nodes, areas] = await Promise.all([
      this._repo.load(profileId),
      this._academyRepo.listNodes(profileId).catch((): StudyNode[] => []),
      this._academyRepo.listAreas(profileId).catch((): StudyArea[] => []),
    ]);
    // A quicker switch to another character may have finished loading first.
    if (profileId !== this._profile.activeCharacterId()) return;
    const areaTitle = new Map(areas.map((area) => [area.id, area.title]));
    this.academyTopics.set(
      nodes
        .filter((node) => node.kind !== 'folder')
        .map((node) => ({
          id: node.id,
          title: node.title,
          areaTitle: areaTitle.get(node.areaId) ?? '',
        })),
    );
    this.board.set(board ?? { profileId, companies: [], cards: {}, updatedAt: 0 });
    this.notes.set(notes);
  }

  private _saveBoard(change: (board: WorkAgendaBoard) => WorkAgendaBoard): void {
    const current = this.board();
    if (!current) return;
    const next = { ...change(current), updatedAt: Date.now() };
    this.board.set(next);
    void this._repo.putBoard(next);
  }

  private _patchCard(taskId: string, patch: Partial<WorkCardMeta>): void {
    this._saveBoard((board) => {
      const meta = board.cards[taskId] ?? {
        taskId,
        columnId: 'backlog',
        order: Date.now(),
      };
      return { ...board, cards: { ...board.cards, [taskId]: { ...meta, ...patch } } };
    });
  }

  // ---- cards ----

  /** A template adds its urgency and writes its checklist as the first note. */
  addManualCard(title: string, companyId?: string, templateId?: string): string | null {
    if (!title.trim()) return null;
    const template = WORK_TEMPLATES.find((item) => item.id === templateId);
    const taskId = this._taskService.add(title.trim());
    this._patchCard(taskId, {
      columnId: 'todo',
      order: Date.now(),
      companyId,
      isManual: true,
      ...(template?.priority ? { priority: template.priority } : {}),
    });
    if (template) {
      void this.addNote(
        taskId,
        getDbDateStr(),
        `${template.label} - checklist\n${template.checklist.map((item) => `☐ ${item}`).join('\n')}`,
        [],
      );
    }
    return taskId;
  }

  /** Plans the card's task for a day in the app's planner (so it also shows in "Hoje"). */
  async planForDay(taskId: string, day: string): Promise<void> {
    const task =
      this._tasks().find((item) => item.id === taskId) ??
      (await firstValueFrom(this._taskService.getByIdOnce$(taskId)));
    if (!task) return;
    this._store.dispatch(PlannerActions.planTaskForDay({ task, day }));
  }

  /** New card planned straight for `day` (daily list). */
  async addTaskForDay(
    title: string,
    day: string,
    companyId?: string,
    estimateMinutes?: number,
  ): Promise<void> {
    const taskId = this.addManualCard(title, companyId);
    if (!taskId) return;
    if (estimateMinutes) this.setEstimate(taskId, estimateMinutes);
    await this.planForDay(taskId, day);
  }

  /** Drops a card into a column at `index`, renumbering that column; "Concluído" marks the task done. */
  moveCard(taskId: string, columnId: WorkColumnId, orderedIds: string[]): void {
    const card = this.cards().find((item) => item.task.id === taskId);
    if (!card) return;
    this._saveBoard((board) => {
      const cards = { ...board.cards };
      orderedIds.forEach((id, order) => {
        const meta = cards[id] ?? { taskId: id, columnId, order };
        cards[id] = { ...meta, order, ...(id === taskId ? { columnId } : {}) };
      });
      return { ...board, cards };
    });
    if (columnId === 'done' && !card.task.isDone) this._taskService.setDone(taskId);
    if (columnId !== 'done' && card.task.isDone) this._taskService.setUnDone(taskId);
  }

  /** Changing the company drops a project that belongs to another company. */
  setCompany(taskId: string, companyId: string | undefined): void {
    const project = this.cards().find((card) => card.task.id === taskId)?.project;
    this._patchCard(taskId, {
      companyId,
      ...(project && project.companyId !== companyId ? { projectId: NO_PROJECT } : {}),
    });
  }

  /** A project also sets the card's company; NO_PROJECT keeps it out of its repo's project. */
  setProject(taskId: string, projectId: string): void {
    const project = this.projects().find((item) => item.id === projectId);
    this._patchCard(
      taskId,
      project ? { projectId, companyId: project.companyId } : { projectId: NO_PROJECT },
    );
  }

  setPriority(taskId: string, priority: WorkCardMeta['priority']): void {
    this._patchCard(taskId, { priority });
  }

  setEstimate(taskId: string, minutes: number): void {
    this._taskService.update(taskId, {
      timeEstimate: Math.max(0, Math.round(minutes) * 60_000),
    });
  }

  setDeadline(taskId: string, day: string | null): void {
    if (!day) {
      this._store.dispatch(TaskSharedActions.removeDeadline({ taskId }));
      return;
    }
    this._store.dispatch(
      TaskSharedActions.setDeadline({
        taskId,
        deadlineDay: day,
        ...getDeadlineAutoPlanFields(this._dateService, day, undefined),
      }),
    );
  }

  /** Takes the card off the board; the task itself stays in the app. */
  hideCard(taskId: string): void {
    this._patchCard(taskId, { isHidden: true });
  }

  /** Makes the card a subtask of one of today's blocks (e.g. "Trabalhar - Bloco I"). */
  addToBlock(task: Task, blockId: string): void {
    if (task.parentId || task.subTaskIds.length || task.id === blockId) return;
    this._store.dispatch(
      TaskSharedActions.convertToSubTask({
        taskId: task.id,
        targetParentId: blockId,
        afterTaskId: null,
      }),
    );
  }

  removeFromBlock(task: Task): void {
    if (task.parentId) void this._taskService.convertToMainTask(task);
  }

  // ---- AI suggestions ----

  readonly suggestionsRunning = signal<Set<string>>(new Set());

  /** Asks Gemini what to implement next in one project, from its cards and notes; keeps the latest set. */
  async generateSuggestions(projectId: string): Promise<void> {
    const project = this.projects().find((item) => item.id === projectId);
    if (!project) return;
    const company = this.companies().find((item) => item.id === project.companyId);
    const context = buildSuggestionContext(
      this.cards()
        .filter((card) => card.project?.id === projectId)
        .map((card) => ({
          title: card.task.title,
          column: WORK_COLUMNS.find((column) => column.id === card.column)?.title ?? '',
          priority: card.meta?.priority,
          deadlineDay: card.task.deadlineDay,
          isDone: card.task.isDone,
          notes: card.notes,
        })),
    );
    if (!context && !project.description.trim()) {
      throw new Error(`O projeto ${project.name} ainda não tem cards nem descrição.`);
    }
    this.suggestionsRunning.update((running) => new Set(running).add(projectId));
    try {
      const result = await this._gemini.generateJson<{
        suggestions?: Omit<WorkSuggestion, 'id'>[];
      }>([
        {
          text:
            `Você é um assistente experiente (e engenheiro de software sênior quando o ` +
            `projeto for técnico) ajudando no projeto ` +
            `"${project.name}" da categoria "${company?.name ?? ''}".\n` +
            (project.description.trim()
              ? `Descrição do projeto: ${project.description.trim()}\n`
              : '') +
            `\nCards do projeto (título, coluna, urgência, prazo) e as anotações datadas, ` +
            `incluindo texto lido de fotos de caderno:\n\n${context || '(nenhum card ainda)'}\n\n` +
            `Sugira de 3 a 6 implementações concretas para este projeto: o que construir ou ` +
            `melhorar a seguir, partes que faltam para os cards fecharem, testes, automações, ` +
            `refatorações ou riscos a tratar. Baseie-se só no projeto e nos cards; não invente ` +
            `tecnologias que não aparecem. Responda em português, em JSON: {"suggestions": ` +
            `[{"title": "título curto", "summary": "por que e o que fazer, 1-2 frases", ` +
            `"steps": ["passo 1", "passo 2"], "effort": "baixo" | "médio" | "alto", ` +
            `"relatedCards": ["título exato de card relacionado"]}]}`,
        },
      ]);
      const items: WorkSuggestion[] = (result.suggestions ?? [])
        .filter((item) => item?.title)
        .map((item) => ({
          id: crypto.randomUUID(),
          title: String(item.title),
          summary: String(item.summary ?? ''),
          steps: Array.isArray(item.steps) ? item.steps.map(String) : [],
          effort: ['baixo', 'médio', 'alto'].includes(item.effort)
            ? item.effort
            : 'médio',
          relatedCards: Array.isArray(item.relatedCards)
            ? item.relatedCards.map(String)
            : [],
        }));
      this._saveBoard((board) => ({
        ...board,
        suggestions: {
          ...board.suggestions,
          [projectId]: { generatedAt: Date.now(), items },
        },
      }));
    } finally {
      this.suggestionsRunning.update((running) => {
        const next = new Set(running);
        next.delete(projectId);
        return next;
      });
    }
  }

  dismissSuggestion(projectId: string, suggestionId: string): void {
    this._saveBoard((board) => {
      const set = board.suggestions?.[projectId];
      if (!set) return board;
      return {
        ...board,
        suggestions: {
          ...board.suggestions,
          [projectId]: {
            ...set,
            items: set.items.filter((item) => item.id !== suggestionId),
          },
        },
      };
    });
  }

  /** Turns a suggestion into a card of that project, with its summary and steps as the first note. */
  async createCardFromSuggestion(
    projectId: string,
    suggestion: WorkSuggestion,
  ): Promise<void> {
    const project = this.projects().find((item) => item.id === projectId);
    if (!project) return;
    const taskId = this.addManualCard(suggestion.title, project.companyId);
    if (!taskId) return;
    this.setProject(taskId, projectId);
    const steps = suggestion.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
    await this.addNote(
      taskId,
      getDbDateStr(),
      [suggestion.summary, steps].filter(Boolean).join('\n\n'),
      [],
    );
    this.dismissSuggestion(projectId, suggestion.id);
  }

  // ---- ask the project ----

  readonly askRunning = signal<Set<string>>(new Set());

  /** Answers a question about a project from its cards, dated notes and OCR text; keeps the history. */
  async askProject(projectId: string, question: string): Promise<void> {
    const project = this.projects().find((item) => item.id === projectId);
    if (!project || !question.trim()) return;
    const context = buildSuggestionContext(
      this.cards()
        .filter((card) => card.project?.id === projectId)
        .map((card) => ({
          title: card.task.title,
          column: WORK_COLUMNS.find((column) => column.id === card.column)?.title ?? '',
          priority: card.meta?.priority,
          deadlineDay: card.task.deadlineDay,
          isDone: card.task.isDone,
          notes: card.notes,
        })),
      30_000,
    );
    this.askRunning.update((running) => new Set(running).add(projectId));
    try {
      const answer = await this._gemini.generate([
        {
          text:
            `Você responde perguntas sobre o projeto "${project.name}" usando SOMENTE as ` +
            `informações abaixo: descrição, cards e anotações datadas (incluindo texto lido ` +
            `de fotos de caderno).\n` +
            (project.description.trim()
              ? `Descrição: ${project.description.trim()}\n`
              : '') +
            `\n${context || '(nenhum card)'}\n\n` +
            `Pergunta: ${question.trim()}\n\n` +
            `Responda em português, direto ao ponto. Cite o card e a data das anotações ` +
            `que usou (ex.: "card Login, anotação de 05/10"). Se a resposta não estiver ` +
            `nas informações, diga que não encontrou - não invente.`,
        },
      ]);
      const message: WorkChatMessage = {
        id: crypto.randomUUID(),
        question: question.trim(),
        answer: answer.trim(),
        at: Date.now(),
      };
      this._saveBoard((board) => ({
        ...board,
        projectChats: {
          ...board.projectChats,
          [projectId]: [...(board.projectChats?.[projectId] ?? []), message].slice(-30),
        },
      }));
    } finally {
      this.askRunning.update((running) => {
        const next = new Set(running);
        next.delete(projectId);
        return next;
      });
    }
  }

  clearProjectChat(projectId: string): void {
    this._saveBoard((board) => ({
      ...board,
      projectChats: { ...board.projectChats, [projectId]: [] },
    }));
  }

  // ---- Academia link ----

  readonly academyLinkRunning = signal<Set<string>>(new Set());

  /** Asks the AI which Academia topics this card relates to (and why); stored on the card. */
  async linkAcademyTopics(taskId: string): Promise<void> {
    const card = this.cards().find((item) => item.task.id === taskId);
    const topics = this.academyTopics();
    if (!card) return;
    if (!topics.length)
      throw new Error('Nenhum tópico na Academia Arcana deste personagem.');
    const cardText = [
      card.task.title,
      ...card.notes.map((note) =>
        [
          note.text,
          ...note.attachments.map((attachment) => attachment.ocrText ?? ''),
        ].join(' '),
      ),
    ]
      .join('\n')
      .slice(0, 6000);
    const topicList = topics
      .slice(0, 400)
      .map((topic) => `${topic.id} | ${topic.areaTitle} > ${topic.title}`)
      .join('\n');
    this.academyLinkRunning.update((running) => new Set(running).add(taskId));
    try {
      const result = await this._gemini.generateJson<{
        links?: { nodeId: string; reason: string }[];
      }>([
        {
          text:
            `Um desenvolvedor tem este card de trabalho:\n${cardText}\n\n` +
            `E estuda estes tópicos (id | área > tópico):\n${topicList}\n\n` +
            `Escolha até 4 tópicos que ajudariam diretamente a fazer este card (conceitos ` +
            `usados, técnicas, ferramentas). Só inclua relações reais. Responda em JSON: ` +
            `{"links": [{"nodeId": "id exato da lista", "reason": "por que revisar, 1 frase"}]}`,
        },
      ]);
      const byId = new Map(topics.map((topic) => [topic.id, topic]));
      const links: WorkAcademyLink[] = (result.links ?? [])
        .filter((link) => byId.has(link.nodeId))
        .slice(0, 4)
        .map((link) => ({
          nodeId: link.nodeId,
          title: byId.get(link.nodeId)!.title,
          reason: String(link.reason ?? ''),
        }));
      this._patchCard(taskId, { academyLinks: links });
    } finally {
      this.academyLinkRunning.update((running) => {
        const next = new Set(running);
        next.delete(taskId);
        return next;
      });
    }
  }

  // ---- projects ----

  addProject(
    companyId: string,
    name: string,
    description = '',
    issueProviderIds: string[] = [],
  ): void {
    if (!name.trim()) return;
    this._saveBoard((board) => ({
      ...board,
      projects: [
        ...(board.projects ?? []),
        {
          id: crypto.randomUUID(),
          companyId,
          name: name.trim(),
          description: description.trim(),
          issueProviderIds,
        },
      ],
    }));
  }

  updateProject(
    id: string,
    changes: Partial<Pick<WorkProject, 'name' | 'description' | 'issueProviderIds'>>,
  ): void {
    this._saveBoard((board) => ({
      ...board,
      projects: (board.projects ?? []).map((project) =>
        project.id === id ? { ...project, ...changes } : project,
      ),
    }));
  }

  /** Cards of a removed project go back to having none. */
  removeProject(id: string): void {
    this._saveBoard((board) => {
      const suggestions = { ...board.suggestions };
      delete suggestions[id];
      return {
        ...board,
        projects: (board.projects ?? []).filter((project) => project.id !== id),
        suggestions,
        cards: Object.fromEntries(
          Object.entries(board.cards).map(([key, meta]) => [
            key,
            meta.projectId === id ? { ...meta, projectId: undefined } : meta,
          ]),
        ),
      };
    });
  }

  // ---- companies ----

  addCompany(name: string): void {
    if (!name.trim()) return;
    this._saveBoard((board) => ({
      ...board,
      companies: [
        ...board.companies,
        {
          id: crypto.randomUUID(),
          name: name.trim(),
          color: COMPANY_COLORS[board.companies.length % COMPANY_COLORS.length],
        },
      ],
    }));
  }

  updateCompany(id: string, changes: Partial<Pick<WorkCompany, 'name' | 'color'>>): void {
    this._saveBoard((board) => ({
      ...board,
      companies: board.companies.map((company) =>
        company.id === id ? { ...company, ...changes } : company,
      ),
    }));
  }

  /** Also removes the company's projects; their cards keep no company/project. */
  removeCompany(id: string): void {
    this._saveBoard((board) => {
      const removedProjects = new Set(
        (board.projects ?? []).filter((p) => p.companyId === id).map((p) => p.id),
      );
      return {
        ...board,
        companies: board.companies.filter((company) => company.id !== id),
        projects: (board.projects ?? []).filter((p) => p.companyId !== id),
        cards: Object.fromEntries(
          Object.entries(board.cards).map(([key, meta]) => [
            key,
            {
              ...meta,
              ...(meta.companyId === id ? { companyId: undefined } : {}),
              ...(meta.projectId && removedProjects.has(meta.projectId)
                ? { projectId: undefined }
                : {}),
            },
          ]),
        ),
      };
    });
  }

  // ---- notes ----

  /** Adds a dated note; photos are downscaled, other files kept as-is (max 10 MB each). */
  async addNote(
    taskId: string,
    day: string,
    text: string,
    files: File[],
  ): Promise<{ skipped: string[] }> {
    const board = this.board();
    if (!board || (!text.trim() && !files.length)) return { skipped: [] };
    const { attachments, skipped } = await this._readFiles(files);
    const now = Date.now();
    const note: WorkNote = {
      id: crypto.randomUUID(),
      profileId: board.profileId,
      taskId,
      day,
      text: text.trim(),
      attachments,
      createdAt: now,
      updatedAt: now,
    };
    await this._putNote(note);
    this._ocrNewAttachments(note);
    return { skipped };
  }

  async updateNote(
    noteId: string,
    changes: Partial<Pick<WorkNote, 'day' | 'text'>>,
  ): Promise<void> {
    const note = this.notes().find((item) => item.id === noteId);
    if (note) await this._putNote({ ...note, ...changes, updatedAt: Date.now() });
  }

  async addFilesToNote(noteId: string, files: File[]): Promise<{ skipped: string[] }> {
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return { skipped: [] };
    const { attachments, skipped } = await this._readFiles(files);
    const updated = {
      ...note,
      attachments: [...note.attachments, ...attachments],
      updatedAt: Date.now(),
    };
    await this._putNote(updated);
    this._ocrNewAttachments({ ...updated, attachments });
    return { skipped };
  }

  async removeAttachment(noteId: string, attachmentId: string): Promise<void> {
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return;
    await this._putNote({
      ...note,
      attachments: note.attachments.filter((item) => item.id !== attachmentId),
      updatedAt: Date.now(),
    });
  }

  async deleteNote(noteId: string): Promise<void> {
    await this._repo.deleteNote(noteId);
    this.notes.update((notes) => notes.filter((note) => note.id !== noteId));
  }

  /** Reads an image/PDF attachment's text with Gemini and stores it for the search. */
  async runOcr(noteId: string, attachmentId: string): Promise<void> {
    const attachment = this.notes()
      .find((note) => note.id === noteId)
      ?.attachments.find((item) => item.id === attachmentId);
    if (!attachment || !isOcrable(attachment.mimeType)) return;
    this.ocrRunning.update((running) => new Set(running).add(attachmentId));
    let result: Pick<WorkAttachment, 'ocrText' | 'ocrError'>;
    try {
      const text = await this._gemini.generate([
        { text: OCR_PROMPT },
        {
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.dataUrl.split(',')[1] ?? '',
          },
        },
      ]);
      result = { ocrText: text.trim(), ocrError: undefined };
    } catch (e) {
      result = { ocrError: (e as Error).message };
    }
    this.ocrRunning.update((running) => {
      const next = new Set(running);
      next.delete(attachmentId);
      return next;
    });
    // Re-read the note: it may have changed while Gemini was working.
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return;
    await this._putNote({
      ...note,
      attachments: note.attachments.map((item) =>
        item.id === attachmentId ? { ...item, ...result } : item,
      ),
    });
  }

  private _ocrNewAttachments(note: WorkNote): void {
    if (!this._gemini.configured()) return;
    for (const attachment of note.attachments) {
      if (isOcrable(attachment.mimeType)) void this.runOcr(note.id, attachment.id);
    }
  }

  private async _putNote(note: WorkNote): Promise<void> {
    await this._repo.putNote(note);
    this.notes.update((notes) => [...notes.filter((item) => item.id !== note.id), note]);
  }

  private async _readFiles(
    files: File[],
  ): Promise<{ attachments: WorkAttachment[]; skipped: string[] }> {
    const attachments: WorkAttachment[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      if (file.size > WORK_ATTACHMENT_MAX_BYTES) {
        skipped.push(file.name);
        continue;
      }
      const isImage = file.type.startsWith('image/');
      // Notebook photos stay large enough to read handwriting (and OCR it).
      const dataUrl = isImage
        ? await readFileAsShrunkDataUrl(file, 1600)
        : await readAsDataUrl(file);
      attachments.push({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: isImage
          ? (/^data:([^;]+);/.exec(dataUrl)?.[1] ?? file.type)
          : file.type,
        size: Math.round((dataUrl.length * 3) / 4),
        dataUrl,
      });
    }
    return { attachments, skipped };
  }
}

export const isOcrable = (mimeType: string): boolean =>
  mimeType.startsWith('image/') || mimeType === 'application/pdf';

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
