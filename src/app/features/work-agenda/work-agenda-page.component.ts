import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { isOcrable, WorkAgendaService, WorkCard } from './work-agenda.service';
import {
  WORK_COLUMNS,
  WORK_PRIORITIES,
  WorkAttachment,
  WorkColumnId,
  WorkNote,
  WorkPriority,
  WorkProject,
  WorkSuggestion,
  NO_PROJECT,
  WORK_TEMPLATES,
  WORK_DAILY_GOAL_MIN,
} from './work-agenda.model';
import {
  addDays,
  cardSearchMatch,
  dayListGroups,
  monthListGroups,
  doneByDay,
  estimateAccuracy,
  heatmapWeeks,
  isWeekend,
  matchAcademyTopics,
  timesheetCsv,
  timesheetRows,
  workingDaysBack,
} from './work-agenda.util';
import { GeminiService } from '../../core/ai/gemini.service';
import { getDbDateStr } from '../../util/get-db-date-str';
import { Task } from '../tasks/task.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectIssueProvidersWithDisabledLast } from '../issue/store/issue-provider.selectors';
import { getIssueProviderTooltip } from '../issue/mapping-helper/get-issue-provider-tooltip';
import { RpgProfileService } from '../rpg-profile/rpg-profile.service';
import { CharacterRendererComponent } from '../rpg-profile/character-renderer.component';

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const PRIORITY_RANK: Record<WorkPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

@Component({
  selector: 'work-agenda-page',
  templateUrl: './work-agenda-page.component.html',
  styleUrl: './work-agenda-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    CharacterRendererComponent,
  ],
})
export class WorkAgendaPageComponent {
  readonly agenda = inject(WorkAgendaService);
  readonly gemini = inject(GeminiService);
  readonly profile = inject(RpgProfileService);
  readonly COLUMNS = WORK_COLUMNS;
  readonly PRIORITIES = WORK_PRIORITIES;
  readonly isOcrable = isOcrable;
  readonly today = getDbDateStr();

  readonly view = signal<'day' | 'board' | 'projects' | 'hours' | 'suggestions'>('board');
  readonly TEMPLATES = WORK_TEMPLATES;
  newCardTemplate = '';
  private readonly _router = inject(Router);
  readonly search = signal('');
  readonly companyFilter = signal<string | 'all' | 'none'>('all');
  readonly projectFilter = signal<string | 'all' | 'none'>('all');
  readonly NO_PROJECT = NO_PROJECT;

  /** GitHub/GitLab repos (issue providers) a project can be linked to. */
  private readonly _issueProviders = toSignal(
    inject(Store).select(selectIssueProvidersWithDisabledLast),
    { initialValue: [] },
  );
  readonly gitRepos = computed(() =>
    this._issueProviders()
      .filter((provider) => /git(hub|lab)/i.test(provider.issueProviderKey))
      .map((provider) => ({ id: provider.id, label: getIssueProviderTooltip(provider) })),
  );

  /** Projects offered by the project filter: the filtered company's, or all. */
  readonly filterProjects = computed(() => {
    const company = this.companyFilter();
    return this.agenda
      .projects()
      .filter((project) => company === 'all' || project.companyId === company);
  });
  readonly selectedTaskId = signal<string | null>(null);
  readonly showCompanies = signal(false);
  readonly message = signal('');
  newCardTitle = '';
  newCardCompanyId = '';
  newCompanyName = '';
  noteDay = getDbDateStr();
  noteText = '';
  noteFiles: File[] = [];
  editingNoteId = signal<string | null>(null);
  noteDraft = { day: '', text: '' };

  // Right-click menu, opened at the mouse position.
  readonly menuTrigger = viewChild<MatMenuTrigger>('menuTrigger');
  readonly newCardInput = viewChild<ElementRef<HTMLInputElement>>('newCardInput');
  readonly menuCard = signal<WorkCard | null>(null);
  menuX = 0;
  menuY = 0;

