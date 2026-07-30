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
import { AcademyStudyService } from '../application/academy-study.service';
import { AcademyRepository } from '../domain/academy.repository';
import {
  DailyStudyAggregate,
  ExcalidrawDrawing,
  StudyNode,
  StudyNodeKind,
} from '../domain/academy.models';
import { AcademyIdbRepository } from '../persistence/academy-idb.repository';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { FocusModeService } from '../../focus-mode/focus-mode.service';
import { MarkdownComponent } from 'ngx-markdown';
import { AcademyExcalidrawComponent } from './academy-excalidraw.component';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';

interface StudyChartDay {
  date: string;
  label: string;
  minutes: number;
  aggregate: DailyStudyAggregate | null;
  padding?: boolean;
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
  readonly notesTextarea =
    viewChild<ElementRef<HTMLTextAreaElement>>('notesTextarea');
  readonly excalidrawEditor = viewChild(AcademyExcalidrawComponent);
  readonly cardAnswerVisible = signal(false);
  readonly selectedArea = computed(
    () =>
      this.academy.areas().find((area) => area.id === this.selectedAreaId()) ?? null,
  );
  readonly areaNodes = computed(() =>
    this.academy
      .nodes()
      .filter((node) => node.areaId === this.selectedAreaId())
      .sort((a, b) => a.position - b.position),
  );
  readonly libraryParent = computed(
    () =>
      this.areaNodes().find((node) => node.id === this.libraryParentId()) ?? null,
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
      current =
        this.areaNodes().find((node) => node.id === current?.parentId) ?? null;
    }
    return result;
  });
  readonly nextLibraryKind = computed<StudyNodeKind | null>(() => {
    const parentKind = this.libraryParent()?.kind ?? null;
    return parentKind
      ? ({
          folder: 'course',
          course: 'module',
          module: 'topic',
          topic: 'subtopic',
          subtopic: null,
        }[parentKind] as StudyNodeKind | null)
      : 'folder';
  });
  readonly sessionModules = computed(() =>
    this.areaNodes().filter((node) => ['course', 'module'].includes(node.kind)),
  );
  readonly sessionTopics = computed(() =>
    this.childrenFor('topic', this.selectedModuleId()),
  );
  readonly sessionSubtopics = computed(() =>
    this.childrenFor('subtopic', this.selectedTopicId()),
  );
  readonly chartFolders = computed(() =>
    this.academy
      .nodes()
      .filter((node) => node.kind === 'folder')
      .sort((a, b) => a.title.localeCompare(b.title)),
  );
  readonly heatmapDays = computed(() => this.calendarYearDays(this.heatmapYear()));
  readonly heatmapYears = computed(() => {
    const years = new Set(
      this.academy
        .dashboard()
        .recentDays.map((day) => Number(day.date.slice(0, 4))),
    );
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  });
  readonly heatmapYearMinutes = computed(() =>
    this.heatmapDays().reduce((total, day) => total + day.minutes, 0),
  );
  readonly chartDays = computed(() =>
    this.continuousDays(30).map((day) => ({
      ...day,
      minutes: this.filteredMinutes(day.aggregate),
    })),
  );
  readonly chartMax = computed(() =>
    Math.max(30, ...this.chartDays().map((day) => day.minutes)),
  );
  readonly chartPoints = computed(() => {
    const days = this.chartDays();
    const max = this.chartMax();
    return days
      .map((day, index) => {
        const x = days.length === 1 ? 0 : (index / (days.length - 1)) * 700;
        const y = 170 - (day.minutes / max) * 150;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
  readonly currentCard = computed(() => this.academy.dueCards()[0] ?? null);

  areaTitle = '';
  areaColor = '#7357c8';
  nodeTitle = '';
  nodeKind: StudyNodeKind = 'course';
  sessionTitle = '';
  sessionMinutes = 50;
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
    await this.academy.addNode(
      areaId,
      this.libraryParentId(),
      kind,
      this.nodeTitle,
    );
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

  formatMarkdown(
    prefix: string,
    suffix = '',
    placeholder = 'texto',
  ): void {
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

  async startSession(): Promise<void> {
    const areaId = this.selectedAreaId();
    if (!areaId) return;
    const selectedNodeId =
      this.selectedSubtopicId() ||
      this.selectedTopicId() ||
      this.selectedModuleId() ||
      null;
    const selectedNode = this.academy
      .nodes()
      .find((node) => node.id === selectedNodeId);
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

  async finishSession(): Promise<void> {
    const session = await this.academy.finishActiveSession();
    if (session) {
      this.profile.grantExternalReward(
        session.id,
        session.xpEarned,
        session.goldEarned,
        'academy-arcana',
        session.characterId ?? this.selectedCharacterId(),
      );
    }
  }

  async createFlashcard(): Promise<void> {
    const areaId = this.selectedAreaId();
    if (!areaId) return;
    await this.academy.addFlashcard(
      areaId,
      null,
      this.flashcardQuestion,
      this.flashcardAnswer,
    );
    this.flashcardQuestion = '';
    this.flashcardAnswer = '';
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

  heatLevel(minutes: number): number {
    if (!minutes) return 0;
    if (minutes < 30) return 1;
    if (minutes < 60) return 2;
    if (minutes < 120) return 3;
    return 4;
  }

  chartY(minutes: number): number {
    return 170 - (minutes / this.chartMax()) * 150;
  }

  areaNodeCount(areaId: string): number {
    return this.academy.nodes().filter((node) => node.areaId === areaId).length;
  }

  private childrenFor(kind: StudyNodeKind, parentId: string): StudyNode[] {
    const candidates = this.areaNodes().filter((node) => node.kind === kind);
    if (!parentId) return candidates;
    const linked = candidates.filter((node) => node.parentId === parentId);
    return linked.length ? linked : candidates.filter((node) => !node.parentId);
  }

  private filteredMinutes(aggregate: DailyStudyAggregate | null): number {
    if (!aggregate) return 0;
    const filter = this.chartFilter();
    if (filter === 'all') return aggregate.totalMinutes;
    const [kind, id] = filter.split(':');
    if (kind === 'area') return aggregate.areaMinutes[id] ?? 0;
    if (kind === 'folder') {
      const descendantIds = this.descendantNodeIds(id);
      return descendantIds.reduce(
        (total, nodeId) => total + (aggregate.nodeMinutes?.[nodeId] ?? 0),
        0,
      );
    }
    return aggregate.nodeMinutes?.[id] ?? 0;
  }

  private descendantNodeIds(parentId: string): string[] {
    const result = [parentId];
    const queue = [parentId];
    while (queue.length) {
      const current = queue.shift() as string;
      const children = this.academy
        .nodes()
        .filter((node) => node.parentId === current)
        .map((node) => node.id);
      result.push(...children);
      queue.push(...children);
    }
    return result;
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
}
