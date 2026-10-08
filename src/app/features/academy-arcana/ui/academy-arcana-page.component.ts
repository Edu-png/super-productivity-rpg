import { ActivatedRoute, Router } from '@angular/router';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
  untracked,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { AcademyBackupService } from '../application/academy-backup.service';
import {
  buildDailyDistractionStats,
  buildDistractionImpact,
  buildDistractionStats,
} from '../application/distraction-stats';
import { AcademyStudyService } from '../application/academy-study.service';
import { AcademyRepository } from '../domain/academy.repository';
import {
  DailyStudyAggregate,
  ExcalidrawDrawing,
  STUDY_NODE_CATEGORIES,
  STUDY_NODE_PRIORITIES,
  STUDY_NODE_STATUSES,
  StudyNode,
  StudyNodeCategory,
  StudyNodeKind,
  StudyNodeNotebookRef,
  StudyNodePhoto,
  StudyNodePriority,
  StudyNodeStatus,
  StudySession,
  TopicReviewState,
  studyNodeCategoryInfo,
  studyNodePriorityRank,
  studyNodeStatus,
  quizScorePercent,
} from '../domain/academy.models';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { AcademyIdbRepository } from '../persistence/academy-idb.repository';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { FocusModeService } from '../../focus-mode/focus-mode.service';
import { MarkdownComponent } from 'ngx-markdown';
import { AcademyExcalidrawComponent } from './academy-excalidraw.component';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';
import { confirmDialog } from '../../../util/native-dialogs';
import { GeminiService } from '../../../core/ai/gemini.service';
import { ArcaneLibraryRepository } from '../../arcane-library/persistence/arcane-library.repository';
import {
  AcademyAiService,
  AiActiveReviewResult,
  AiQuizQuestion,
  AiWeekPlan,
} from '../application/academy-ai.service';
import { CAREER_SKILLS } from '../../career-quest/career-quest.catalog';
import { getDbDateStr } from '../../../util/get-db-date-str';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import {
  MatMenu,
  MatMenuContent,
  MatMenuItem,
  MatMenuTrigger,
} from '@angular/material/menu';
import { selectAllTasks } from '../../tasks/store/task.selectors';
import { TaskService } from '../../tasks/task.service';
import { Task } from '../../tasks/task.model';
import { SnackService } from '../../../core/snack/snack.service';
import { todayBlockTasks } from '../../work-agenda/work-agenda.util';
import { reviewDelayCharges, reviewDelayStatus } from '../domain/review-delay-penalty';
import {
  CodeLabChallengeComponent,
  CodeLabGrade,
} from '../../code-lab/code-lab-challenge.component';
import { CareerQuest } from '../../career-quest/career-quest.model';
import { buildTodayPlan } from '../../career-quest/career-quest-today.util';
import {
  readFileAsShrunkDataUrl,
  rotateImageDataUrl,
} from '../../../util/shrink-image-data-url';

type StoredWeekPlan = AiWeekPlan & {
  generatedAt: number;
  /** Local date key (yyyy-mm-dd) of each day, for the planned x done balance. */
  dates?: string[];
  goalsDone?: boolean[];
  /** Past days whose missing minutes were already handled. */
  settled?: Record<string, 'redistribute' | 'review' | 'discard'>;
};

interface PlanBalance {
  target: number;
  planned: number;
  done: number;
  left: number;
  days: {
    index: number;
    label: string;
    date: string;
    planned: number;
    done: number;
    deficit: number;
  }[];
}

interface StudyChartDay {
  date: string;
  label: string;
  minutes: number;
  aggregate: DailyStudyAggregate | null;
  padding?: boolean;
}

interface StudyChartSeriesPoint {
  x: number;
  y: number;
  value: number;
  date: string;
  label: string;
}

interface StudyChartSeries {
  id: string;
  title: string;
  color: string;
  points: StudyChartSeriesPoint[];
  polyline: string;
}

const QUESTION_STOPWORDS = new Set(
  'o a os as um uma de do da dos das em no na nos nas que qual quais e ou para por com se como por que porque ao sao ser e é'.split(
    ' ',
  ),
);

/** Same question reworded? Word-set overlap (Jaccard) of 60% or more. */
const isSimilarQuestion = (a: string, b: string): boolean => {
  const words = (text: string): Set<string> =>
    new Set(
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !QUESTION_STOPWORDS.has(word)),
    );
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (left.size + right.size - shared) >= 0.6;
};

/** Categorical palette (dark steps), validated for CVD separation on #13131f. */
const DISTRACTION_PALETTE = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