  /** Cards per column after search/company filters, ordered by position then urgency. */
  readonly columns = computed(() => {
    const query = this.search();
    const company = this.companyFilter();
    const project = this.projectFilter();
    const rows = this.agenda
      .cards()
      .map((card) => ({
        card,
        match: cardSearchMatch(query, card.task.title, card.notes),
      }))
      .filter(
        ({ card, match }) =>
          match !== null &&
          (company === 'all' ||
            (company === 'none' ? !card.company : card.company?.id === company)) &&
          (project === 'all' ||
            (project === 'none' ? !card.project : card.project?.id === project)),
      );
    return WORK_COLUMNS.map((column) => ({
      ...column,
      rows: rows
        .filter(({ card }) => card.column === column.id)
        .sort(
          (a, b) =>
            (a.card.meta?.order ?? Number.MAX_SAFE_INTEGER) -
              (b.card.meta?.order ?? Number.MAX_SAFE_INTEGER) ||
            PRIORITY_RANK[a.card.meta?.priority ?? 'low'] -
              PRIORITY_RANK[b.card.meta?.priority ?? 'low'] ||
            a.card.task.title.localeCompare(b.card.task.title),
        ),
    }));
  });

  readonly selected = computed(
    () =>
      this.agenda.cards().find((card) => card.task.id === this.selectedTaskId()) ?? null,
  );

  drop(event: CdkDragDrop<WorkCard[]>, columnId: WorkColumnId): void {
    const target = [...event.container.data];
    if (event.previousContainer === event.container) {
      moveItemInArray(target, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        [...event.previousContainer.data],
        target,
        event.previousIndex,
        event.currentIndex,
      );
    }
    const moved = event.item.data as WorkCard;
    this.agenda.moveCard(
      moved.task.id,
      columnId,
      target.map((card) => card.task.id),
    );
  }

  columnCards(rows: { card: WorkCard }[]): WorkCard[] {
    return rows.map((row) => row.card);
  }

  // ---- card helpers ----

  priorityOf(card: WorkCard): (typeof WORK_PRIORITIES)[number] | undefined {
    return WORK_PRIORITIES.find((item) => item.id === card.meta?.priority);
  }

  estimateLabel(task: Task): string {
    const minutes = Math.round((task.timeEstimate ?? 0) / 60_000);
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
  }

  estimateMinutes(task: Task): number {
    return Math.round((task.timeEstimate ?? 0) / 60_000);
  }

  formatDay(day: string | undefined | null): string {
    if (!day) return '';
    const [, month, date] = day.split('-');
    return `${date}/${month}`;
  }

  isOverdue(task: Task): boolean {
    return !!task.deadlineDay && !task.isDone && task.deadlineDay < this.today;
  }

  /** The board, notes and the XP of finished cards all belong to the active character. */
  selectCharacter(characterId: string): void {
    if (characterId === this.profile.activeCharacterId()) return;
    this.selectedTaskId.set(null);
    this.profile.switchCharacter(characterId);
  }

  // ---- daily stats ----

  /** Finished cards per day, narrowed by the company filter at the top. */
  readonly filteredDoneByDay = computed(() => {
    const company = this.companyFilter();
    const project = this.projectFilter();
    const entries = Object.entries(this.agenda.board()?.doneLog ?? {}).filter(
      ([, entry]) =>
        (company === 'all' ||
          (company === 'none' ? !entry.companyId : entry.companyId === company)) &&
        (project === 'all' ||
          (project === 'none' ? !entry.projectId : entry.projectId === project)),
    );
    return doneByDay(Object.fromEntries(entries));
  });

  /** "· Acme" next to the chart titles while a company filter is on. */
  readonly filterLabel = computed(() => {
    const company = this.companyFilter();
    const project = this.projectFilter();
    const parts = [
      company === 'all'
        ? ''
        : company === 'none'
          ? 'sem categoria'
          : this.companyName(company),
      project === 'all'
        ? ''
        : project === 'none'
          ? 'sem projeto'
          : (this.agenda.projects().find((item) => item.id === project)?.name ?? ''),
    ];
    return parts.filter(Boolean).join(' · ');
  });

  readonly GOAL_MIN = WORK_DAILY_GOAL_MIN;
  readonly selectedDay = signal(getDbDateStr());
  readonly WEEKDAY_LABELS = ['Seg', '', 'Qua', '', 'Sex', '', 'Dom'];

  /** Last year (53 weeks) of finished cards; level 0-4 for the single-hue gold ramp, month labels on top. */
  readonly heatmap = computed(() => {
    const byDay = this.filteredDoneByDay();
    const weeks = heatmapWeeks(this.today, 53).map((week) =>
      week.map((day) => {
        const count = day ? (byDay.get(day)?.count ?? 0) : 0;
        const level =
          count === 0 ? 0 : count === 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 3 : 4;
        return { day, count, level };
      }),
    );
    let lastMonth = '';
    const months = weeks.map((week) => {
      const month = week[0].day?.slice(5, 7) ?? '';
      if (!month || month === lastMonth) return '';
      lastMonth = month;
      return MONTH_LABELS[Number(month) - 1];
    });
    return { weeks, months };
  });

