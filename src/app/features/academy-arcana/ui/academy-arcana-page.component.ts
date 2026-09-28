import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AcademyBackupService } from '../application/academy-backup.service';
import {
  buildDailyDistractionStats,
  buildDistractionStats,
} from '../application/distraction-stats';
import { AcademyStudyService } from '../application/academy-study.service';
import { AcademyRepository } from '../domain/academy.repository';
import {
  DailyStudyAggregate,
  ExcalidrawDrawing,
  StudyNode,
  StudyNodeKind,
  StudySession,
  TopicReviewState,
} from '../domain/academy.models';
import { AcademyIdbRepository } from '../persistence/academy-idb.repository';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { FocusModeService } from '../../focus-mode/focus-mode.service';
import { MarkdownComponent } from 'ngx-markdown';
import { AcademyExcalidrawComponent } from './academy-excalidraw.component';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';
import { confirmDialog } from '../../../util/native-dialogs';

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

@Component({
  selector: 'academy-arcana-page',
  standalone: true,
  imports: [
    FormsModule,
    MatIcon,
    DatePipe,
    DecimalPipe,
    MarkdownComponent,
    AcademyExcalidrawComponent,
    CharacterRendererComponent,
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
  readonly backup = inject(AcademyBackupService);
  readonly profile = inject(RpgProfileService);
  readonly selectedCharacterId = signal(this.profile.activeCharacterId());
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
  // Bar chart geometry: one bar per block, dashed line at the average.
  readonly distractionChart = computed(() => {
    const stats = this.distractionStats();
    const count = stats.blocks.length;
    const max = Math.max(1, stats.average, ...stats.blocks.map((block) => block.count));
    const slot = count ? 700 / count : 700;
    const barWidth = Math.min(46, slot * 0.7);
    const heightFor = (value: number): number => (value / max) * 150;
    const labelEvery = Math.max(1, Math.ceil(count / 10));
    const halfBar = barWidth / 2;
    return {
      max,
      averageY: 170 - heightFor(stats.average),
      bars: stats.blocks.map((block, index) => {
        const height = heightFor(block.count);
        const slotStart = slot * index;
        const halfSlot = slot / 2;
        const center = slotStart + halfSlot;
        const date = new Date(block.startedAt);
        const day = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        return {
          id: block.id,
          x: center - halfBar,
          y: 170 - height,
          width: barWidth,
          height,
          center,
          isAbove: block.count > stats.average,
          showLabel: index % labelEvery === 0,
          label: day,
          tooltip: `${block.title} · ${day} ${time} · ${block.count} distrações · ${block.perHour.toLocaleString('pt-BR')}/h`,
        };
      }),
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
    this.areaNodes().filter((node) => node.parentId === this.libraryParentId()),
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
  editorLinkLabel = '';
  editorLinkUrl = '';

  async ngOnInit(): Promise<void> {
    await this.academy.load(this.selectedCharacterId());
    this.selectedAreaId.set(this.academy.areas()[0]?.id ?? '');
  }

  async selectCharacter(characterId: string): Promise<void> {
    if (!characterId || characterId === this.selectedCharacterId()) return;
    this.selectedCharacterId.set(characterId);
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

  openLibraryLevel(nodeId: string | null): void {
    this.libraryParentId.set(nodeId);
  }

  openNodeEditor(node: StudyNode): void {
    this.editingNodeId.set(node.id);
    this.editorTitle = node.title;
    this.editorDescription = node.description ?? '';
    this.editorNotes = node.notesMarkdown ?? '';
    this.editorLinks = [...(node.links ?? [])];
    this.editorDrawing =
      node.drawing && (!node.drawing.ownerNodeId || node.drawing.ownerNodeId === node.id)
        ? { ...node.drawing, ownerNodeId: node.id }
        : null;
    this.editorLinkLabel = '';
    this.editorLinkUrl = '';
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

  async saveNodeEditor(): Promise<void> {
    const nodeId = this.editingNodeId();
    if (!nodeId) return;
    await this.academy.updateNodeDetails(nodeId, {
      title: this.editorTitle,
      description: this.editorDescription,
      notesMarkdown: this.editorNotes,
      links: this.editorLinks,
      drawing: this.editorDrawing,
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