@Component({
  selector: 'academy-arcana-page',
  standalone: true,
  imports: [
    FormsModule,
    MatIcon,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    MarkdownComponent,
    AcademyExcalidrawComponent,
    CharacterRendererComponent,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CodeLabChallengeComponent,
    MatMenu,
    MatMenuContent,
    MatMenuItem,
    MatMenuTrigger,
  ],
  templateUrl: './academy-arcana-page.component.html',
  styleUrl: './academy-arcana-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    AcademyStudyService,
    AcademyBackupService,
    { provide: AcademyRepository, useClass: AcademyIdbRepository },
  ],
})
export class AcademyArcanaPageComponent implements OnInit {
  readonly academy = inject(AcademyStudyService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly backup = inject(AcademyBackupService);
  readonly profile = inject(RpgProfileService);
  readonly selectedCharacterId = signal(this.profile.activeCharacterId());
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  readonly focusMode = inject(FocusModeService);
  readonly tab = signal<'dashboard' | 'library' | 'review' | 'history'>('dashboard');
  readonly selectedAreaId = signal('');
  readonly selectedModuleId = signal('');
  readonly selectedTopicId = signal('');
  readonly selectedSubtopicId = signal('');
  readonly chartFilter = signal('all');
  readonly heatmapYear = signal(new Date().getFullYear());
  readonly libraryParentId = signal<string | null>(null);
  readonly editingNodeId = signal<string | null>(null);
  readonly editingNode = computed(
    () => this.academy.nodes().find((node) => node.id === this.editingNodeId()) ?? null,
  );
  readonly notesMode = signal<'write' | 'preview'>('write');
  readonly excalidrawOpen = signal(false);
  readonly notesTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('notesTextarea');
  readonly excalidrawEditor = viewChild(AcademyExcalidrawComponent);
  readonly cardAnswerVisible = signal(false);
  readonly quickCreateOpen = signal<'area' | 'module' | 'topic' | 'subtopic' | null>(
    null,
  );
  readonly reviewingNodeId = signal<string | null>(null);
  readonly reviewAnswerVisible = signal(false);
  readonly reviewResult = signal<{ nextIntervalDays: number } | null>(null);
  readonly editingSessionId = signal<string | null>(null);

  // ---- distraction tracking (per study block) ----
  distractionNote = '';
  /** Distractions queued in the form before a past session is registered. */
  readonly draftDistractions = signal<{ id: string; category: string; note: string }[]>(
    [],
  );
  draftDistractionNote = '';
  /** Shown right after a block is finished/registered, so distractions can be logged afterwards. */
  readonly distractionPrompt = signal<{ sessionId: string; title: string } | null>(null);
  newDistractionCategory = '';
  editDistractionCategory = '';
  editDistractionNote = '';
  /** Newest first, for the live list under the running block. */
  readonly activeDistractions = computed(() =>
    [...(this.academy.activeSession()?.distractions ?? [])].reverse(),
  );
  readonly editingSession = computed(() =>
    this.academy.recentSessions().find((item) => item.id === this.editingSessionId()),
  );
  readonly distractionStats = computed(() =>
    buildDistractionStats(this.academy.distractionSessions(), Date.now()),
  );
  /**
   * Quiz/exam grades over time, one line per area (dashed line at 70%), plus
   * the contents below 70% - those also jump ahead in the review queue.
   */
  readonly quizChart = computed(() => {
    const areas = new Map(this.academy.areas().map((area) => [area.id, area]));
    const items = this.academy
      .nodes()
      .filter((node) => !node.deletedAt && areas.has(node.areaId))
      .map((node) => ({
        node,
        percent: quizScorePercent(node),
        at: node.quizScore?.at ?? node.updatedAt,
      }))
      .filter(
        (item): item is { node: StudyNode; percent: number; at: number } =>
          item.percent !== null,
      )
      .sort((a, b) => a.at - b.at);
    const width = 600;
    const height = 180;
    const left = 34;
    const top = 10;
    const minAt = items[0]?.at ?? 0;
    const span = Math.max(1, (items[items.length - 1]?.at ?? 0) - minAt);
    const x = (at: number): number =>
      left +
      (items.length <= 1
        ? (width - left) / 2
        : ((at - minAt) / span) * (width - left - 10));
    const y = (percent: number): number => top + (1 - percent / 100) * height;
    const series = [...new Set(items.map((item) => item.node.areaId))].map((areaId) => {
      const points = items
        .filter((item) => item.node.areaId === areaId)
        .map((item) => ({
          x: x(item.at),
          y: y(item.percent),
          low: item.percent < 70,
          label: `${item.node.title}: ${Math.round(item.percent)}% · ${new Date(item.at).toLocaleDateString('pt-BR')}`,
        }));
      const area = areas.get(areaId);
      return {
        areaId,
        title: area?.title ?? '',
        color: area?.color || '#9670e7',
        points,
        polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
      };
    });
    return {
      count: items.length,
      series,
      line70: y(70),
      yLabels: [100, 70, 0].map((value) => ({ value, y: y(value) })),
      low: items
        .filter((item) => item.percent < 70)
        .sort((a, b) => a.percent - b.percent)
        .map((item) => ({
          node: item.node,
          percent: Math.round(item.percent),
          area: areas.get(item.node.areaId)?.title ?? '',
        })),
    };
  });

  openQuizNode(node: StudyNode): void {
    this.selectedAreaId.set(node.areaId);
    this.openNodeEditor(node);
  }

  readonly distractionImpact = computed(() => {
    const rows = buildDistractionImpact(this.academy.distractionSessions(), Date.now());
    const top = Math.max(1, ...rows.map((row) => Math.abs(row.deltaPercent)));
    return rows.map((row) => ({
      ...row,
      width: (Math.abs(row.deltaPercent) / top) * 100,
    }));
  });
  readonly dailyDistractionStats = computed(() =>
    buildDailyDistractionStats(this.academy.distractionSessions(), Date.now()),
  );
  // Daily chart: bars = distractions that day, dashed = daily average,
  // gold line = 7-day moving average (the progress trend).
  readonly dailyDistractionChart = computed(() => {
    const stats = this.dailyDistractionStats();
    const count = stats.days.length;
    const max = Math.max(1, stats.average, ...stats.days.map((day) => day.count));
    const slot = count ? 700 / count : 700;
    const barWidth = Math.min(40, slot * 0.7);
    const halfBar = barWidth / 2;
    const halfSlot = slot / 2;
    const heightFor = (value: number): number => (value / max) * 150;
    const labelEvery = Math.max(1, Math.ceil(count / 10));
    const bars = stats.days.map((day, index) => {
      const slotStart = slot * index;
      const center = slotStart + halfSlot;
      const [, month, dayOfMonth] = day.day.split('-');
      const label = `${dayOfMonth}/${month}`;
      const height = heightFor(day.count);
      const perHour = day.perHour.toLocaleString('pt-BR');
      const trend = day.movingAverage.toLocaleString('pt-BR');
      return {
        id: day.day,
        x: center - halfBar,
        y: 170 - height,
        width: barWidth,
        height,
        center,
        trendY: 170 - heightFor(day.movingAverage),
        isAbove: day.count > stats.average,
        leftPercent: (center / 700) * 100,
        showLabel: index % labelEvery === 0,
        label,
        tooltip: `${label} · ${day.count} distrações em ${day.blocks} bloco(s) · ${perHour}/h · média 7 dias: ${trend}`,
      };
    });
    return {
      max,
      averageY: 170 - heightFor(stats.average),
      bars,
      trend: bars.map((bar) => `${bar.center},${bar.trendY}`).join(' '),
    };
  });
  // Stacked chart: one column per study day, one segment per distraction
  // category, dashed line at the daily average. Colors follow the category's
  // position in the player's list (validated dark palette), so a category keeps
  // its color whatever else shows up that day; past 8 they fold into "Outros".
  readonly distractionChart = computed(() => {
    const stats = this.dailyDistractionStats();
    const palette = DISTRACTION_PALETTE;
    const seen = new Set(stats.days.flatMap((day) => Object.keys(day.categories)));
    const ordered = [
      ...this.academy.distractionCategories().filter((name) => seen.has(name)),
      ...[...seen].filter((name) => !this.academy.distractionCategories().includes(name)),
    ];
    const kept =
      ordered.length > palette.length ? ordered.slice(0, palette.length - 1) : ordered;
    const OTHERS = 'Outros';
    const series = [
      ...kept.map((name, index) => ({ name, color: palette[index] })),
      ...(kept.length < ordered.length
        ? [{ name: OTHERS, color: palette[palette.length - 1] }]
        : []),
    ];
    const seriesOf = (name: string): string => (kept.includes(name) ? name : OTHERS);

    const count = stats.days.length;
    const max = Math.max(1, stats.average, ...stats.days.map((day) => day.count));
    const slot = count ? 700 / count : 700;
    const barWidth = Math.min(46, slot * 0.7);
    const heightFor = (value: number): number => (value / max) * 150;
    const labelEvery = Math.max(1, Math.ceil(count / 10));
    const columns = stats.days.map((day, index) => {
      const center = slot * index + slot / 2;
      const [, month, dayOfMonth] = day.day.split('-');
      const label = `${dayOfMonth}/${month}`;
      const totals = new Map<string, number>();
      for (const [name, value] of Object.entries(day.categories)) {
        totals.set(seriesOf(name), (totals.get(seriesOf(name)) ?? 0) + value);
      }
      let top = 170;
      const segments = series
        .filter((item) => totals.has(item.name))
        .map((item) => {
          const value = totals.get(item.name) ?? 0;
          const height = heightFor(value);
          top -= height;
          return {
            name: item.name,
            color: item.color,
            y: top,
            // 2px gap between stacked segments
            height: Math.max(0, height - 2),
            tooltip: `${label} · ${item.name}: ${value}`,
          };
        });
      const breakdown = segments
        .map((item) => `${item.name} ${totals.get(item.name)}`)
        .join(', ');
      return {
        id: day.day,
        x: center - barWidth / 2,
        width: barWidth,
        leftPercent: (center / 700) * 100,
        showLabel: index % labelEvery === 0,
        label,
        segments,
        tooltip: `${label} · ${day.count} distrações em ${day.blocks} bloco(s)${breakdown ? ' · ' + breakdown : ''}`,
      };
    });
    return {
      max,
      averageY: 170 - heightFor(stats.average),
      columns,
      series,
    };
  });
  readonly postSessionReviewPrompt = signal<{
    nodeId: string;
    areaId: string;
    title: string;
  } | null>(null);
  readonly selectedArea = computed(
    () => this.academy.areas().find((area) => area.id === this.selectedAreaId()) ?? null,
  );
  readonly areaNodes = computed(() =>
    this.academy
      .nodes()
      .filter((node) => node.areaId === this.selectedAreaId())
      .sort((a, b) => a.position - b.position),
  );
  readonly libraryParent = computed(
    () => this.areaNodes().find((node) => node.id === this.libraryParentId()) ?? null,
  );
  readonly visibleLibraryNodes = computed(() =>
    this.areaNodes()
      .filter((node) => node.parentId === this.libraryParentId())
      .sort(
        (a, b) =>
          studyNodePriorityRank(a) - studyNodePriorityRank(b) || a.position - b.position,
      ),
  );
  readonly libraryView = signal<'grid' | 'kanban'>(this.readStoredLibraryView());
  /**
   * Kanban columns for the current library level. A node whose topic review is
   * due shows under "Revisando" until it's reviewed, whatever its stored column.
   */
  /**
   * Completion (0-1) of every node in the area that has children: a leaf counts
   * 1 when completed, a parent is the average of its children - so a course's
   * lessons drive its share of the folder.
   */
  readonly nodeProgress = computed(() => {
    const nodes = this.areaNodes();
    const children = new Map<string, StudyNode[]>();
    for (const node of nodes) {
      if (!node.parentId) continue;
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
    }
    const result = new Map<string, number>();
    const visit = (node: StudyNode, seen: Set<string>): number => {
      const kids = children.get(node.id) ?? [];
      if (!kids.length || seen.has(node.id)) {
        return studyNodeStatus(node) === 'completed' ? 1 : 0;
      }
      const cached = result.get(node.id);
      if (cached !== undefined) return cached;
      const next = new Set(seen).add(node.id);
      const value = kids.reduce((sum, kid) => sum + visit(kid, next), 0) / kids.length;
      result.set(node.id, value);
      return value;
    };
    nodes.forEach((node) => visit(node, new Set()));
    return result;
  });
  /**
   * "No ritmo atual você termina em ~X" for every unfinished parent: items
   * (leaves) still open / items completed per week in the last 4 weeks under
   * that parent - or, if none there, across the whole area.
   */
  readonly nodeEta = computed(() => {
    const nodes = this.areaNodes();
    const children = new Map<string, StudyNode[]>();
    for (const node of nodes) {
      if (!node.parentId) continue;
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
    }
    const windowDays = 28;
    const since = Date.now() - windowDays * 86_400_000;
    const leavesOf = (node: StudyNode, seen = new Set<string>()): StudyNode[] => {
      const kids = children.get(node.id) ?? [];
      if (!kids.length || seen.has(node.id)) return [node];
      seen.add(node.id);
      return kids.flatMap((kid) => leavesOf(kid, seen));
    };
    const recentDone = (leaves: StudyNode[]): number =>
      leaves.filter(
        (leaf) =>
          studyNodeStatus(leaf) === 'completed' && (leaf.completedAt ?? 0) >= since,
      ).length;
    const areaLeaves = nodes.filter((node) => !children.has(node.id));
    const areaRate = (recentDone(areaLeaves) / windowDays) * 7;
    const result = new Map<string, { label: string; title: string }>();
    for (const node of nodes) {
      if (!children.has(node.id)) continue;
      const leaves = leavesOf(node);
      const remaining = leaves.filter((leaf) => studyNodeStatus(leaf) !== 'completed');
      if (!remaining.length) continue;
      const ownRate = (recentDone(leaves) / windowDays) * 7;
      const rate = ownRate || areaRate;
      if (!rate) {
        result.set(node.id, {
          label: 'sem ritmo recente',
          title: 'Nenhum item concluído nas últimas 4 semanas para estimar o término.',
        });
        continue;
      }
      const days = Math.max(1, Math.ceil((remaining.length / rate) * 7));
      const end = new Date(Date.now() + days * 86_400_000);
      const span = days < 14 ? `~${days} dias` : `~${Math.round(days / 7)} sem.`;
      const pace = `${rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} itens/semana`;
      result.set(node.id, {
        label: `termina em ${span} (${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`,
        title:
          `Faltam ${remaining.length} de ${leaves.length} itens. No ritmo atual ` +
          `(${pace}${ownRate ? '' : ' na área toda'}, últimas 4 semanas) ` +
          `você termina em ${span}, por volta de ${end.toLocaleDateString('pt-BR')}.`,
      });
    }
    return result;
  });
  readonly libraryKanban = computed(() =>
    STUDY_NODE_STATUSES.map((column) => ({
      ...column,
      nodes: this.visibleLibraryNodes().filter(
        (node) => this.nodeBoardStatus(node).id === column.id,
      ),
    })),
  );
  readonly libraryBreadcrumbs = computed(() => {
    const result: StudyNode[] = [];
    let current = this.libraryParent();
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      result.unshift(current);
      current = this.areaNodes().find((node) => node.id === current?.parentId) ?? null;
    }
    return result;
  });
  readonly nextLibraryKind = computed<StudyNodeKind | null>(() =>
    this.nextKindAfter(this.libraryParent()?.kind ?? null),
  );
  // Mirrors the Biblioteca tab's own navigation (children-by-parentId,
  // regardless of kind) instead of filtering by a fixed kind per dropdown -
  // the real tree can nest folder > course > module > topic > subtopic, so a
  // kind-based filter either missed nodes tucked inside folders or (via the
  // old empty-match fallback) spilled every topic in the area into the list.
  readonly sessionModules = computed(() =>
    this.areaNodes().filter((node) => !node.parentId),
  );
  readonly sessionTopics = computed(() =>
    this.areaNodes().filter((node) => node.parentId === this.selectedModuleId()),
  );
  readonly sessionSubtopics = computed(() =>
    this.areaNodes().filter((node) => node.parentId === this.selectedTopicId()),
  );
  readonly heatmapDays = computed(() => this.calendarYearDays(this.heatmapYear()));
  readonly heatmapYears = computed(() => {
    const years = new Set(
      this.academy.dashboard().recentDays.map((day) => Number(day.date.slice(0, 4))),
    );
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  });
  readonly heatmapYearMinutes = computed(() =>
    this.heatmapDays().reduce((total, day) => total + day.minutes, 0),
  );
  readonly chartDays = computed(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const earliestDate = this.academy
      .dashboard()
      .recentDays.reduce(
        (min, day) => (day.date < min ? day.date : min),
        this.localDateKey(today),
      );
    const start = new Date(`${earliestDate}T12:00:00`);
    const daySpan = Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
    return this.continuousDays(Math.max(30, daySpan));
  });
  readonly chartMidIndex = computed(() => Math.floor((this.chartDays().length - 1) / 2));
  private readonly chartRawSeries = computed(() => {
    const days = this.chartDays();
    const filter = this.chartFilter();
    if (filter === 'all') {
      return this.academy.areas().map((area) => ({
        id: area.id,
        title: area.title,
        color: area.color,
        values: days.map((day) => day.aggregate?.areaMinutes[area.id] ?? 0),
      }));
    }
    const [kind, id] = filter.split(':');
    const area =
      kind === 'area' ? this.academy.areas().find((item) => item.id === id) : undefined;
    return [
      {
        id: id || 'total',
        title: area?.title ?? 'Total',
        color: area?.color ?? '#b883ff',
        values: days.map((day) =>
          kind === 'area'
            ? (day.aggregate?.areaMinutes[id] ?? 0)
            : (day.aggregate?.totalMinutes ?? 0),
        ),
      },
    ];
  });
  readonly chartMax = computed(() =>
    Math.max(30, ...this.chartRawSeries().flatMap((series) => series.values)),
  );
  readonly chartSeries = computed<StudyChartSeries[]>(() => {
    const days = this.chartDays();
    const max = this.chartMax();
    return this.chartRawSeries().map((series) => {
      const points = series.values.map((value, index) => {
        const x = days.length === 1 ? 0 : (index / (days.length - 1)) * 700;
        const y = 170 - (value / max) * 150;
        return { x, y, value, date: days[index].date, label: days[index].label };
      });
      return {
        id: series.id,
        title: series.title,
        color: series.color,
        points,
        polyline: points
          .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
          .join(' '),
      };
    });
  });
  readonly formationProgress = computed(() => {
    const total = this.academy.dashboard().totalTopics;
    return total ? (this.academy.dashboard().completedTopics / total) * 100 : 0;
  });
  readonly areaDistribution = computed(() => {
    const totals = new Map<string, number>();
    for (const day of this.academy.dashboard().recentDays) {
      for (const [areaId, minutes] of Object.entries(day.areaMinutes ?? {})) {
        totals.set(areaId, (totals.get(areaId) ?? 0) + minutes);
      }
    }
    const rows = this.academy
      .areas()
      .map((area) => ({
        id: area.id,
        title: area.title,
        color: area.color,
        minutes: totals.get(area.id) ?? 0,
      }))
      .filter((row) => row.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    const total = rows.reduce((sum, row) => sum + row.minutes, 0);
    let cursor = 0;
    const stops = rows.map((row) => {
      const start = cursor;
      cursor += total ? (row.minutes / total) * 100 : 0;
      return `${row.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    return {
      rows,
      total,
      background: total
        ? `conic-gradient(${stops.join(', ')})`
        : 'conic-gradient(#29273a 0 100%)',
    };
  });
  readonly currentCard = computed(() => this.academy.dueCards()[0] ?? null);

  private readonly _taskService = inject(TaskService);
  private readonly _snackService = inject(SnackService);
  private readonly _allTasks = toSignal(inject(Store).select(selectAllTasks), {
    initialValue: [] as Task[],
  });

  /** Today's unfinished top-level tasks a library card can join as a subtask, study blocks first. */
  readonly todayTaskBlocks = computed(() => {
    const isStudy = (task: Task): boolean => /estud/i.test(task.title);
    return todayBlockTasks(this._allTasks(), getDbDateStr(), (ms) =>
      getDbDateStr(ms),
    ).sort((a, b) => Number(isStudy(b)) - Number(isStudy(a)));
  });

  addNodeAsSubtask(node: StudyNode, block: Task): void {
    const subTaskTitles = new Set(
      this._allTasks()
        .filter((task) => task.parentId === block.id)
        .map((task) => task.title),
    );
    if (subTaskTitles.has(node.title)) {
      this._snackService.open(`"${node.title}" já é subtarefa de "${block.title}".`);
      return;
    }
    this._taskService.addSubTaskTo(block.id, { title: node.title });
    this._snackService.open({
      ico: 'playlist_add',
      msg: `"${node.title}" virou subtarefa de "${block.title}".`,
    });
  }

  /**
   * Overdue topic reviews cost the character XP every late day (see
   * reviewDelayCharges). Re-runs whenever the reviews change; already
   * charged days are skipped, so it's safe to run repeatedly.
   */
  /** XP each due topic already lost to delay, and what tomorrow would cost. */
  readonly reviewDelayByNode = computed(() => {
    const streaks = this.profile.reviewDelayStreaks(this.academy.profileId());
    const today = getDbDateStr();
    return new Map(
      this.todayReviewList().map((row) => [
        row.node.id,
        reviewDelayStatus(streaks[row.node.id], today),
      ]),
    );
  });

  private readonly _chargeReviewDelays = effect(() => {
    const characterId = this.academy.profileId();
    const reviews = this.academy.topicReviews();
    const nodes = this.academy.nodes();
    if (this.academy.loading() || !characterId || !nodes.length) return;
    untracked(() => {
      const liveIds = new Set(nodes.map((node) => node.id));
      const { streaks, charges } = reviewDelayCharges(
        reviews.filter((review) => liveIds.has(review.nodeId)),
        this.profile.reviewDelayStreaks(characterId),
        getDbDateStr(),
        (ms) => getDbDateStr(ms),
      );
      if (charges.length) this.profile.chargeReviewDelays(characterId, streaks, charges);
    });
  });

  readonly todayReviewList = computed(() => {
    const now = Date.now();
    return this.academy
      .dueTopicReviews()
      .map((state) => {
        const node = this.academy.nodes().find((item) => item.id === state.nodeId);
        if (!node) return null;
        return {
          state,
          node,
          path: this.nodePath(node),
          overdueDays: Math.max(0, Math.floor((now - state.dueAt) / 86_400_000)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
  });

  readonly thisWeekReviewList = computed(() => {
    const now = Date.now();
    const weekAhead = now + 7 * 86_400_000;
    return this.academy
      .topicReviews()
      .filter((state) => state.dueAt > now && state.dueAt <= weekAhead)
      .sort((a, b) => a.dueAt - b.dueAt)
      .map((state) => {
        const node = this.academy.nodes().find((item) => item.id === state.nodeId);
        if (!node) return null;
        return {
          state,
          node,
          path: this.nodePath(node),
          daysUntil: Math.max(1, Math.ceil((state.dueAt - now) / 86_400_000)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
  });

  readonly todayReviewGroups = computed(() => this.groupByArea(this.todayReviewList()));
  readonly thisWeekReviewGroups = computed(() =>
    this.groupByArea(this.thisWeekReviewList()),
  );

  readonly reviewingNode = computed(
    () => this.academy.nodes().find((node) => node.id === this.reviewingNodeId()) ?? null,
  );
  readonly reviewingNodePath = computed(() => {
    const node = this.reviewingNode();
    return node ? this.nodePath(node) : '';
  });
  readonly reviewingNodeState = computed<TopicReviewState | null>(() => {
    const nodeId = this.reviewingNodeId();
    return nodeId ? this.academy.topicReviewFor(nodeId) : null;
  });
  readonly reviewingNodeLastStudiedAt = computed(() => {
    const nodeId = this.reviewingNodeId();
    if (!nodeId) return null;
    const sessions = this.academy
      .recentSessions()
      .filter((session) => session.nodeId === nodeId)
      .sort((a, b) => b.startedAt - a.startedAt);
    return sessions[0]?.startedAt ?? null;
  });
  readonly reviewingNodeDueFlashcardsCount = computed(() => {
    const nodeId = this.reviewingNodeId();
    if (!nodeId) return 0;
    return this.academy.dueCards().filter((card) => card.nodeId === nodeId).length;
  });

  areaTitle = '';
  areaColor = '#7357c8';
  quickCreateTitle = '';
  quickCreateColor = '#7357c8';
  nodeTitle = '';
  nodeKind: StudyNodeKind = 'course';
  sessionTitle = '';
  sessionMinutes = 50;
  sessionLogDate = this.localDateKey(new Date());
  readonly today = this.localDateKey(new Date());
  editSessionTitle = '';
  editSessionDate = '';
  editSessionMinutes = 0;
  flashcardQuestion = '';
  flashcardAnswer = '';
  editorTitle = '';
  editorDescription = '';
  editorNotes = '';
  editorLinks: Array<{ label: string; url: string }> = [];
  editorDrawing: ExcalidrawDrawing | null = null;
  editorCategory: StudyNodeCategory | undefined = undefined;
  readonly nodeCategories = STUDY_NODE_CATEGORIES;
  editorPriority: StudyNodePriority = 'medium';
  readonly nodePriorities = STUDY_NODE_PRIORITIES;
  editorLinkLabel = '';
  editorLinkUrl = '';
  editorPhotos: StudyNodePhoto[] = [];
  editorNotebooks: StudyNodeNotebookRef[] = [];
  editorNotebookName = '';
  editorNotebookFrom: number | null = null;
  editorNotebookTo: number | null = null;
  editorQuizScore: number | null = null;
  editorQuizMax: number | null = null;
  readonly photoPreview = signal<StudyNodePhoto | null>(null);
  /** Notebook names already used anywhere, offered as suggestions. */
  readonly knownNotebooks = computed(() =>
    [
      ...new Set(
        this.academy
          .nodes()
          .flatMap((node) => (node.notebooks ?? []).map((ref) => ref.notebook)),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
  );

  async ngOnInit(): Promise<void> {
    this.restoreWeekPlan();
    await this.academy.load(this.selectedCharacterId());
    this.selectedAreaId.set(this.academy.areas()[0]?.id ?? '');
    await this._openLinkedTopicReview();
  }

  /**
   * ?reviewTopic=<nodeId> (from the Agenda de Trabalho): opens that topic's
   * review, adding it to the review list first when it isn't there yet.
   */
  private async _openLinkedTopicReview(): Promise<void> {
    const nodeId = this._route.snapshot.queryParamMap.get('reviewTopic');
    if (!nodeId) return;
    void this._router.navigate([], {
      relativeTo: this._route,
      queryParams: { reviewTopic: null },
      replaceUrl: true,
    });
    const node = this.academy.nodes().find((item) => item.id === nodeId);
    if (!node) return;
    this.selectedAreaId.set(node.areaId);
    if (!this.academy.isNodeInReview(nodeId)) {
      await this.academy.addNodeToReview(nodeId, node.areaId);
    }
    if (this.academy.isNodeInReview(nodeId)) this.openTopicReview(nodeId);
  }

  async selectCharacter(characterId: string): Promise<void> {
    if (!characterId || characterId === this.selectedCharacterId()) return;
    this.selectedCharacterId.set(characterId);
    this.restoreWeekPlan();
    this.selectedAreaId.set('');
    this.selectedModuleId.set('');
    this.selectedTopicId.set('');
    this.selectedSubtopicId.set('');
    this.libraryParentId.set(null);
    await this.academy.load(characterId);
    this.selectedAreaId.set(this.academy.areas()[0]?.id ?? '');
  }

  async createArea(): Promise<void> {
    await this.academy.addArea(this.areaTitle, this.areaColor);
    this.areaTitle = '';
    this.selectedAreaId.set(this.academy.areas().at(-1)?.id ?? '');
  }

  async createNode(): Promise<void> {
    const areaId = this.selectedAreaId();
    const kind = this.nextLibraryKind();
    if (!areaId || !kind) return;
    await this.academy.addNode(areaId, this.libraryParentId(), kind, this.nodeTitle);
    this.nodeTitle = '';
  }

  selectLibraryArea(areaId: string): void {
    this.selectedAreaId.set(areaId);
    this.libraryParentId.set(null);
  }

  openLibraryNode(node: StudyNode): void {
    if (node.kind !== 'subtopic') this.libraryParentId.set(node.id);
  }

  /**
   * Module cards (the "playlist" level, usually summarized in the card
   * itself) open their editor on click; their corner button enters the next
   * level instead. Every other level keeps click = enter, corner = settings.
   */
  isSummaryCard(node: StudyNode): boolean {
    return node.kind === 'module';
  }

  onLibraryCardClick(node: StudyNode): void {
    if (this.isSummaryCard(node)) this.openNodeEditor(node);
    else this.openLibraryNode(node);
  }

  onLibraryCardCorner(node: StudyNode): void {
    if (this.isSummaryCard(node)) this.libraryParentId.set(node.id);
    else this.openNodeEditor(node);
  }

  setLibraryView(view: 'grid' | 'kanban'): void {
    this.libraryView.set(view);
    try {
      localStorage.setItem('academy-library-view', view);
    } catch {}
  }

  private readStoredLibraryView(): 'grid' | 'kanban' {
    try {
      return localStorage.getItem('academy-library-view') === 'kanban'
        ? 'kanban'
        : 'grid';
    } catch {
      return 'grid';
    }
  }

  async dropOnGrid(event: CdkDragDrop<unknown, unknown, StudyNode>): Promise<void> {
    await this.moveNodeInLevel(
      event.item.data,
      this.visibleLibraryNodes(),
      event.currentIndex,
    );
  }

  async dropOnKanbanColumn(
    event: CdkDragDrop<StudyNodeStatus, StudyNodeStatus, StudyNode>,
  ): Promise<void> {
    const node = event.item.data;
    const column = this.libraryKanban().find((item) => item.id === event.container.data);
    if (!column) return;
    // Also on same-column drops, so re-dropping a completed folder completes
    // anything inside it that was left behind.
    const wasCompleted = studyNodeStatus(node) === 'completed';
    const previous = new Map(
      this.academy.nodes().map((item) => [item.id, studyNodeStatus(item)]),
    );
    const changed = await this.academy.setNodeStatus(node.id, column.id);
    if (column.id === 'completed' && !wasCompleted && this.gemini.configured()) {
      // Closing the quiz before grading it undoes the move (see closeQuiz),
      // so the folder XP only pays out once the quiz is submitted.
      this.quizCompletion = { nodeId: node.id, previous, changed };
      void this.startQuiz(node);
    } else {
      this.rewardCompletedFolders(changed);
    }
    // Dropping into "Revisando" enrols it in spaced repetition.
    if (column.id === 'reviewing') {
      await this.academy.addNodeToReview(node.id, node.areaId);
    }
    await this.moveNodeInLevel(node, column.nodes, event.currentIndex);
  }

  /**
   * XP for finishing a whole folder, proportional to how much is inside it
   * (every course/module/lesson at any depth). Keyed per folder, so reopening
   * and completing it again never pays twice.
   */
  private rewardCompletedFolders(changed: StudyNode[]): void {
    const nodes = this.academy.nodes();
    for (const folder of changed) {
      if (folder.kind !== 'folder' || folder.status !== 'completed') continue;
      let items = 0;
      const pending = [folder.id];
      while (pending.length) {
        const parentId = pending.pop();
        for (const child of nodes.filter((node) => node.parentId === parentId)) {
          items++;
          pending.push(child.id);
        }
      }
      if (!items) continue;
      const xp = items * 25;
      this.profile.grantExternalReward(
        `academy-folder-complete:${folder.id}`,
        xp,
        Math.round(xp / 10),
        'academy-arcana',
        this.selectedCharacterId(),
      );
    }
  }

  /**
   * Places `node` at `index` within `list` (the grid, or one kanban column),
   * then rewrites the whole level's order. If it lands among items of another
   * priority it takes on its upper neighbour's priority (or the lower one's
   * at the top), so the priority-sorted view keeps it where it was dropped.
   */
  private async moveNodeInLevel(
    node: StudyNode,
    list: StudyNode[],
    index: number,
  ): Promise<void> {
    const target = list.filter((item) => item.id !== node.id);
    const prev = target[index - 1];
    const next = target[index];
    const rank = studyNodePriorityRank(node);
    let priority = node.priority ?? 'medium';
    if (prev && studyNodePriorityRank(prev) > rank) priority = prev.priority ?? 'medium';
    else if (next && studyNodePriorityRank(next) < rank) {
      priority = prev ? (prev.priority ?? 'medium') : (next.priority ?? 'medium');
    }

    const level = this.visibleLibraryNodes().filter((item) => item.id !== node.id);
    const anchorIndex = prev
      ? level.findIndex((item) => item.id === prev.id) + 1
      : next
        ? level.findIndex((item) => item.id === next.id)
        : level.length;
    level.splice(anchorIndex, 0, { ...node, priority });
    await this.academy.reorderNodes(
      level.map((item) => ({ id: item.id, priority: item.priority ?? 'medium' })),
    );
  }

  /** Splits a review list into per-area groups (library order), keeping row order. */
  private groupByArea<T extends { node: StudyNode }>(
    rows: T[],
  ): Array<{ areaId: string; title: string; color: string; rows: T[] }> {
    return this.academy
      .areas()
      .map((area) => ({
        areaId: area.id,
        title: area.title,
        color: area.color,
        rows: rows.filter((row) => row.node.areaId === area.id),
      }))
      .filter((group) => group.rows.length);
  }

  /** The column a node shows in: "Revisando" while its review is due. */
  nodeBoardStatus(node: StudyNode): (typeof STUDY_NODE_STATUSES)[number] {
    const review = this.academy.topicReviewFor(node.id);
    const status = studyNodeStatus(node);
    // A due review pulls a card into "Revisando" - but never over an explicit
    // "Completo"/"Parado": moving a card there must stick (the overdue review
    // still shows as a badge and in the Revisar tab).
    const surfacesReview = status !== 'completed' && status !== 'paused';
    const id =
      review && review.dueAt <= Date.now() && surfacesReview ? 'reviewing' : status;
    return STUDY_NODE_STATUSES.find((item) => item.id === id) ?? STUDY_NODE_STATUSES[0];
  }

  priorityLabel(node: StudyNode): string {
    return (
      STUDY_NODE_PRIORITIES.find((item) => item.id === (node.priority ?? 'medium'))
        ?.label ?? ''
    );
  }

  openLibraryLevel(nodeId: string | null): void {
    this.libraryParentId.set(nodeId);
  }

  openNodeEditor(node: StudyNode): void {
    this.editingNodeId.set(node.id);
    this.editorTitle = node.title;
    this.editorDescription = node.description ?? '';
    this.editorNotes = node.notesMarkdown ?? '';
    this.editorLinks = [...(node.links ?? [])];
    this.editorCategory = node.category;
    this.editorPriority = node.priority ?? 'medium';
    this.editorDrawing =
      node.drawing && (!node.drawing.ownerNodeId || node.drawing.ownerNodeId === node.id)
        ? { ...node.drawing, ownerNodeId: node.id }
        : null;
    this.editorLinkLabel = '';
    this.editorLinkUrl = '';
    this.editorPhotos = [...(node.photos ?? [])];
    this.editorNotebooks = [...(node.notebooks ?? [])];
    this.editorNotebookName = '';
    this.editorNotebookFrom = null;
    this.editorNotebookTo = null;
    this.selectionFlashcard.set(null);
    this.flashcardNotice.set('');
    this.aiCards.set(null);
    this.editorAiMessage.set('');
    this.tutorOpen.set(false);
    this.tutorMessages.set([]);
    this.editorQuizScore = node.quizScore?.score ?? null;
    this.editorQuizMax = node.quizScore?.max ?? null;
    this.notesMode.set('write');
  }

  closeNodeEditor(): void {
    this.excalidrawOpen.set(false);
    this.editingNodeId.set(null);
    this.editorDrawing = null;
  }

  updateEditorDrawing(drawing: ExcalidrawDrawing): void {
    const nodeId = this.editingNodeId();
    if (!nodeId) return;
    this.editorDrawing = {
      ...drawing,
      ownerNodeId: nodeId,
    };
  }

  async closeDrawingEditor(): Promise<void> {
    await this.excalidrawEditor()?.flush();
    const nodeId = this.editingNodeId();
    if (nodeId && this.editorTitle.trim()) {
      await this.academy.updateNodeDetails(nodeId, {
        title: this.editorTitle,
        description: this.editorDescription,
        notesMarkdown: this.editorNotes,
        links: this.editorLinks,
        drawing: this.editorDrawing,
        category: this.editorCategory,
        priority: this.editorPriority,
        photos: this.editorPhotos,
        notebooks: this.editorNotebooks,
        quizScore: this.editorQuizScoreValue(),
      });
    }
    this.excalidrawOpen.set(false);
  }

  addEditorLink(): void {
    const url = this.editorLinkUrl.trim();
    if (!url) return;
    this.editorLinks = [
      ...this.editorLinks,
      { label: this.editorLinkLabel.trim() || url, url },
    ];
    this.editorLinkLabel = '';
    this.editorLinkUrl = '';
  }

  removeEditorLink(index: number): void {
    this.editorLinks = this.editorLinks.filter((_, itemIndex) => itemIndex !== index);
  }

  async addEditorPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    input.value = '';
    const added: StudyNodePhoto[] = [];
    for (const file of files) {
      // 1600px keeps handwriting legible while staying a few hundred KB.
      const dataUrl = await readFileAsShrunkDataUrl(file, 1600);
      added.push({ id: crypto.randomUUID(), name: file.name, dataUrl });
    }
    this.editorPhotos = [...this.editorPhotos, ...added];
    this.cdr.markForCheck();
    if (this.gemini.configured()) {
      for (const photo of added) await this.readPhotoText(photo.id);
    }
  }

  // ---------------- IA (Gemini) ----------------
  readonly gemini = inject(GeminiService);
  private readonly academyAi = inject(AcademyAiService);
  private readonly libraryRepo = inject(ArcaneLibraryRepository);
  readonly editorAiMessage = signal('');
  /** Photo ids whose text is being read right now. */
  readonly readingPhotoIds = signal<string[]>([]);

  /** Reads a photo's text with the AI; keeps it in the editor and the stored node. */
  async readPhotoText(photoId: string): Promise<void> {
    const nodeId = this.editingNodeId();
    const photo = this.editorPhotos.find((item) => item.id === photoId);
    if (!nodeId || !photo) return;
    this.readingPhotoIds.update((ids) => [...ids, photoId]);
    try {
      const text = await this.academyAi.readPhoto(photo.dataUrl);
      if (this.editingNodeId() === nodeId) {
        this.editorPhotos = this.editorPhotos.map((item) =>
          item.id === photoId ? { ...item, text } : item,
        );
      }
      await this.academy.patchNode(nodeId, (node) =>
        node.photos?.some((item) => item.id === photoId)
          ? {
              photos: node.photos.map((item) =>
                item.id === photoId ? { ...item, text } : item,
              ),
            }
          : null,
      );
    } catch (e) {
      this.editorAiMessage.set((e as Error).message);
    } finally {
      this.readingPhotoIds.update((ids) => ids.filter((id) => id !== photoId));
      this.cdr.markForCheck();
    }
  }

  setPhotoText(photoId: string, text: string): void {
    this.editorPhotos = this.editorPhotos.map((item) =>
      item.id === photoId ? { ...item, text } : item,
    );
  }

  // ---- busca na Academia (títulos, anotações, texto das fotos, cadernos) ----
  readonly academySearch = signal('');
  readonly academySearchResults = computed(() => {
    const normalize = (text: string): string =>
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const query = normalize(this.academySearch().trim());
    if (query.length < 2) return [];
    const areas = new Map(this.academy.areas().map((area) => [area.id, area.title]));
    const snippet = (text: string, index: number): string =>
      `${index > 40 ? '…' : ''}${text.slice(Math.max(0, index - 40), index + 80).replace(/\s+/g, ' ')}…`;
    const results: { node: StudyNode; where: string; snippet: string; area: string }[] =
      [];
    for (const node of this.academy.nodes()) {
      if (node.deletedAt || !areas.has(node.areaId)) continue;
      const fields: { where: string; text: string }[] = [
        { where: 'título', text: node.title },
        { where: 'descrição', text: node.description ?? '' },
        { where: 'anotações', text: node.notesMarkdown ?? '' },
        ...(node.photos ?? []).map((photo, index) => ({
          where: `foto ${index + 1}`,
          text: photo.text ?? '',
        })),
        ...(node.notebooks ?? []).map((ref) => ({
          where: 'caderno',
          text: `${ref.notebook} ${this.notebookPages(ref)}`,
        })),
      ];
      for (const field of fields) {
        const index = normalize(field.text).indexOf(query);
        if (index < 0) continue;
        results.push({
          node,
          where: field.where,
          snippet: snippet(field.text, index),
          area: areas.get(node.areaId) ?? '',
        });
        break;
      }
      if (results.length >= 30) break;
    }
    return results;
  });

  openSearchResult(node: StudyNode): void {
    this.selectedAreaId.set(node.areaId);
    this.libraryParentId.set(node.parentId);
    this.tab.set('library');
    this.academySearch.set('');
    this.openNodeEditor(node);
  }

  // ---- flashcards com IA (5 por página/trecho) ----
  readonly aiCards = signal<
    { question: string; answer: string; keep: boolean; source: string }[] | null
  >(null);
  readonly aiCardsBusy = signal(false);

  async generateAiFlashcards(): Promise<void> {
    const textarea = this.notesTextarea()?.nativeElement;
    const selected = textarea
      ? this.editorNotes.slice(textarea.selectionStart, textarea.selectionEnd).trim()
      : '';
    const sources: { label: string; text?: string; imageDataUrl?: string }[] = selected
      ? [{ label: 'trecho selecionado', text: selected }]
      : [
          ...(this.editorNotes.trim()
            ? [{ label: 'anotações', text: this.editorNotes }]
            : []),
          ...this.editorPhotos.map((photo, index) => ({
            label: `foto ${index + 1}`,
            text: photo.text,
            // Only send the image when its text wasn't read yet (saves tokens).
            imageDataUrl: photo.text ? undefined : photo.dataUrl,
          })),
        ];
    if (!sources.length) {
      this.editorAiMessage.set(
        'Selecione um trecho, escreva anotações ou anexe fotos para gerar flashcards.',
      );
      return;
    }
    this.aiCardsBusy.set(true);
    this.editorAiMessage.set(`Gerando 5 flashcards por página (${sources.length})...`);
    const cards: { question: string; answer: string; keep: boolean; source: string }[] =
      [];
    try {
      // Existing cards of the whole area + everything generated in this round
      // are both sent to the AI as "don't repeat" and filtered here by word
      // overlap, since the model doesn't always respect the list.
      const node = this.academy.nodes().find((item) => item.id === this.editingNodeId());
      const existing = node ? await this.academy.areaFlashcards(node.areaId) : [];
      const known = existing.map((card) => card.question);
      let skipped = 0;
      for (const source of sources) {
        const generated = await this.academyAi.flashcards(this.editorTitle, source, [
          ...known,
          ...cards.map((card) => card.question),
        ]);
        let added = 0;
        for (const card of generated) {
          if (added >= 5) break;
          if (
            [...known, ...cards.map((item) => item.question)].some((question) =>
              isSimilarQuestion(question, card.question),
            )
          ) {
            skipped++;
            continue;
          }
          cards.push({ ...card, keep: true, source: source.label });
          added++;
        }
        this.aiCards.set([...cards]);
      }
      this.editorAiMessage.set(
        `Desmarque os que não quiser e clique em "Guardar".${
          skipped ? ` (${skipped} repetido(s) descartado(s))` : ''
        }`,
      );
    } catch (e) {
      this.editorAiMessage.set((e as Error).message);
    } finally {
      this.aiCardsBusy.set(false);
    }
  }

  toggleAiCard(index: number): void {
    this.aiCards.update(
      (cards) =>
        cards?.map((card, itemIndex) =>
          itemIndex === index ? { ...card, keep: !card.keep } : card,
        ) ?? null,
    );
  }

  async saveAiFlashcards(): Promise<void> {
    const node = this.academy.nodes().find((item) => item.id === this.editingNodeId());
    const cards = (this.aiCards() ?? []).filter((card) => card.keep);
    if (!node || !cards.length) return;
    for (const card of cards) {
      await this.academy.addFlashcard(node.areaId, node.id, card.question, card.answer);
    }
    this.aiCards.set(null);
    this.editorAiMessage.set(`${cards.length} flashcard(s) guardados no grimório.`);
  }

  // ---- quiz automático ao marcar como completo ----
  readonly quiz = signal<{
    node: StudyNode;
    loading: boolean;
    error: string;
    questions: AiQuizQuestion[];
    answers: (number | null)[];
    submitted: boolean;
    correct: number;
    /** Question being shown (one at a time). */
    step: number;
    /** Coding exercises dropped because the AI's own solution failed its tests. */
    droppedCode: number;
  } | null>(null);
  readonly quizLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  /** Set while the quiz comes from dropping a card into "Completo". */
  private quizCompletion: {
    nodeId: string;
    previous: Map<string, StudyNodeStatus>;
    changed: StudyNode[];
  } | null = null;

  /** Quiz from the editor's button: no card move to undo. */
  startManualQuiz(node: StudyNode): void {
    this.quizCompletion = null;
    void this.startQuiz(node);
  }

  /**
   * Closing before grading sends the card back to "Estudando" and restores
   * whatever the drop completed along with it (a folder's children).
   */
  async closeQuiz(): Promise<void> {
    const state = this.quiz();
    const completion = this.quizCompletion;
    this.quiz.set(null);
    this.quizCompletion = null;
    if (!completion || state?.submitted) return;
    await this.academy.setNodeStatus(completion.nodeId, 'studying');
    for (const item of completion.changed) {
      const before = completion.previous.get(item.id);
      if (item.id === completion.nodeId || !before || before === 'completed') continue;
      await this.academy.setNodeStatus(item.id, before);
    }
  }

  // ---- tutor do assunto (chat no editor) ----
  readonly tutorOpen = signal(false);
  readonly tutorMessages = signal<{ role: 'user' | 'tutor'; text: string }[]>([]);
  readonly tutorBusy = signal(false);
  tutorQuestion = '';

  async askTutor(): Promise<void> {
    const question = this.tutorQuestion.trim();
    const material = this.editorStudyMaterial();
    if (!question || !material) return;
    const history = this.tutorMessages();
    this.tutorMessages.set([...history, { role: 'user', text: question }]);
    this.tutorQuestion = '';
    this.tutorBusy.set(true);
    try {
      const answer = await this.academyAi.tutor(
        material.node.title,
        material.content,
        history,
        question,
      );
      this.tutorMessages.update((list) => [...list, { role: 'tutor', text: answer }]);
    } catch (e) {
      this.tutorMessages.update((list) => [
        ...list,
        { role: 'tutor', text: `⚠ ${(e as Error).message}` },
      ]);
    } finally {
      this.tutorBusy.set(false);
    }
  }

  // ---- resumo do módulo ----
  readonly summaryBusy = signal(false);

  /** Puts a one-page AI summary at the top of the notes (replacing an older one). */
  async generateSummary(): Promise<void> {
    const material = this.editorStudyMaterial();
    if (!material) return;
    if (!material.content.replace(/^## .*$/gm, '').trim()) {
      this.editorAiMessage.set(
        'Não há material (anotações ou texto das fotos) para resumir.',
      );
      return;
    }
    this.summaryBusy.set(true);
    this.editorAiMessage.set('Resumindo o módulo com IA...');
    try {
      const summary = await this.academyAi.summary(material.node.title, material.content);
      const marker = '## Resumo (IA)';
      const withoutOld = this.editorNotes.includes(marker)
        ? this.editorNotes.replace(/## Resumo \(IA\)[\s\S]*?(?=\n## (?!#)|$)/, '').trim()
        : this.editorNotes.trim();
      this.editorNotes = `${marker}\n\n${summary}\n\n${withoutOld}`.trim();
      this.notesMode.set('preview');
      this.editorAiMessage.set(
        'Resumo colocado no topo das anotações - salve para guardar.',
      );
    } catch (e) {
      this.editorAiMessage.set((e as Error).message);
    } finally {
      this.summaryBusy.set(false);
      this.cdr.markForCheck();
    }
  }

  // ---- mapa mental automático (Excalidraw) ----
  readonly mindMapBusy = signal(false);

  async generateMindMap(): Promise<void> {
    const material = this.editorStudyMaterial();
    const nodeId = this.editingNodeId();
    if (!material || !nodeId) return;
    if (
      this.editorDrawing?.elements?.length &&
      !confirmDialog('Substituir o desenho atual pelo mapa mental gerado?')
    ) {
      return;
    }
    this.mindMapBusy.set(true);
    this.editorAiMessage.set('Desenhando o mapa mental...');
    try {
      const map = await this.academyAi.mindMap(material.node.title, material.content);
      const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
      const palette = [
        '#7c5cd6',
        '#2f8f6b',
        '#c0712c',
        '#2f6fb3',
        '#b0436a',
        '#8a8a2a',
        '#4b8a9a',
      ];
      const skeleton: Record<string, unknown>[] = [];
      const box = (
        id: string,
        x: number,
        y: number,
        text: string,
        color: string,
        width: number,
        fontSize: number,
      ): void => {
        skeleton.push({
          type: 'rectangle',
          id,
          x: x - width / 2,
          y: y - 32,
          width,
          height: 64,
          strokeColor: color,
          backgroundColor: color,
          fillStyle: 'solid',
          roundness: { type: 3 },
          label: { text, fontSize, strokeColor: '#ffffff' },
        });
      };
      const arrow = (from: string, to: string, color: string): void => {
        skeleton.push({
          type: 'arrow',
          x: 0,
          y: 0,
          strokeColor: color,
          start: { id: from },
          end: { id: to },
        });
      };
      box('center', 0, 0, map.center || material.node.title, '#c9962c', 260, 22);
      const branches = (map.branches ?? []).slice(0, 8);
      branches.forEach((branch, index) => {
        const angle = (index / branches.length) * Math.PI * 2 - Math.PI / 2;
        const color = palette[index % palette.length];
        const bx = Math.cos(angle) * 420;
        const by = Math.sin(angle) * 300;
        const branchId = `b${index}`;
        box(branchId, bx, by, branch.label, color, 220, 18);
        arrow('center', branchId, color);
        const leaves = (branch.children ?? []).slice(0, 6);
        leaves.forEach((leaf, leafIndex) => {
          const spread = 0.5;
          const leafAngle =
            angle +
            (leaves.length > 1
              ? (leafIndex / (leaves.length - 1) - 0.5) * spread * 2
              : 0);
          const lx = Math.cos(leafAngle) * 820;
          const ly =
            Math.sin(leafAngle) * 560 + (leafIndex - (leaves.length - 1) / 2) * 20;
          const leafId = `${branchId}l${leafIndex}`;
          box(leafId, lx, ly, leaf, '#2a2738', 200, 15);
          arrow(branchId, leafId, color);
        });
      });
      const elements = convertToExcalidrawElements(skeleton as never) as unknown[];
      this.editorDrawing = {
        version: 1,
        ownerNodeId: nodeId,
        elements,
        appState: { theme: 'dark', viewBackgroundColor: '#0d1020', gridSize: null },
        files: {},
        previewDataUrl: null,
        updatedAt: Date.now(),
      };
      // Reopen the canvas so it mounts with the new scene.
      this.excalidrawOpen.set(false);
      this.cdr.markForCheck();
      setTimeout(() => this.excalidrawOpen.set(true));
      this.editorAiMessage.set('Mapa mental pronto - ajuste à vontade e salve.');
    } catch (e) {
      this.editorAiMessage.set((e as Error).message);
    } finally {
      this.mindMapBusy.set(false);
    }
  }

  // ---- revisão ativa (respostas escritas corrigidas pela IA) ----
  readonly activeReview = signal<{
    nodeId: string;
    loading: boolean;
    questions: string[];
    answers: string[];
    result: AiActiveReviewResult | null;
    error: string;
  } | null>(null);

  async startActiveReview(): Promise<void> {
    const node = this.reviewingNode();
    if (!node) return;
    this.activeReview.set({
      nodeId: node.id,
      loading: true,
      questions: [],
      answers: [],
      result: null,
      error: '',
    });
    try {
      const questions = await this.academyAi.activeReviewQuestions(
        node.title,
        this.nodeStudyMaterial(node).content,
      );
      this.activeReview.update((state) =>
        state?.nodeId === node.id
          ? { ...state, loading: false, questions, answers: questions.map(() => '') }
          : state,
      );
    } catch (e) {
      this.activeReview.update((state) =>
        state ? { ...state, loading: false, error: (e as Error).message } : state,
      );
    }
  }

  setActiveAnswer(index: number, text: string): void {
    this.activeReview.update((state) =>
      state
        ? {
            ...state,
            answers: state.answers.map((answer, i) => (i === index ? text : answer)),
          }
        : state,
    );
  }

  async gradeActiveReview(): Promise<void> {
    const state = this.activeReview();
    const node = this.reviewingNode();
    if (!state || !node) return;
    this.activeReview.set({ ...state, loading: true, error: '' });
    try {
      const result = await this.academyAi.gradeActiveReview(
        node.title,
        this.nodeStudyMaterial(node).content,
        state.questions.map((question, index) => ({
          question,
          answer: state.answers[index] ?? '',
        })),
      );
      this.activeReview.set({ ...state, loading: false, result });
    } catch (e) {
      this.activeReview.set({ ...state, loading: false, error: (e as Error).message });
    }
  }

  /** Overall score → the same 4 buttons the manual review uses. */
  activeReviewRating(overall: number): 1 | 2 | 3 | 4 {
    if (overall >= 85) return 4;
    if (overall >= 65) return 3;
    if (overall >= 40) return 2;
    return 1;
  }

  async submitActiveReview(): Promise<void> {
    const result = this.activeReview()?.result;
    if (!result) return;
    await this.submitTopicReview(this.activeReviewRating(result.overall));
    this.activeReview.set(null);
  }

  /** Material of the node open in the editor, with its unsaved edits applied. */
  private editorStudyMaterial(): {
    node: StudyNode;
    content: string;
    images: string[];
  } | null {
    const stored = this.academy.nodes().find((item) => item.id === this.editingNodeId());
    if (!stored) return null;
    const node: StudyNode = {
      ...stored,
      title: this.editorTitle || stored.title,
      description: this.editorDescription,
      notesMarkdown: this.editorNotes,
      photos: this.editorPhotos,
    };
    return { node, ...this.nodeStudyMaterial(node) };
  }

  private nodeStudyMaterial(node: StudyNode): { content: string; images: string[] } {
    const descendants: StudyNode[] = [];
    const visit = (parentId: string, depth: number): void => {
      if (depth > 4) return;
      for (const child of this.academy.nodes()) {
        if (child.parentId !== parentId || child.deletedAt) continue;
        descendants.push(child);
        visit(child.id, depth + 1);
      }
    };
    visit(node.id, 0);
    const all = [node, ...descendants];
    // Each part tagged with its source so the AI can cite it ("[foto 2 · Seção 1]").
    const content = all
      .map((item) =>
        [
          `## ${item.title}`,
          item.description ? `[descrição · ${item.title}]\n${item.description}` : '',
          item.notesMarkdown?.trim()
            ? `[anotações · ${item.title}]\n${item.notesMarkdown}`
            : '',
          ...(item.photos ?? []).map((photo, index) =>
            photo.text ? `[foto ${index + 1} · ${item.title}]\n${photo.text}` : '',
          ),
          item.quizScore
            ? `[nota do quiz · ${item.title}] ${quizScorePercent(item)}%`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');
    const images = all
      .flatMap((item) => item.photos ?? [])
      .filter((photo) => !photo.text)
      .map((photo) => photo.dataUrl);
    return { content, images };
  }

  async startQuiz(node: StudyNode): Promise<void> {
    this.quiz.set({
      node,
      loading: true,
      error: '',
      questions: [],
      answers: [],
      submitted: false,
      correct: 0,
      step: 0,
      droppedCode: 0,
    });
    try {
      const material = this.nodeStudyMaterial(node);
      const { questions, droppedCode } = await this.academyAi.quiz(
        node.title,
        material.content,
        material.images,
      );
      if (this.quiz()?.node.id !== node.id) return;
      if (!questions.length) {
        throw new Error('A IA não gerou perguntas válidas. Tente de novo.');
      }
      this.quiz.update((state) =>
        state
          ? {
              ...state,
              loading: false,
              questions,
              droppedCode,
              answers: questions.map(() => null),
            }
          : state,
      );
    } catch (e) {
      this.quiz.update((state) =>
        state ? { ...state, loading: false, error: (e as Error).message } : state,
      );
    }
  }

  answerQuiz(questionIndex: number, optionIndex: number): void {
    this.quiz.update((state) =>
      state && !state.submitted
        ? {
            ...state,
            answers: state.answers.map((answer, index) =>
              index === questionIndex ? optionIndex : answer,
            ),
          }
        : state,
    );
  }

  /** A coding question counts as answered once tested: 1 = all tests passed, 0 = not. */
  answerCodeQuiz(questionIndex: number, grade: CodeLabGrade): void {
    this.answerQuiz(questionIndex, grade.passed ? 1 : 0);
  }

  quizRight(question: AiQuizQuestion, answer: number | null): boolean {
    return question.kind === 'code' ? answer === 1 : answer === question.correctIndex;
  }

  quizGo(step: number): void {
    this.quiz.update((state) =>
      state
        ? { ...state, step: Math.max(0, Math.min(state.questions.length - 1, step)) }
        : state,
    );
  }

  async submitQuiz(): Promise<void> {
    const state = this.quiz();
    if (!state || state.submitted) return;
    const correct = state.questions.filter((question, index) =>
      this.quizRight(question, state.answers[index]),
    ).length;
    this.quiz.set({ ...state, submitted: true, correct });
    if (this.quizCompletion) {
      this.rewardCompletedFolders(this.quizCompletion.changed);
      this.quizCompletion = null;
    }
    await this.academy.patchNode(state.node.id, () => ({
      quizScore: { score: correct, max: state.questions.length, at: Date.now() },
    }));
  }

  // ---- plano de estudo da semana ----
  readonly weekPlan = signal<StoredWeekPlan | null>(null);
  readonly weekPlanBusy = signal(false);
  readonly weekPlanMessage = signal('');
  /** Study time available per day for the plan (hard limit), per character. */
  readonly weekPlanMinutes = signal(100);
  /** Extra minutes per day for Career Quest, on top of weekPlanMinutes. */
  readonly careerPlanMinutes = signal(30);

  // Second plan, for the areas outside Data Science the user picks.
  readonly otherPlan = signal<StoredWeekPlan | null>(null);
  readonly otherPlanBusy = signal(false);
  readonly otherPlanMessage = signal('');
  readonly otherPlanMinutes = signal(65);
  /** null = never chosen, which means every area outside Data Science. */
  readonly otherPlanAreaIds = signal<string[] | null>(null);
  /** Free text on what to focus on / what kind of suggestions to give. */
  readonly otherPlanFocus = signal('');
  readonly otherPlanAreas = computed(() =>
    [...this.academy.areas()]
      .filter((area) => !this.isDataScience([area.title]))
      .sort((a, b) => a.position - b.position),
  );
  readonly otherPlanSelected = computed(
    () =>
      new Set(this.otherPlanAreaIds() ?? this.otherPlanAreas().map((area) => area.id)),
  );
  private readonly dataScienceAreaIds = computed(
    () =>
      new Set(
        this.academy
          .areas()
          .filter((area) => this.isDataScience([area.title]))
          .map((area) => area.id),
      ),
  );
  readonly weekPlanBalance = computed(() =>
    this.planBalance(this.weekPlan(), this.dataScienceAreaIds(), this.weekPlanMinutes()),
  );
  readonly otherPlanBalance = computed(() =>
    this.planBalance(this.otherPlan(), this.otherPlanSelected(), this.otherPlanMinutes()),
  );

  private isDataScience(values: string[]): boolean {
    return values.some((value) =>
      /data\s*science|ciencia de dados/i.test(
        (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, ''),
      ),
    );
  }

  /** CSS class for a plan block (class names without accents). */
  planBlockClass(kind: string): string {
    return `plan-block kind-${kind.normalize('NFD').replace(/\p{Diacritic}/gu, '')}`;
  }

  /**
   * Planned vs. done minutes for each plan day, from the study sessions of the
   * plan's areas. Career blocks stay out: they are extra time.
   */
  private planBalance(
    plan: StoredWeekPlan | null,
    areaIds: Set<string>,
    dailyMinutes: number,
  ): PlanBalance | null {
    if (!plan?.dates?.length) return null;
    const done = new Map<string, number>();
    for (const session of this.academy.distractionSessions()) {
      if (session.status === 'cancelled' || !areaIds.has(session.areaId)) continue;
      const key = this.localDateKey(new Date(session.startedAt));
      done.set(key, (done.get(key) ?? 0) + (session.actualMinutes || 0));
    }
    const todayKey = this.localDateKey(new Date());
    const days = plan.days.map((day, index) => {
      const date = plan.dates?.[index] ?? '';
      const planned = (day.blocks ?? [])
        .filter((block) => block.kind !== 'carreira')
        .reduce((sum, block) => sum + (Number(block.minutes) || 0), 0);
      const doneMinutes = Math.round(done.get(date) ?? 0);
      const past = !!date && date < todayKey;
      return {
        index,
        label: day.day,
        date,
        planned,
        done: doneMinutes,
        deficit: past && !plan.settled?.[date] ? Math.max(0, planned - doneMinutes) : 0,
      };
    });
    const planned = days.reduce((sum, day) => sum + day.planned, 0);
    const executed = days.reduce((sum, day) => sum + day.done, 0);
    return {
      target: dailyMinutes * days.length,
      planned,
      done: executed,
      left: Math.max(0, planned - executed),
      days,
    };
  }

  private planTarget(kind: 'week' | 'other'): {
    plan: WritableSignal<StoredWeekPlan | null>;
    key: string;
  } {
    return kind === 'week'
      ? { plan: this.weekPlan, key: 'sp-ai-week-plan' }
      : { plan: this.otherPlan, key: 'sp-ai-other-plan' };
  }

  private savePlan(kind: 'week' | 'other', plan: StoredWeekPlan): void {
    const target = this.planTarget(kind);
    target.plan.set(plan);
    this.storePlanSetting(target.key, JSON.stringify(plan));
  }

  toggleWeekGoal(kind: 'week' | 'other', index: number): void {
    const plan = this.planTarget(kind).plan();
    if (!plan) return;
    const goalsDone = [...(plan.goalsDone ?? [])];
    goalsDone[index] = !goalsDone[index];
    this.savePlan(kind, { ...plan, goalsDone });
  }

  /** Drop-list ids of a plan's days, so blocks can move between any of them. */
  planDayListIds(kind: 'week' | 'other', count: number): string[] {
    return Array.from({ length: count }, (_, index) => `plan-${kind}-day-${index}`);
  }

  /** Moves a block inside a day or to another day. */
  movePlanBlock(kind: 'week' | 'other', event: CdkDragDrop<number>): void {
    const plan = this.planTarget(kind).plan();
    if (!plan) return;
    const days = plan.days.map((day) => ({ ...day, blocks: [...(day.blocks ?? [])] }));
    const from = days[event.previousContainer.data];
    const to = days[event.container.data];
    if (!from || !to) return;
    if (from === to) moveItemInArray(to.blocks, event.previousIndex, event.currentIndex);
    else
      transferArrayItem(from.blocks, to.blocks, event.previousIndex, event.currentIndex);
    this.savePlan(kind, { ...plan, days });
  }

  /** Reorders whole days: the content moves, the day labels/dates stay in place. */
  movePlanDay(kind: 'week' | 'other', event: CdkDragDrop<unknown>): void {
    const plan = this.planTarget(kind).plan();
    if (!plan || event.previousIndex === event.currentIndex) return;
    const contents = plan.days.map((day) => ({ blocks: day.blocks, note: day.note }));
    moveItemInArray(contents, event.previousIndex, event.currentIndex);
    const days = plan.days.map((day, index) => ({ ...day, ...contents[index] }));
    this.savePlan(kind, { ...plan, days });
  }

  togglePlanBlock(kind: 'week' | 'other', dayIndex: number, blockIndex: number): void {
    const plan = this.planTarget(kind).plan();
    if (!plan) return;
    const days = plan.days.map((day, index) =>
      index === dayIndex
        ? {
            ...day,
            blocks: day.blocks.map((block, position) =>
              position === blockIndex ? { ...block, done: !block.done } : block,
            ),
          }
        : day,
    );
    this.savePlan(kind, { ...plan, days });
  }

  goalsPercent(plan: StoredWeekPlan): number {
    const total = plan.goals?.length ?? 0;
    return total
      ? Math.round(((plan.goalsDone ?? []).filter(Boolean).length / total) * 100)
      : 0;
  }

  /**
   * What to do with the minutes a past day missed: spread them over the
   * remaining days as catch-up, turn them into a review tomorrow, or drop them.
   */
  settleDeficit(
    kind: 'week' | 'other',
    dayIndex: number,
    action: 'redistribute' | 'review' | 'discard',
  ): void {
    const plan = this.planTarget(kind).plan();
    const balance = kind === 'week' ? this.weekPlanBalance() : this.otherPlanBalance();
    const day = balance?.days[dayIndex];
    if (!plan?.dates || !day?.deficit) return;
    const todayKey = this.localDateKey(new Date());
    const remaining = plan.dates
      .map((date, index) => ({ date, index }))
      .filter((item) => item.date >= todayKey)
      .map((item) => item.index);
    const missed = (plan.days[dayIndex].blocks ?? [])
      .filter((block) => block.kind === 'estudo' || block.kind === 'sugestão')
      .map((block) => block.title)
      .join(' + ');
    const days = plan.days.map((item) => ({ ...item, blocks: [...(item.blocks ?? [])] }));
    if (action !== 'discard' && remaining.length) {
      if (action === 'redistribute') {
        const share = Math.max(5, Math.round(day.deficit / remaining.length / 5) * 5);
        for (const index of remaining) {
          days[index].blocks.push({
            title: `Compensação de ${day.label}: ${missed || 'estudo'}`,
            minutes: share,
            kind: 'estudo',
          });
        }
      } else {
        days[remaining[0]].blocks.push({
          title: `Revisar o que faltou em ${day.label}: ${missed || 'estudo do dia'}`,
          minutes: Math.min(25, day.deficit),
          kind: 'revisão',
        });
      }
    }
    this.savePlan(kind, {
      ...plan,
      days,
      settled: { ...plan.settled, [day.date]: action },
    });
  }

  setWeekPlanMinutes(value: number): void {
    const minutes = Math.max(25, Math.min(600, Math.round(Number(value) || 100)));
    this.weekPlanMinutes.set(minutes);
    this.storePlanSetting('sp-ai-week-plan-minutes', String(minutes));
  }

  setCareerPlanMinutes(value: number): void {
    const minutes = Math.max(0, Math.min(300, Math.round(Number(value) || 0)));
    this.careerPlanMinutes.set(minutes);
    this.storePlanSetting('sp-ai-career-plan-minutes', String(minutes));
  }

  setOtherPlanMinutes(value: number): void {
    const minutes = Math.max(25, Math.min(600, Math.round(Number(value) || 65)));
    this.otherPlanMinutes.set(minutes);
    this.storePlanSetting('sp-ai-other-plan-minutes', String(minutes));
  }

  toggleOtherPlanArea(areaId: string): void {
    const selected = new Set(this.otherPlanSelected());
    if (selected.has(areaId)) selected.delete(areaId);
    else selected.add(areaId);
    this.otherPlanAreaIds.set([...selected]);
    this.storePlanSetting('sp-ai-other-plan-areas', JSON.stringify([...selected]));
  }

  setOtherPlanFocus(value: string): void {
    this.otherPlanFocus.set(value);
    this.storePlanSetting('sp-ai-other-plan-focus', value);
  }

  private storePlanSetting(key: string, value: string): void {
    try {
      localStorage.setItem(`${key}:${this.selectedCharacterId()}`, value);
    } catch {}
  }

  private readPlanSetting(key: string): string | null {
    try {
      return localStorage.getItem(`${key}:${this.selectedCharacterId()}`);
    } catch {
      return null;
    }
  }

  restoreWeekPlan(): void {
    this.weekPlanMinutes.set(
      Number(this.readPlanSetting('sp-ai-week-plan-minutes')) || 100,
    );
    const career = this.readPlanSetting('sp-ai-career-plan-minutes');
    this.careerPlanMinutes.set(career === null ? 30 : Number(career) || 0);
    this.otherPlanMinutes.set(
      Number(this.readPlanSetting('sp-ai-other-plan-minutes')) || 65,
    );
    this.otherPlanFocus.set(this.readPlanSetting('sp-ai-other-plan-focus') ?? '');
    for (const kind of ['week', 'other'] as const) {
      const target = this.planTarget(kind);
      try {
        const stored = this.readPlanSetting(target.key);
        target.plan.set(stored ? JSON.parse(stored) : null);
      } catch {
        target.plan.set(null);
      }
    }
    try {
      const areas = this.readPlanSetting('sp-ai-other-plan-areas');
      this.otherPlanAreaIds.set(areas ? JSON.parse(areas) : null);
    } catch {
      this.otherPlanAreaIds.set(null);
    }
  }

  /**
   * What the AI needs to plan the given areas: the concrete study queue, the
   * reviews (overdue + due in the plan days) and the low quiz grades. The plan
   * covers the next 5 weekdays - weekends stay free.
   */
  private planContext(areaIds: Set<string>): {
    weekDays: string[];
    dates: string[];
    studying: string[];
    reviews: string[];
    low: string[];
    idleAreas: { title: string; backlog: string[] }[];
  } {
    const live = this.academy.nodes().filter((node) => !node.deletedAt);
    const nodes = new Map(live.map((node) => [node.id, node]));
    const areas = [...this.academy.areas()]
      .filter((area) => areaIds.has(area.id))
      .sort((a, b) => a.position - b.position);
    const areaTitle = new Map(areas.map((area) => [area.id, area.title]));
    // "Área › Curso › Módulo › Tópico", as the Kanban shows it.
    const path = (node: StudyNode | undefined): string => {
      const parts: string[] = [];
      let current = node;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        parts.unshift(current.title);
        current = current.parentId ? nodes.get(current.parentId) : undefined;
      }
      return node ? [areaTitle.get(node.areaId) ?? '', ...parts].join(' › ') : '';
    };
    const childrenOf = (parentId: string | null, areaId: string): StudyNode[] =>
      live
        .filter((node) => node.parentId === parentId && node.areaId === areaId)
        .sort(
          (a, b) =>
            studyNodePriorityRank(a) - studyNodePriorityRank(b) ||
            a.position - b.position,
        );
    // Same rule as nodeProgress: leaf = 1 when completed, parent = average.
    const progressOf = (node: StudyNode, seen: Set<string>): number | undefined => {
      const kids = live.filter((item) => item.parentId === node.id);
      if (!kids.length || seen.has(node.id)) return undefined;
      seen.add(node.id);
      return (
        kids.reduce(
          (sum, kid) =>
            sum +
            (progressOf(kid, seen) ?? (studyNodeStatus(kid) === 'completed' ? 1 : 0)),
          0,
        ) / kids.length
      );
    };
    // Last time each node (or anything inside it) got a study session.
    const lastStudied = new Map<string, number>();
    for (const session of [
      ...this.academy.recentSessions(),
      ...this.academy.distractionSessions(),
    ]) {
      if (session.status === 'cancelled') continue;
      const seen = new Set<string>();
      let current = session.nodeId ? nodes.get(session.nodeId) : undefined;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        lastStudied.set(
          current.id,
          Math.max(lastStudied.get(current.id) ?? 0, session.startedAt),
        );
        current = current.parentId ? nodes.get(current.parentId) : undefined;
      }
    }
    const unfinished = (node: StudyNode): boolean =>
      ['backlog', 'studying'].includes(studyNodeStatus(node));
    // Concrete next content inside a branch: follow the unfinished child
    // studied most recently (else the first in order) down to a leaf.
    const nextContent = (node: StudyNode): StudyNode => {
      let current = node;
      for (let depth = 0; depth < 6; depth++) {
        const kids = childrenOf(current.id, current.areaId).filter(unfinished);
        if (!kids.length) break;
        const studied = kids
          .filter((kid) => lastStudied.has(kid.id))
          .sort((a, b) => (lastStudied.get(b.id) ?? 0) - (lastStudied.get(a.id) ?? 0));
        current = studied[0] ?? kids[0];
      }
      return current;
    };
    // Study queue in Kanban order (area, then priority/position, depth-first),
    // keeping only the deepest "Estudando" item of each branch.
    const branches: StudyNode[] = [];
    const walk = (parentId: string | null, areaId: string, depth: number): void => {
      if (depth > 6) return;
      for (const node of childrenOf(parentId, areaId)) {
        const before = branches.length;
        walk(node.id, areaId, depth + 1);
        if (studyNodeStatus(node) === 'studying' && branches.length === before) {
          branches.push(node);
        }
      }
    };
    for (const area of areas) walk(null, area.id, 0);
    // Content studied in the last 14 days and still unfinished jumps ahead,
    // even outside the "Estudando" column, so the plan continues it.
    const recentCutoff = Date.now() - 14 * 86_400_000;
    const recent = live
      .filter(
        (node) =>
          areaTitle.has(node.areaId) &&
          unfinished(node) &&
          (lastStudied.get(node.id) ?? 0) >= recentCutoff &&
          !childrenOf(node.id, node.areaId).some(
            (kid) => unfinished(kid) && lastStudied.has(kid.id),
          ),
      )
      .sort((a, b) => (lastStudied.get(b.id) ?? 0) - (lastStudied.get(a.id) ?? 0))
      .map(nextContent);
    const queue: StudyNode[] = [];
    for (const node of [...recent, ...branches.map(nextContent)]) {
      if (!queue.some((item) => item.id === node.id)) queue.push(node);
    }
    const shortDate = (at: number): string =>
      new Date(at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const studying = queue.slice(0, 25).map((node) => {
      const progress = progressOf(node, new Set());
      const last = lastStudied.get(node.id);
      return `${path(node)}${
        progress !== undefined ? ` (${Math.round(progress * 100)}% feito)` : ''
      }${last ? ` - estudado por último em ${shortDate(last)}, CONTINUAR` : ''}`;
    });
    const dayLabel = (date: Date): string => {
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' });
      return `${weekday[0].toUpperCase()}${weekday.slice(1, 3)} ${shortDate(date.getTime())}`;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const planDays: Date[] = [];
    for (let offset = 0; planDays.length < 5; offset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      if (date.getDay() !== 0 && date.getDay() !== 6) planDays.push(date);
    }
    // Overdue + due up to the last plan day, with the day each one is due.
    const planEnd = planDays[planDays.length - 1].getTime() + 86_400_000;
    const reviews = this.academy
      .topicReviews()
      .filter((state) => state.dueAt < planEnd)
      .sort((a, b) => a.dueAt - b.dueAt)
      .map((state) => {
        const node = nodes.get(state.nodeId);
        if (!node || !areaTitle.has(node.areaId)) return '';
        const overdue = Math.floor((today.getTime() - state.dueAt) / 86_400_000);
        return `${path(node)} - ${
          state.dueAt < today.getTime()
            ? `ATRASADA${overdue > 0 ? ` há ${overdue} dia(s)` : ''}`
            : `vence ${dayLabel(new Date(state.dueAt))}`
        }`;
      })
      .filter(Boolean)
      .slice(0, 40);
    const low = this.quizChart()
      .low.filter((row) => areaTitle.has(row.node.areaId))
      .map((row) => `${path(row.node)} - ${row.percent}%`);
    const idleAreas = areas
      .filter((area) => !queue.some((node) => node.areaId === area.id))
      .map((area) => ({
        title: area.title,
        backlog: live
          .filter(
            (node) =>
              node.areaId === area.id &&
              studyNodeStatus(node) === 'backlog' &&
              !childrenOf(node.id, area.id).length,
          )
          .slice(0, 6)
          .map((node) => path(node)),
      }));
    return {
      weekDays: planDays.map(dayLabel),
      dates: planDays.map((date) => this.localDateKey(date)),
      studying,
      reviews,
      low,
      idleAreas,
    };
  }

  /** Career Quest next actions, most important first (same order as its "hoje" card). */
  private careerActions(): string[] {
    const state = this.profile.state().careerQuest;
    if (!state) return [];
    const renamed = state.skillNameOverrides ?? {};
    const skills = [
      ...CAREER_SKILLS.map((skill) =>
        renamed[skill.id] ? { ...skill, name: renamed[skill.id] } : skill,
      ),
      ...(state.customSkills ?? []),
    ];
    const today = buildTodayPlan(state, skills);
    const byWeek = (a: CareerQuest, b: CareerQuest): number =>
      (a.week ?? 99) - (b.week ?? 99);
    const describe = (quest: CareerQuest): string =>
      `${quest.title} (~${quest.estimatedHours}h${quest.status === 'doing' ? ', em andamento' : ''})`;
    const lines: string[] = [];
    const add = (line: string): void => {
      if (!lines.includes(line)) lines.push(line);
    };
    if (today.primary.quest) add(describe(today.primary.quest));
    else if (today.primary.kind !== 'none') add(today.primary.text);
    for (const quest of state.quests
      .filter((item) => item.id.includes('-entry') && !item.gradedAt)
      .sort(byWeek)) {
      add(`Teste de nivelamento: ${describe(quest)}`);
    }
    for (const step of today.focus) {
      if (step.readyToPromote) {
        add(`Promover ${step.skill.name} para L${step.nextLevel}`);
      } else if (step.quest) {
        add(
          `${step.skill.name} (L${step.current}→L${step.nextLevel}): ${describe(step.quest)}${
            step.missing.length ? ` - falta ${step.missing.join(', ')}` : ''
          }`,
        );
      }
    }
    for (const quest of state.quests
      .filter((item) => item.status !== 'done' && item.type !== 'boss')
      .sort(byWeek)
      .slice(0, 5)) {
      add(describe(quest));
    }
    return lines.slice(0, 10);
  }

  /**
   * Daily limit enforced even if the model overshoots (reading is cut first,
   * reviews last). Career blocks have their own extra allowance.
   */
  private trimPlan(
    generated: AiWeekPlan,
    budget: number,
    careerBudget: number,
    dates: string[],
  ): StoredWeekPlan {
    const keepOrder: Record<string, number> = { revisão: 0, estudo: 1, sugestão: 1 };
    const days = (generated.days ?? []).slice(0, dates.length).map((day) => {
      let used = 0;
      let career = 0;
      const kept = [...(day.blocks ?? [])]
        .sort((a, b) => (keepOrder[a.kind] ?? 2) - (keepOrder[b.kind] ?? 2))
        .filter((block) => {
          const minutes = Math.max(0, Number(block.minutes) || 0);
          if (block.kind === 'carreira') {
            if (career + minutes > careerBudget) return false;
            career += minutes;
            return true;
          }
          if (used + minutes > budget) return false;
          used += minutes;
          return true;
        });
      return {
        ...day,
        blocks: (day.blocks ?? []).filter((block) => kept.includes(block)),
      };
    });
    return {
      ...generated,
      goals: (generated.goals ?? []).filter(Boolean).slice(0, 4),
      days,
      dates,
      goalsDone: [],
      settled: {},
      generatedAt: Date.now(),
    };
  }

  async generateWeekPlan(): Promise<void> {
    this.weekPlanBusy.set(true);
    this.weekPlanMessage.set('Montando o plano da semana com IA...');
    try {
      // The plan only covers Data Science - other areas (chess...) stay out.
      const ctx = this.planContext(this.dataScienceAreaIds());
      const dashboard = this.academy.dashboard();
      const library = await this.libraryRepo.exportProfile(this.selectedCharacterId());
      const pages = library.aggregates.reduce((sum, row) => sum + row.pages, 0);
      const minutes = library.aggregates.reduce((sum, row) => sum + row.minutes, 0);
      const speed = minutes ? pages / minutes : 0;
      const reading = library.books
        .filter(
          (book) =>
            book.status === 'reading' &&
            // No page count yet (0) still counts as being read.
            (!book.pages || book.pages > book.currentPage) &&
            this.isDataScience([book.genre, ...book.subgenres, ...book.tags]),
        )
        .map((book) => {
          if (!book.pages) return book.title;
          const left = book.pages - book.currentPage;
          return `${book.title}: faltam ${left} páginas${
            speed ? ` (~${Math.ceil(left / speed / 50)} blocos de 50 min)` : ''
          }`;
        });
      const careerBudget = this.careerPlanMinutes();
      const career = careerBudget ? this.careerActions() : [];
      const context = [
        `DIAS DO PLANO (use estes rótulos, nesta ordem): ${ctx.weekDays.join(', ')}`,
        `TEMPO DISPONÍVEL: ${this.weekPlanMinutes()} min por dia (limite rígido - nenhum dia pode passar disso)`,
        `Estudo real recente: ~${Math.round(dashboard.weekMinutes / 7)} min/dia`,
        `FILA DE ESTUDO - conteúdos concretos em andamento, já na ordem certa (siga esta ordem):\n${
          ctx.studying.map((item, index) => `${index + 1}. ${item}`).join('\n') || 'nada'
        }`,
        `REVISÕES - atrasadas e as que vencem nos dias do plano (${ctx.reviews.length}):\n${
          ctx.reviews.map((item) => `- ${item}`).join('\n') || 'nenhuma'
        }`,
        `Notas de quiz/prova abaixo de 70%: ${ctx.low.join('; ') || 'nenhuma'}`,
        `LIVROS DE DATA SCIENCE em andamento (só estes entram como leitura): ${
          reading.join('; ') || 'nenhum'
        }`,
        `PLANO DE CARREIRA - tempo EXTRA de ${careerBudget} min por dia, fora do limite acima; próximas ações por prioridade:\n${
          career.map((item, index) => `${index + 1}. ${item}`).join('\n') || 'nada'
        }`,
      ].join('\n');
      const budget = this.weekPlanMinutes();
      const plan = this.trimPlan(
        await this.academyAi.weekPlan(context, budget, careerBudget),
        budget,
        careerBudget,
        ctx.dates,
      );
      this.savePlan('week', plan);
      this.weekPlanMessage.set('');
    } catch (e) {
      this.weekPlanMessage.set((e as Error).message);
    } finally {
      this.weekPlanBusy.set(false);
    }
  }

  async generateOtherPlan(): Promise<void> {
    const selected = this.otherPlanAreas().filter((area) =>
      this.otherPlanSelected().has(area.id),
    );
    if (!selected.length) {
      this.otherPlanMessage.set('Escolha pelo menos uma área para o plano.');
      return;
    }
    this.otherPlanBusy.set(true);
    this.otherPlanMessage.set('Montando o plano das outras áreas com IA...');
    try {
      const ctx = this.planContext(new Set(selected.map((area) => area.id)));
      const context = [
        `DIAS DO PLANO (use estes rótulos, nesta ordem): ${ctx.weekDays.join(', ')}`,
        `TEMPO DISPONÍVEL: ${this.otherPlanMinutes()} min por dia (limite rígido - nenhum dia pode passar disso)`,
        `ÁREAS DO PLANO: ${selected.map((area) => area.title).join(', ')}`,
        `FILA DE ESTUDO - conteúdos concretos em andamento, já na ordem certa:\n${
          ctx.studying.map((item, index) => `${index + 1}. ${item}`).join('\n') || 'nada'
        }`,
        `ÁREAS SEM NADA EM ANDAMENTO (sugira o que estudar):\n${
          ctx.idleAreas
            .map(
              (area) =>
                `- ${area.title}${
                  area.backlog.length
                    ? ` (já cadastrado no backlog: ${area.backlog.join('; ')})`
                    : ''
                }`,
            )
            .join('\n') || 'nenhuma'
        }`,
        `REVISÕES - atrasadas e as que vencem nos dias do plano (${ctx.reviews.length}):\n${
          ctx.reviews.map((item) => `- ${item}`).join('\n') || 'nenhuma'
        }`,
        `Notas de quiz/prova abaixo de 70%: ${ctx.low.join('; ') || 'nenhuma'}`,
        `FOCO E PREFERÊNCIAS DO ALUNO: ${this.otherPlanFocus().trim() || 'nenhuma'}`,
      ].join('\n');
      const budget = this.otherPlanMinutes();
      const plan = this.trimPlan(
        await this.academyAi.otherAreasWeekPlan(context, budget),
        budget,
        0,
        ctx.dates,
      );
      this.savePlan('other', plan);
      this.otherPlanMessage.set('');
    } catch (e) {
      this.otherPlanMessage.set((e as Error).message);
    } finally {
      this.otherPlanBusy.set(false);
    }
  }

  readonly selectionFlashcard = signal<{ question: string; answer: string } | null>(null);
  readonly flashcardNotice = signal('');

  /**
   * Turns the selected part of the notes into a flashcard draft: a first line
   * or a "term: definition" becomes question/answer; otherwise the whole
   * excerpt is the answer. The draft stays editable before saving.
   */
  startFlashcardFromSelection(): void {
    const textarea = this.notesTextarea()?.nativeElement;
    const selected = textarea
      ? this.editorNotes.slice(textarea.selectionStart, textarea.selectionEnd)
      : '';
    const clean = selected
      .split('\n')
      .map((line) => line.replace(/^\s*(#{1,6}|[-*+]|>|\d+\.)\s+/, '').trim())
      .filter(Boolean);
    if (!clean.length) {
      this.flashcardNotice.set('Selecione um trecho das anotações primeiro.');
      return;
    }
    this.flashcardNotice.set('');
    const [first, ...rest] = clean;
    const colon = first.indexOf(':');
    let question: string;
    let answer: string;
    if (rest.length) {
      question = first;
      answer = rest.join('\n');
    } else if (colon > 0 && colon < 80) {
      question = `${first.slice(0, colon).trim()}?`;
      answer = first.slice(colon + 1).trim();
    } else {
      question = `Explique: ${first.split(/\s+/).slice(0, 8).join(' ')}…`;
      answer = first;
    }
    this.selectionFlashcard.set({ question, answer });
  }

  async saveSelectionFlashcard(draft: {
    question: string;
    answer: string;
  }): Promise<void> {
    const node = this.academy.nodes().find((item) => item.id === this.editingNodeId());
    if (!node) return;
    await this.academy.addFlashcard(node.areaId, node.id, draft.question, draft.answer);
    this.selectionFlashcard.set(null);
    this.flashcardNotice.set('Flashcard criado no grimório.');
  }

  async rotateEditorPhoto(id: string): Promise<void> {
    const photo = this.editorPhotos.find((item) => item.id === id);
    if (!photo) return;
    const dataUrl = await rotateImageDataUrl(photo.dataUrl);
    this.editorPhotos = this.editorPhotos.map((item) =>
      item.id === id ? { ...item, dataUrl } : item,
    );
    this.cdr.markForCheck();
  }

  removeEditorPhoto(id: string): void {
    this.editorPhotos = this.editorPhotos.filter((photo) => photo.id !== id);
  }

  addEditorNotebook(): void {
    const notebook = this.editorNotebookName.trim();
    if (!notebook) return;
    const from = this.editorNotebookFrom ? Math.round(this.editorNotebookFrom) : null;
    const to = this.editorNotebookTo ? Math.round(this.editorNotebookTo) : from;
    this.editorNotebooks = [
      ...this.editorNotebooks,
      {
        id: crypto.randomUUID(),
        notebook,
        fromPage: from && to ? Math.min(from, to) : from,
        toPage: from && to ? Math.max(from, to) : to,
      },
    ];
    this.editorNotebookFrom = null;
    this.editorNotebookTo = null;
  }

  /** null clears the grade (empty score field). */
  editorQuizScoreValue(): StudyNode['quizScore'] {
    const score = Number(this.editorQuizScore);
    if (
      this.editorQuizScore === null ||
      `${this.editorQuizScore}` === '' ||
      !Number.isFinite(score)
    ) {
      return null;
    }
    const max = Number(this.editorQuizMax);
    return { score, max: this.editorQuizMax && max > 0 ? max : null };
  }

  removeEditorNotebook(id: string): void {
    this.editorNotebooks = this.editorNotebooks.filter((ref) => ref.id !== id);
  }

  notebookPages(ref: StudyNodeNotebookRef): string {
    if (!ref.fromPage) return '';
    return ref.toPage && ref.toPage !== ref.fromPage
      ? `págs. ${ref.fromPage}–${ref.toPage}`
      : `pág. ${ref.fromPage}`;
  }

  async saveNodeEditor(): Promise<void> {
    const nodeId = this.editingNodeId();
    if (!nodeId) return;
    await this.academy.updateNodeDetails(nodeId, {
      title: this.editorTitle,
      description: this.editorDescription,
      notesMarkdown: this.editorNotes,
      links: this.editorLinks,
      drawing: this.editorDrawing,
      category: this.editorCategory,
      priority: this.editorPriority,
      photos: this.editorPhotos,
      notebooks: this.editorNotebooks,
      quizScore: this.editorQuizScoreValue(),
    });
    this.closeNodeEditor();
  }

  formatMarkdown(prefix: string, suffix = '', placeholder = 'texto'): void {
    const textarea = this.notesTextarea()?.nativeElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = this.editorNotes.slice(start, end) || placeholder;
    this.editorNotes =
      this.editorNotes.slice(0, start) +
      prefix +
      selected +
      suffix +
      this.editorNotes.slice(end);
    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length,
      );
    });
  }

  nodeKindLabel(kind: StudyNodeKind | null): string {
    return (
      {
        folder: 'pasta',
        course: 'curso',
        module: 'módulo',
        topic: 'assunto',
        subtopic: 'subassunto',
      }[kind ?? 'folder'] ?? 'item'
    );
  }

  /** Card label: the item's category when set, else its tree level. */
  nodeTypeLabel(node: StudyNode): string {
    return studyNodeCategoryInfo(node.category)?.label ?? this.nodeKindLabel(node.kind);
  }

  nodeTypeIcon(node: StudyNode): string {
    return studyNodeCategoryInfo(node.category)?.icon ?? node.icon;
  }

  private nextKindAfter(kind: StudyNodeKind | null): StudyNodeKind | null {
    return kind
      ? ({
          folder: 'course',
          course: 'module',
          module: 'topic',
          topic: 'subtopic',
          subtopic: null,
        }[kind] as StudyNodeKind | null)
      : 'folder';
  }

  async startSession(): Promise<void> {
    const areaId = this.selectedAreaId();
    if (!areaId) return;
    const selectedNodeId =
      this.selectedSubtopicId() ||
      this.selectedTopicId() ||
      this.selectedModuleId() ||
      null;
    const selectedNode = this.academy.nodes().find((node) => node.id === selectedNodeId);
    await this.academy.startSession(
      areaId,
      selectedNodeId,
      this.sessionTitle ||
        selectedNode?.title ||
        this.selectedArea()?.title ||
        'Sessão de estudos',
      this.sessionMinutes,
      this.selectedCharacterId(),
    );
    this.focusMode.startCountdown(this.sessionMinutes * 60_000);
    this.sessionTitle = '';
  }

  async logStudySession(): Promise<void> {
    const areaId = this.selectedAreaId();
    if (!areaId) return;
    const selectedNodeId =
      this.selectedSubtopicId() ||
      this.selectedTopicId() ||
      this.selectedModuleId() ||
      null;
    const selectedNode = this.academy.nodes().find((node) => node.id === selectedNodeId);
    const session = await this.academy.logSession(
      areaId,
      selectedNodeId,
      this.sessionTitle ||
        selectedNode?.title ||
        this.selectedArea()?.title ||
        'Sessão de estudos',
      this.sessionMinutes,
      this.selectedCharacterId(),
      '',
      this.sessionLogDateTimestamp(),
      this.draftDistractions(),
    );
    if (session && !this.draftDistractions().length) {
      this.distractionPrompt.set({ sessionId: session.id, title: session.title });
    }
    if (session) {
      this.profile.grantExternalReward(
        session.id,
        session.xpEarned,
        session.goldEarned,
        'academy-arcana',
        session.characterId ?? this.selectedCharacterId(),
      );
      this.maybePromptReviewFor(session.nodeId, session.areaId);
    }
    this.sessionLogDate = this.localDateKey(new Date());
    this.sessionTitle = '';
    this.draftDistractions.set([]);
  }

  addDraftDistraction(category: string): void {
    this.draftDistractions.update((list) => [
      ...list,
      { id: crypto.randomUUID(), category, note: this.draftDistractionNote.trim() },
    ]);
    this.draftDistractionNote = '';
  }

  openDistractionsFor(sessionId: string): void {
    this.distractionPrompt.set(null);
    const session = this.academy.recentSessions().find((item) => item.id === sessionId);
    if (session) this.openSessionEditor(session);
  }

  removeDraftDistraction(id: string): void {
    this.draftDistractions.update((list) => list.filter((item) => item.id !== id));
  }

  selectSessionArea(areaId: string): void {
    this.selectedAreaId.set(areaId);
    this.selectedModuleId.set('');
    this.selectedTopicId.set('');
    this.selectedSubtopicId.set('');
  }

  selectSessionModule(moduleId: string): void {
    this.selectedModuleId.set(moduleId);
    this.selectedTopicId.set('');
    this.selectedSubtopicId.set('');
  }

  selectSessionTopic(topicId: string): void {
    this.selectedTopicId.set(topicId);
    this.selectedSubtopicId.set('');
  }

  toggleQuickCreate(level: 'area' | 'module' | 'topic' | 'subtopic'): void {
    this.quickCreateOpen.set(this.quickCreateOpen() === level ? null : level);
    this.quickCreateTitle = '';
  }

  cancelQuickCreate(): void {
    this.quickCreateOpen.set(null);
    this.quickCreateTitle = '';
  }

  async confirmQuickCreate(): Promise<void> {
    const level = this.quickCreateOpen();
    const title = this.quickCreateTitle.trim();
    if (!level || !title) return;

    if (level === 'area') {
      await this.academy.addArea(title, this.quickCreateColor);
      this.selectSessionArea(this.academy.areas().at(-1)?.id ?? '');
    } else {
      const areaId = this.selectedAreaId();
      if (!areaId) return;
      if (level === 'module') {
        await this.academy.addNode(areaId, null, 'folder', title);
        const created = this.sessionModules().at(-1);
        if (created) this.selectSessionModule(created.id);
      } else if (level === 'topic') {
        const parent = this.sessionModules().find(
          (item) => item.id === this.selectedModuleId(),
        );
        if (!parent) return;
        await this.academy.addNode(
          areaId,
          parent.id,
          this.nextKindAfter(parent.kind) ?? 'topic',
          title,
        );
        const created = this.areaNodes()
          .filter((node) => node.parentId === parent.id)
          .at(-1);
        if (created) this.selectSessionTopic(created.id);
      } else {
        const parent = this.sessionTopics().find(
          (item) => item.id === this.selectedTopicId(),
        );
        if (!parent) return;
        await this.academy.addNode(
          areaId,
          parent.id,
          this.nextKindAfter(parent.kind) ?? 'subtopic',
          title,
        );
        const created = this.areaNodes()
          .filter((node) => node.parentId === parent.id)
          .at(-1);
        if (created) this.selectedSubtopicId.set(created.id);
      }
    }
    this.quickCreateOpen.set(null);
    this.quickCreateTitle = '';
  }

  async finishSession(): Promise<void> {
    const session = await this.academy.finishActiveSession();
    if (session) {
      this.distractionPrompt.set({ sessionId: session.id, title: session.title });
      this.profile.grantExternalReward(
        session.id,
        session.xpEarned,
        session.goldEarned,
        'academy-arcana',
        session.characterId ?? this.selectedCharacterId(),
      );
      this.maybePromptReviewFor(session.nodeId, session.areaId);
    }
  }

  // Ties spaced repetition to the moment you actually logged studying
  // something (spec §3: "estudei X hoje" → the system offers to schedule its
  // first review) instead of only being reachable as a separate action buried
  // in the Biblioteca tab.
  private maybePromptReviewFor(nodeId: string | null, areaId: string): void {
    if (!nodeId || this.academy.isNodeInReview(nodeId)) return;
    const node = this.academy.nodes().find((item) => item.id === nodeId);
    if (!node) return;
    this.postSessionReviewPrompt.set({ nodeId, areaId, title: node.title });
  }

  async confirmPostSessionReview(): Promise<void> {
    const prompt = this.postSessionReviewPrompt();
    if (!prompt) return;
    await this.academy.addNodeToReview(prompt.nodeId, prompt.areaId);
    this.postSessionReviewPrompt.set(null);
  }

  dismissPostSessionReview(): void {
    this.postSessionReviewPrompt.set(null);
  }

  async createFlashcard(): Promise<void> {
    const areaId = this.selectedAreaId();
    if (!areaId) return;
    // Links to whatever level the Biblioteca is currently browsing (area,
    // módulo, tópico or subassunto) - academy-arcana spec §7 wants flashcards
    // linkable to any level; the level you were browsing when you created it
    // is the natural, zero-extra-UI default.
    await this.academy.addFlashcard(
      areaId,
      this.libraryParentId(),
      this.flashcardQuestion,
      this.flashcardAnswer,
    );
    this.flashcardQuestion = '';
    this.flashcardAnswer = '';
  }

  // ---- Topic spaced-repetition review ----

  isNodeInReview(nodeId: string): boolean {
    return this.academy.isNodeInReview(nodeId);
  }

  async addNodeToReview(node: StudyNode, event?: Event): Promise<void> {
    event?.stopPropagation();
    await this.academy.addNodeToReview(node.id, node.areaId);
  }

  reviewBadgeStatus(state: TopicReviewState): 'overdue' | 'soon' | 'stable' {
    const daysUntilDue = (state.dueAt - Date.now()) / 86_400_000;
    if (daysUntilDue < 0) return 'overdue';
    if (daysUntilDue <= 1) return 'soon';
    return 'stable';
  }

  reviewBadgeIcon(state: TopicReviewState): string {
    return { overdue: 'error', soon: 'schedule', stable: 'check_circle' }[
      this.reviewBadgeStatus(state)
    ];
  }

  reviewBadgeLabel(state: TopicReviewState): string {
    const status = this.reviewBadgeStatus(state);
    const daysUntilDue = Math.ceil((state.dueAt - Date.now()) / 86_400_000);
    if (status === 'overdue') {
      const overdueDays = Math.abs(daysUntilDue);
      return `${overdueDays} dia${overdueDays === 1 ? '' : 's'} atrasado`;
    }
    if (daysUntilDue <= 0) return 'Revisar hoje';
    return `Próxima revisão: ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}`;
  }

  async skipTopicReview(nodeId: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    await this.academy.skipTopicReview(nodeId);
    if (this.reviewingNodeId() === nodeId) this.closeTopicReview();
  }

  openTopicReview(nodeId: string): void {
    this.activeReview.set(null);
    this.reviewingNodeId.set(nodeId);
    this.reviewAnswerVisible.set(false);
    this.reviewResult.set(null);
  }

  closeTopicReview(): void {
    this.reviewingNodeId.set(null);
    this.reviewAnswerVisible.set(false);
    this.reviewResult.set(null);
  }

  async submitTopicReview(rating: 1 | 2 | 3 | 4): Promise<void> {
    const nodeId = this.reviewingNodeId();
    if (!nodeId) return;
    const result = await this.academy.reviewTopic(nodeId, rating);
    this.reviewResult.set(result);
    this.reviewAnswerVisible.set(false);
  }

  nodeTitleForLog(nodeId: string): string {
    return (
      this.academy.nodes().find((node) => node.id === nodeId)?.title ?? 'Tópico removido'
    );
  }

  ratingLabel(rating: 1 | 2 | 3 | 4): string {
    return { 1: 'Esqueci', 2: 'Difícil', 3: 'Bom', 4: 'Fácil' }[rating];
  }

  openReviewingNodeMaterial(): void {
    const node = this.reviewingNode();
    if (!node) return;
    // Both modals share the same full-screen backdrop pattern - close this one
    // first so opening the node editor doesn't stack an invisible layer
    // underneath it.
    this.closeTopicReview();
    this.openNodeEditor(node);
  }

  private nodePath(node: StudyNode): string {
    const chain: string[] = [node.title];
    const all = this.academy.nodes();
    const visited = new Set([node.id]);
    let current = node;
    while (current.parentId) {
      const parent = all.find((item) => item.id === current.parentId);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      chain.unshift(parent.title);
      current = parent;
    }
    return chain.join(' → ');
  }

  async rateCard(rating: 1 | 2 | 3 | 4): Promise<void> {
    const card = this.currentCard();
    if (!card) return;
    await this.academy.reviewCard(card, rating);
    this.cardAnswerVisible.set(false);
  }

  async exportData(domains: string[] = []): Promise<void> {
    await this.backup.download(this.profile.state().id, domains);
  }

  async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.backup.restore(file);
    await this.academy.load(this.profile.state().id);
    input.value = '';
  }

  minutes(value: number): string {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  dayTooltip(day: StudyChartDay): string {
    const header = `${day.date} · ${this.minutes(day.minutes)}`;
    const aggregate = day.aggregate;
    if (!aggregate) return header;
    // areaMinutes[areaId] is every session's minutes for that area, whether or
    // not the session picked a specific topic; nodeMinutes only covers the
    // ones that did. Showing nodeMinutes OR areaMinutes (not both) silently
    // dropped any area-only session logged the same day as a topic-specific
    // one. areaOnlyMinutes (written at log/delete time - see academy-idb.
    // repository.ts) is the robust source for that; older aggregates written
    // before that field existed fall back to inferring "area total minus its
    // still-resolvable nodes' total" - imperfect once a topic is deleted (its
    // node lookup fails, so its minutes are no longer subtracted and would
    // double-count into the area line), but only for pre-existing data.
    const lines: Array<{ title: string; mins: number }> = Object.entries(
      aggregate.nodeMinutes ?? {},
    ).map(([nodeId, mins]) => ({ title: this.nodeTitleForLog(nodeId), mins }));
    const areaOnlyMinutes =
      aggregate.areaOnlyMinutes ?? this._inferAreaOnlyMinutes(aggregate);
    for (const [areaId, mins] of Object.entries(areaOnlyMinutes)) {
      if (mins > 0) {
        const area = this.academy.areas().find((item) => item.id === areaId);
        lines.push({ title: area?.title ?? 'Área removida', mins });
      }
    }
    if (!lines.length) return header;
    const text = lines
      .sort((a, b) => b.mins - a.mins)
      .map(({ title, mins }) => `${title}: ${this.minutes(mins)}`)
      .join('\n');
    return `${header}\n${text}`;
  }

  // Best-effort fallback for aggregates written before areaOnlyMinutes
  // existed: infers area-only time as "area total minus its nodes' total".
  // Requires EVERY node that day to still resolve to an area - if even one
  // topic was since deleted, its minutes can't be attributed back to an area
  // to subtract, so the inference would double-count it (once as its own
  // "Tópico removido" line, again folded into the area's total). Returning
  // nothing in that case is preferred over a wrong-but-plausible number.
  private _inferAreaOnlyMinutes(aggregate: DailyStudyAggregate): Record<string, number> {
    const nodeMinutesByArea = new Map<string, number>();
    for (const [nodeId, mins] of Object.entries(aggregate.nodeMinutes ?? {})) {
      const areaId = this.academy.nodes().find((node) => node.id === nodeId)?.areaId;
      if (!areaId) return {};
      nodeMinutesByArea.set(areaId, (nodeMinutesByArea.get(areaId) ?? 0) + mins);
    }
    const result: Record<string, number> = {};
    for (const [areaId, areaTotal] of Object.entries(aggregate.areaMinutes ?? {})) {
      result[areaId] = areaTotal - (nodeMinutesByArea.get(areaId) ?? 0);
    }
    return result;
  }

  heatLevel(minutes: number): number {
    if (!minutes) return 0;
    if (minutes < 30) return 1;
    if (minutes < 60) return 2;
    if (minutes < 120) return 3;
    return 4;
  }

  areaNodeCount(areaId: string): number {
    return this.academy.nodes().filter((node) => node.areaId === areaId).length;
  }

  async deleteArea(areaId: string, title: string): Promise<void> {
    if (
      !confirmDialog(
        `Excluir a área "${title}" e todo o conteúdo dela (módulos, tópicos e subassuntos)? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    await this.academy.deleteArea(areaId);
    if (this.selectedAreaId() === areaId) {
      this.selectedModuleId.set('');
      this.selectedTopicId.set('');
      this.selectedSubtopicId.set('');
      this.libraryParentId.set(null);
      this.selectedAreaId.set(this.academy.areas()[0]?.id ?? '');
    }
  }

  async deleteLibraryNode(node: StudyNode): Promise<void> {
    if (
      !confirmDialog(
        `Excluir "${node.title}" e todo o conteúdo abaixo dele? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    await this.academy.deleteNode(node.id);
    if (this.libraryParentId() === node.id) {
      this.libraryParentId.set(node.parentId ?? null);
    }
    if (this.editingNodeId() === node.id) {
      this.closeNodeEditor();
    }
    const remainingIds = new Set(this.academy.nodes().map((item) => item.id));
    if (!remainingIds.has(this.selectedModuleId())) this.selectedModuleId.set('');
    if (!remainingIds.has(this.selectedTopicId())) this.selectedTopicId.set('');
    if (!remainingIds.has(this.selectedSubtopicId())) this.selectedSubtopicId.set('');
  }

  private continuousDays(count: number): StudyChartDay[] {
    const aggregates = new Map(
      this.academy.dashboard().recentDays.map((day) => [day.date, day]),
    );
    const result: StudyChartDay[] = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    cursor.setDate(cursor.getDate() - count + 1);
    for (let index = 0; index < count; index++) {
      const date = this.localDateKey(cursor);
      const aggregate = aggregates.get(date) ?? null;
      result.push({
        date,
        label: `${String(cursor.getDate()).padStart(2, '0')}/${String(
          cursor.getMonth() + 1,
        ).padStart(2, '0')}`,
        minutes: aggregate?.totalMinutes ?? 0,
        aggregate,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  private calendarYearDays(year: number): StudyChartDay[] {
    const aggregates = new Map(
      this.academy.dashboard().recentDays.map((day) => [day.date, day]),
    );
    const result: StudyChartDay[] = [];
    const firstDay = new Date(year, 0, 1, 12);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    for (let index = 0; index < mondayOffset; index++) {
      result.push({
        date: `padding-start-${index}`,
        label: '',
        minutes: 0,
        aggregate: null,
        padding: true,
      });
    }
    const cursor = new Date(firstDay);
    while (cursor.getFullYear() === year) {
      const date = this.localDateKey(cursor);
      const aggregate = aggregates.get(date) ?? null;
      result.push({
        date,
        label: `${String(cursor.getDate()).padStart(2, '0')}/${String(
          cursor.getMonth() + 1,
        ).padStart(2, '0')}`,
        minutes: aggregate?.totalMinutes ?? 0,
        aggregate,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    while (result.length % 7) {
      result.push({
        date: `padding-end-${result.length}`,
        label: '',
        minutes: 0,
        aggregate: null,
        padding: true,
      });
    }
    return result;
  }

  private localDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // Combines a picked "Data" (Y-M-D only) with a reference Date's wall-clock
  // time, so backdating a log (or just fixing its date) doesn't collapse the
  // time-of-day to midnight.
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

  private sessionLogDateTimestamp(): number {
    return this.combineDateWithTimeOf(this.sessionLogDate, new Date());
  }

  // ---- Session history: edit / delete ----

  async logDistraction(category: string): Promise<void> {
    const session = this.academy.activeSession();
    if (!session) return;
    await this.academy.addDistraction(session.id, category, this.distractionNote);
    this.distractionNote = '';
  }

  async addDistractionToEditingSession(): Promise<void> {
    const session = this.editingSession();
    if (!session || !this.editDistractionCategory) return;
    // Past blocks: the exact moment isn't known, so it's stamped at the block start.
    await this.academy.addDistraction(
      session.id,
      this.editDistractionCategory,
      this.editDistractionNote,
      session.startedAt,
    );
    this.editDistractionNote = '';
  }

  async addDistractionCategory(): Promise<void> {
    const name = this.newDistractionCategory.trim();
    if (!name) return;
    await this.academy.setDistractionCategories([
      ...this.academy.distractionCategories(),
      name,
    ]);
    this.newDistractionCategory = '';
  }

  async removeDistractionCategory(category: string): Promise<void> {
    if (
      !confirmDialog(
        `Remover a categoria "${category}"? Distrações já registradas nela continuam no histórico.`,
      )
    ) {
      return;
    }
    await this.academy.setDistractionCategories(
      this.academy.distractionCategories().filter((item) => item !== category),
    );
  }

  distractionBarWidth(count: number): number {
    const top = this.distractionStats().categories[0]?.count ?? 0;
    return top ? Math.max(3, (count / top) * 100) : 0;
  }

  openSessionEditor(session: StudySession): void {
    this.editDistractionCategory = this.academy.distractionCategories()[0] ?? '';
    this.editDistractionNote = '';
    this.editingSessionId.set(session.id);
    this.editSessionTitle = session.title;
    this.editSessionDate = this.localDateKey(new Date(session.startedAt));
    this.editSessionMinutes = session.actualMinutes || session.plannedMinutes;
  }

  closeSessionEditor(): void {
    this.editingSessionId.set(null);
  }

  async saveSessionEdit(): Promise<void> {
    const id = this.editingSessionId();
    if (!id) return;
    const original = this.academy.recentSessions().find((item) => item.id === id);
    if (!original) return;
    const startedAt = this.combineDateWithTimeOf(
      this.editSessionDate,
      new Date(original.startedAt),
    );
    const result = await this.academy.updateSessionDetails(id, {
      title: this.editSessionTitle,
      startedAt,
      actualMinutes: this.editSessionMinutes,
    });
    if (result) {
      const { previous, updated } = result;
      const characterId = updated.characterId ?? this.selectedCharacterId();
      if (previous.xpEarned > 0 || previous.goldEarned > 0) {
        this.profile.revokeExternalReward(
          previous.id,
          previous.xpEarned,
          previous.goldEarned,
          characterId,
        );
      }
      if (updated.xpEarned > 0 || updated.goldEarned > 0) {
        this.profile.grantExternalReward(
          updated.id,
          updated.xpEarned,
          updated.goldEarned,
          'academy-arcana',
          characterId,
        );
      }
    }
    this.closeSessionEditor();
  }

  async deleteSessionEntry(session: StudySession, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (
      !confirmDialog(
        `Excluir o registro "${session.title}"? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    const deleted = await this.academy.deleteSession(session.id);
    if (deleted && (deleted.xpEarned > 0 || deleted.goldEarned > 0)) {
      this.profile.revokeExternalReward(
        deleted.id,
        deleted.xpEarned,
        deleted.goldEarned,
        deleted.characterId ?? this.selectedCharacterId(),
      );
    }
    if (this.editingSessionId() === session.id) this.closeSessionEditor();
  }
}