  /** Estimated minutes finished on the 14 days ending at the selected day, against the 6h goal. */
  readonly minuteBars = computed(() => {
    const byDay = this.filteredDoneByDay();
    // Working days only - a weekend shows up just when something was done on it.
    const days = workingDaysBack(
      this.selectedDay(),
      14,
      (day) => (byDay.get(day)?.minutes ?? 0) > 0,
    );
    const rows = days.map((day) => ({ day, minutes: byDay.get(day)?.minutes ?? 0 }));
    const scale = Math.max(WORK_DAILY_GOAL_MIN, ...rows.map((row) => row.minutes));
    return {
      goalPct: (WORK_DAILY_GOAL_MIN / scale) * 100,
      rows: rows.map((row) => ({ ...row, pct: (row.minutes / scale) * 100 })),
    };
  });

  readonly selectedDayStats = computed(() => {
    const stats = this.filteredDoneByDay().get(this.selectedDay());
    const minutes = stats?.minutes ?? 0;
    return {
      minutes,
      pct: Math.min(100, Math.round((minutes / WORK_DAILY_GOAL_MIN) * 100)),
      entries: [...(stats?.entries ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    };
  });

  /** Steps to the previous/next working day. */
  shiftSelectedDay(delta: number): void {
    let next = addDays(this.selectedDay(), delta);
    while (isWeekend(next)) next = addDays(next, delta);
    if (next <= this.today) this.selectedDay.set(next);
  }

  minutesLabel(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}h${rest ? String(rest).padStart(2, '0') : ''}` : `${rest}min`;
  }

  companyName(companyId: string | undefined): string {
    return (
      this.agenda.companies().find((company) => company.id === companyId)?.name ?? ''
    );
  }

  // ---- AI suggestions ----

  async generateSuggestions(projectId: string): Promise<void> {
    try {
      await this.agenda.generateSuggestions(projectId);
    } catch (e) {
      this._flash(`Não foi possível gerar sugestões: ${(e as Error).message}`);
    }
  }

  async createFromSuggestion(
    projectId: string,
    suggestion: WorkSuggestion,
  ): Promise<void> {
    await this.agenda.createCardFromSuggestion(projectId, suggestion);
    this._flash(
      `Card "${suggestion.title}" criado em "A fazer", com os passos na anotação.`,
    );
  }

  formatDateTime(at: number): string {
    return new Date(at).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ---- projects ----

  readonly editingProjectId = signal<string | null>(null);
  /** New-project form per company id. */
  projectDrafts: Record<string, { name: string; description: string; repos: string[] }> =
    {};
  projectEdit = { name: '', description: '', repos: [] as string[] };

  projectsOf(companyId: string): WorkProject[] {
    return this.agenda.projects().filter((project) => project.companyId === companyId);
  }

  projectDraft(companyId: string): {
    name: string;
    description: string;
    repos: string[];
  } {
    return (this.projectDrafts[companyId] ??= { name: '', description: '', repos: [] });
  }

  toggleRepo(list: string[], repoId: string): string[] {
    return list.includes(repoId) ? list.filter((id) => id !== repoId) : [...list, repoId];
  }

  repoLabel(repoId: string): string {
    return (
      this.gitRepos().find((repo) => repo.id === repoId)?.label ?? 'repositório removido'
    );
  }

  addProject(companyId: string): void {
    const draft = this.projectDraft(companyId);
    this.agenda.addProject(companyId, draft.name, draft.description, draft.repos);
    this.projectDrafts[companyId] = { name: '', description: '', repos: [] };
  }

  startEditProject(project: WorkProject): void {
    this.projectEdit = {
      name: project.name,
      description: project.description,
      repos: [...project.issueProviderIds],
    };
    this.editingProjectId.set(project.id);
  }

  saveProjectEdit(project: WorkProject): void {
    if (!this.projectEdit.name.trim()) return;
    this.agenda.updateProject(project.id, {
      name: this.projectEdit.name.trim(),
      description: this.projectEdit.description.trim(),
      issueProviderIds: this.projectEdit.repos,
    });
    this.editingProjectId.set(null);
  }

  removeProject(project: WorkProject): void {
    if (
      confirm(`Remover o projeto "${project.name}"? Os cards dele ficam sem projeto.`)
    ) {
      this.agenda.removeProject(project.id);
    }
  }

  /** Open / done cards and estimated minutes still open, for a project's summary. */
  projectStats(projectId: string): { open: number; done: number; openMin: number } {
    const cards = this.agenda.cards().filter((card) => card.project?.id === projectId);
    const open = cards.filter((card) => !card.task.isDone);
    return {
      open: open.length,
      done: cards.length - open.length,
      openMin: Math.round(
        open.reduce((sum, card) => sum + (card.task.timeEstimate ?? 0), 0) / 60_000,
      ),
    };
  }

  showProjectOnBoard(project: WorkProject): void {
    this.companyFilter.set(project.companyId);
    this.projectFilter.set(project.id);
    this.view.set('board');
  }

  setCompanyFilter(company: string | 'all' | 'none'): void {
    this.companyFilter.set(company);
    const project = this.agenda
      .projects()
      .find((item) => item.id === this.projectFilter());
    if (project && company !== 'all' && project.companyId !== company) {
      this.projectFilter.set('all');
    }
  }

  // ---- daily list ----

  readonly listDay = signal(getDbDateStr());
  readonly listMode = signal<'day' | 'month'>('day');
  readonly listMonth = signal(getDbDateStr().slice(0, 7));

  /** The month's cards grouped by day, plus finished cards already archived. */
  readonly monthList = computed(() => {
    const month = this.listMonth();
    const company = this.companyFilter();
    const inFilter = (companyId: string | undefined): boolean =>
      company === 'all' || (company === 'none' ? !companyId : companyId === company);
    const cards = this.agenda.cards().filter((card) => inFilter(card.company?.id));
    const groups = monthListGroups(cards, month, (ms) => getDbDateStr(ms));
    const onBoard = new Set(this.agenda.cards().map((card) => card.task.id));
    const archived = Object.entries(this.agenda.board()?.doneLog ?? {})
      .filter(
        ([taskId, entry]) =>
          entry.day.startsWith(month) &&
          !onBoard.has(taskId) &&
          inFilter(entry.companyId),
      )
      .map(([taskId, entry]) => ({ taskId, ...entry }));
    const days = [
      ...new Set([...groups.map((g) => g.day), ...archived.map((a) => a.day)]),
    ]
      .sort()
      .map((day) => ({
        day,
        cards: groups.find((group) => group.day === day)?.cards ?? [],
        archived: archived.filter((entry) => entry.day === day),
      }));
    const all = days.flatMap((day) => day.cards);
    return {
      days,
      total: all.length + archived.length,
      done: all.filter((card) => card.task.isDone).length + archived.length,
    };
  });

  readonly listMonthLabel = computed(() => {
    const [year, month] = this.listMonth().split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  shiftListMonth(delta: number): void {
    const [year, month] = this.listMonth().split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    this.listMonth.set(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  /** From the month list, jump to that day's list. */
  openListDay(day: string): void {
    this.listDay.set(day);
    this.listMode.set('day');
  }

  weekdayLabel(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
    return day === this.today ? `${label} · hoje` : label;
  }

  /** "início 05/10 → prazo 20/10" or "início 05/10 → concluída 07/10". */
  cardDates(card: WorkCard): string {
    const start = `início ${this.formatDay(getDbDateStr(card.task.created))}`;
    if (card.task.isDone && card.task.doneOn) {
      return `${start} → concluída ${this.formatDay(getDbDateStr(card.task.doneOn))}`;
    }
    return card.task.deadlineDay
      ? `${start} → prazo ${this.formatDay(card.task.deadlineDay)}`
      : start;
  }
  dayTaskTitle = '';
  dayTaskCategoryId = '';
  dayTaskEstimate: number | null = null;
  dayPlanTaskId = '';

  /** The day's cards (respecting the category filter), plus finished cards already archived. */
  readonly dayList = computed(() => {
    const day = this.listDay();
    const company = this.companyFilter();
    const cards = this.agenda
      .cards()
      .filter(
        (card) =>
          company === 'all' ||
          (company === 'none' ? !card.company : card.company?.id === company),
      );
    const groups = dayListGroups(cards, day, this.today, (ms) => getDbDateStr(ms));
    const onBoard = new Set(this.agenda.cards().map((card) => card.task.id));
    const archivedDone = Object.entries(this.agenda.board()?.doneLog ?? {})
      .filter(
        ([taskId, entry]) =>
          entry.day === day &&
          !onBoard.has(taskId) &&
          (company === 'all' ||
            (company === 'none' ? !entry.companyId : entry.companyId === company)),
      )
      .map(([taskId, entry]) => ({ taskId, ...entry }));
    const minutes = (list: WorkCard[]): number =>
      list.reduce(
        (sum, card) => sum + Math.round((card.task.timeEstimate ?? 0) / 60_000),
        0,
      );
    const doneMin =
      minutes(groups.done) +
      archivedDone.reduce((sum, entry) => sum + entry.estimateMin, 0);
    const shown = new Set(
      [...groups.overdue, ...groups.planned, ...groups.deadline].map(
        (card) => card.task.id,
      ),
    );
    return {
      ...groups,
      archivedDone,
      plannedMin:
        minutes(groups.planned) + minutes(groups.overdue) + minutes(groups.deadline),
      doneMin,
      donePct: Math.min(100, Math.round((doneMin / WORK_DAILY_GOAL_MIN) * 100)),
      // Open cards not on this day's list yet, to plan into it.
      plannable: cards
        .filter((card) => !card.task.isDone && !shown.has(card.task.id))
        .sort((a, b) => a.task.title.localeCompare(b.task.title)),
    };
  });

  readonly listDayLabel = computed(() => {
    const day = this.listDay();
    if (day === this.today) return 'Hoje';
    if (day === addDays(this.today, 1)) return 'Amanhã';
    if (day === addDays(this.today, -1)) return 'Ontem';
    const [y, m, d] = day.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  shiftListDay(delta: number): void {
    this.listDay.set(addDays(this.listDay(), delta));
  }

  async addDayTask(): Promise<void> {
    if (!this.dayTaskTitle.trim()) {
      this._flash('Digite o título da tarefa.');
      return;
    }
    await this.agenda.addTaskForDay(
      this.dayTaskTitle,
      this.listDay(),
      this.dayTaskCategoryId || undefined,
      this.dayTaskEstimate ? Number(this.dayTaskEstimate) : undefined,
    );
    this.dayTaskTitle = '';
    this.dayTaskEstimate = null;
  }

  async planIntoDay(): Promise<void> {
    if (!this.dayPlanTaskId) return;
    await this.agenda.planForDay(this.dayPlanTaskId, this.listDay());
    this.dayPlanTaskId = '';
  }

  toggleDone(card: WorkCard): void {
    const ordered = [card.task.id];
    this.agenda.moveCard(card.task.id, card.task.isDone ? 'todo' : 'done', ordered);
  }

  async postpone(card: WorkCard): Promise<void> {
    await this.agenda.planForDay(card.task.id, addDays(this.listDay(), 1));
  }

  scheduledTime(card: WorkCard): string {
    return card.task.dueWithTime
      ? new Date(card.task.dueWithTime).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }

  plannedDayOf(card: WorkCard): string {
    return (
      card.task.dueDay ??
      (card.task.dueWithTime ? getDbDateStr(card.task.dueWithTime) : '')
    );
  }

  // ---- timesheet / estimates ----

  readonly hoursMonth = signal(getDbDateStr().slice(0, 7));

  readonly hoursMonthLabel = computed(() => {
    const [year, month] = this.hoursMonth().split('-').map(Number);
    return `${MONTH_LABELS[month - 1]} ${year}`;
  });

  shiftMonth(delta: number): void {
    const [year, month] = this.hoursMonth().split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    this.hoursMonth.set(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  /** Tracked hours of the month, grouped company > project > card. */
  readonly timesheet = computed(() => {
    const rows = timesheetRows(this.agenda.board()?.timeLog ?? {}, this.hoursMonth());
    const companies = [
      ...this.agenda
        .companies()
        .map((company) => ({ id: company.id, name: company.name, color: company.color })),
      { id: '', name: 'Sem categoria', color: '#464660' },
    ];
    const groups = companies
      .map((company) => {
        const companyRows = rows.filter((row) => (row.companyId ?? '') === company.id);
        const projectIds = [...new Set(companyRows.map((row) => row.projectId ?? ''))];
        return {
          ...company,
          minutes: companyRows.reduce((sum, row) => sum + row.minutes, 0),
          projects: projectIds
            .map((projectId) => {
              const projectRows = companyRows.filter(
                (row) => (row.projectId ?? '') === projectId,
              );
              return {
                id: projectId,
                name: this.projectName(projectId) || 'Sem projeto',
                minutes: projectRows.reduce((sum, row) => sum + row.minutes, 0),
                rows: projectRows,
              };
            })
            .sort((a, b) => b.minutes - a.minutes),
        };
      })
      .filter((group) => group.minutes > 0);
    return { rows, groups, total: rows.reduce((sum, row) => sum + row.minutes, 0) };
  });

  exportTimesheetCsv(): void {
    const csv = timesheetCsv(
      this.timesheet().rows,
      (id) => this.companyName(id) || 'Sem categoria',
      (id) => this.projectName(id) || 'Sem projeto',
    );
    // BOM so Excel reads the accents as UTF-8.
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `horas-${this.hoursMonth()}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  /** How tracked time compares to estimates, per company and per project (3+ finished cards). */
  readonly accuracy = computed(() => {
    const entries = Object.values(this.agenda.board()?.doneLog ?? {});
    return {
      companies: estimateAccuracy(entries, (entry) => entry.companyId).map((row) => ({
        ...row,
        name: this.companyName(row.key),
      })),
      projects: estimateAccuracy(entries, (entry) => entry.projectId).map((row) => ({
        ...row,
        name: this.projectName(row.key),
      })),
      measured: entries.filter((entry) => entry.estimateMin && entry.spentMin).length,
    };
  });

  accuracyText(ratio: number): string {
    const percent = Math.round(Math.abs(ratio - 1) * 100);
    if (percent < 10) return 'acerta as estimativas';
    return ratio > 1 ? `subestima em ${percent}%` : `superestima em ${percent}%`;
  }

  /** "2h costumam virar 2h50" for a card, from its project's (else company's) history. */
  estimateAdvice(card: WorkCard): string | null {
    const estimateMin = Math.round((card.task.timeEstimate ?? 0) / 60_000);
    if (!estimateMin) return null;
    const { projects, companies } = this.accuracy();
    const basis =
      projects.find((row) => row.key === card.project?.id) ??
      companies.find((row) => row.key === card.company?.id);
    if (!basis || Math.abs(basis.ratio - 1) < 0.1) return null;
    return (
      `Pelo seu histórico em ${basis.name} (${basis.count} cards), ` +
      `${this.minutesLabel(estimateMin)} costumam virar ${this.minutesLabel(Math.round(estimateMin * basis.ratio))}.`
    );
  }

  projectName(projectId: string | undefined): string {
    return this.agenda.projects().find((project) => project.id === projectId)?.name ?? '';
  }

  // ---- Academia ----

  /** Topics whose titles share words with the card - shown without asking the AI. */
  academyMatches(card: WorkCard): { id: string; title: string; areaTitle: string }[] {
    const linked = new Set((card.meta?.academyLinks ?? []).map((link) => link.nodeId));
    const text = [card.task.title, ...card.notes.map((note) => note.text)].join(' ');
    return matchAcademyTopics(text, this.agenda.academyTopics(), 4).filter(
      (topic) => !linked.has(topic.id),
    );
  }

  async linkAcademy(card: WorkCard): Promise<void> {
    try {
      await this.agenda.linkAcademyTopics(card.task.id);
    } catch (e) {
      this._flash(`Não foi possível relacionar com a Academia: ${(e as Error).message}`);
    }
  }

  /** Opens the topic's review in the Academia Arcana. */
  reviewAcademyTopic(nodeId: string): void {
    void this._router.navigate(['/academy'], { queryParams: { reviewTopic: nodeId } });
  }

  // ---- ask the project ----

  readonly chatProjectId = signal<string | null>(null);
  chatQuestion = '';

  toggleChat(projectId: string): void {
    this.chatQuestion = '';
    this.chatProjectId.set(this.chatProjectId() === projectId ? null : projectId);
  }

  async askProject(projectId: string): Promise<void> {
    const question = this.chatQuestion;
    if (!question.trim()) return;
    this.chatQuestion = '';
    try {
      await this.agenda.askProject(projectId, question);
    } catch (e) {
      this.chatQuestion = question;
      this._flash(`Não foi possível perguntar: ${(e as Error).message}`);
    }
  }

  // ---- toolbar ----

  addCard(): void {
    if (!this.newCardTitle.trim()) {
      this.newCardInput()?.nativeElement.focus();
      this._flash('Digite o título do card no campo "Novo card..." e clique em + Card.');
      return;
    }
    this.agenda.addManualCard(
      this.newCardTitle,
      this.newCardCompanyId || undefined,
      this.newCardTemplate || undefined,
    );
    this.newCardTitle = '';
  }

  addCompany(): void {
    this.agenda.addCompany(this.newCompanyName);
    this.newCompanyName = '';
  }

  removeCompany(id: string, name: string): void {
    if (confirm(`Remover a categoria "${name}"? Os cards dela ficam sem categoria.`)) {
      this.agenda.removeCompany(id);
    }
  }

  // ---- right-click menu ----

  openMenu(event: MouseEvent, card: WorkCard): void {
    event.preventDefault();
    this.menuX = event.clientX;
    this.menuY = event.clientY;
    this.menuCard.set(card);
    this.menuTrigger()?.openMenu();
  }

  addToBlock(card: WorkCard, blockId: string, blockTitle: string): void {
    this.agenda.addToBlock(card.task, blockId);
    this._flash(`"${card.task.title}" virou subtarefa de "${blockTitle}".`);
  }

  hideCard(card: WorkCard): void {
    if (confirm(`Tirar "${card.task.title}" do Kanban? A tarefa continua no app.`)) {
      this.agenda.hideCard(card.task.id);
      if (this.selectedTaskId() === card.task.id) this.selectedTaskId.set(null);
    }
  }

  // ---- notes ----

  /** Where the app's top bar ends, so the side panel opens below it instead of under it. */
  readonly detailTop = signal(56);

  open(card: WorkCard): void {
    const header = document.querySelector('main-header')?.getBoundingClientRect();
    this.detailTop.set(Math.round(header?.bottom ?? 56));
    this.selectedTaskId.set(card.task.id);
    this.noteDay = getDbDateStr();
    this.noteText = '';
    this.noteFiles = [];
    this.editingNoteId.set(null);
  }

  onNoteFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.noteFiles = [...this.noteFiles, ...Array.from(input.files ?? [])];
    input.value = '';
  }

  /** Images pasted into the note box become attachments. */
  onNotePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) {
      event.preventDefault();
      this.noteFiles = [...this.noteFiles, ...files];
    }
  }

  removePendingFile(file: File): void {
    this.noteFiles = this.noteFiles.filter((item) => item !== file);
  }

  async saveNote(taskId: string): Promise<void> {
    const { skipped } = await this.agenda.addNote(
      taskId,
      this.noteDay || getDbDateStr(),
      this.noteText,
      this.noteFiles,
    );
    this.noteText = '';
    this.noteFiles = [];
    this._reportSkipped(skipped);
  }

  startEditNote(note: WorkNote): void {
    this.noteDraft = { day: note.day, text: note.text };
    this.editingNoteId.set(note.id);
  }

  async saveNoteEdit(note: WorkNote): Promise<void> {
    await this.agenda.updateNote(note.id, this.noteDraft);
    this.editingNoteId.set(null);
  }

  async addFilesToNote(note: WorkNote, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const { skipped } = await this.agenda.addFilesToNote(
      note.id,
      Array.from(input.files ?? []),
    );
    input.value = '';
    this._reportSkipped(skipped);
  }

  deleteNote(note: WorkNote): void {
    if (confirm('Apagar esta anotação e os anexos dela?')) {
      void this.agenda.deleteNote(note.id);
    }
  }

  removeAttachment(note: WorkNote, attachment: WorkAttachment): void {
    if (confirm(`Remover o anexo "${attachment.name}"?`)) {
      void this.agenda.removeAttachment(note.id, attachment.id);
    }
  }

  download(attachment: WorkAttachment): void {
    const anchor = document.createElement('a');
    anchor.href = attachment.dataUrl;
    anchor.download = attachment.name;
    anchor.click();
  }

  sizeLabel(bytes: number): string {
    return bytes >= 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  private _reportSkipped(skipped: string[]): void {
    if (skipped.length) {
      this._flash(`Arquivos acima de 10 MB não foram anexados: ${skipped.join(', ')}`);
    }
  }

  private _flash(text: string): void {
    this.message.set(text);
    setTimeout(() => this.message() === text && this.message.set(''), 5000);
  }
}
