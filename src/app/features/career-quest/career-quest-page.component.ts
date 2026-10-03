import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { CharacterRendererComponent } from '../rpg-profile/character-renderer.component';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { RpgProfileService } from '../rpg-profile/rpg-profile.service';
import { AcademyRepository } from '../academy-arcana/domain/academy.repository';
import { AcademyIdbRepository } from '../academy-arcana/persistence/academy-idb.repository';
import {
  StudyArea,
  StudyNode,
  StudySession,
} from '../academy-arcana/domain/academy.models';
import { confirmDialog } from '../../util/native-dialogs';
import { readFileAsShrunkDataUrl } from '../../util/shrink-image-data-url';
import { GeminiService } from '../../core/ai/gemini.service';
import { CareerInterviewResult, CareerQuestAiService } from './career-quest-ai.service';
import {
  CAREER_ATTRIBUTES,
  CAREER_CLASS_LABELS,
  CAREER_GENERIC_CRITERIA,
  CAREER_HORIZON_LABELS,
  CAREER_LEVEL_NAMES,
  CAREER_SKILLS,
} from './career-quest.catalog';
import { CAREER_SEED_QUESTS } from './career-quest.quests';
import { CAREER_QUEST_CONTENT } from './career-quest.content';
import { buildTodayPlan } from './career-quest-today.util';
import { CAREER_CAPSTONES } from './career-quest.capstones';
import { CareerContentComponent } from './content/career-content.component';
import { parseCareerMarkup } from './content/career-content-markup';
import {
  buildCareerPace,
  DEFAULT_PACE_TARGETS,
  studyMinutesByDay,
} from './career-quest-pace.util';
import { startOfWeekMs } from '../rpg-profile/rpg-contracts.util';
import { TaskService } from '../tasks/task.service';
import { Task } from '../tasks/task.model';
import { Store } from '@ngrx/store';
import { selectAllProjects } from '../project/store/project.selectors';
import { CAREER_BASELINE_LEVELS } from './career-quest-baseline.data';
import {
  CareerAiPolicy,
  CareerAttribute,
  CareerCapstoneDef,
  CareerCapstoneState,
  CareerContent,
  CareerEvidence,
  CareerGradingGroup,
  CareerHorizon,
  CareerQuest,
  CareerQuestContent,
  CareerQuestState,
  CareerQuestStatus,
  CareerQuestType,
  CareerSelfGrade,
  CareerSkillClass,
  CareerSkillDef,
} from './career-quest.model';
import {
  applyTestResult,
  gradeGroup,
  canAddFocus,
  careerPriorityScore,
  FOCUS_LIMITS,
  horizonOf,
  progressTowardTargets,
  promotionChecklist,
  promotionReward,
  QUEST_REWARD,
  skillGaps,
  skillLevel,
  unmetPrerequisites,
} from './career-quest.util';

type Tab = 'today' | 'overview' | 'tree' | 'quests' | 'done' | 'capstones' | 'gap';

const CAREER_AREA_TITLE = 'Career Quest';
/** Starting Active Focus (3 technical NOW skills + 1 English + 1 evidence; interview later). */
const INITIAL_FOCUS = ['PY-02', 'SE-01', 'LX-01', 'EN-02', 'EV-01'];

@Component({
  selector: 'career-quest-page',
  templateUrl: './career-quest-page.component.html',
  styleUrl: './career-quest-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    MatIcon,
    MatIconButton,
    CharacterRendererComponent,
    CareerContentComponent,
  ],
  // Lets each skill link to an Academia Arcana node used as its study playlist.
  providers: [{ provide: AcademyRepository, useClass: AcademyIdbRepository }],
})
export class CareerQuestPageComponent implements OnInit {
  readonly profile = inject(RpgProfileService);
  private readonly _academy = inject(AcademyRepository);
  private readonly _taskService = inject(TaskService);
  private readonly _store = inject(Store);
  readonly projects = this._store.selectSignal(selectAllProjects);
  private readonly _tasks = signal<Task[]>([]);

  // ---- pace (concrete rhythm goals) ----
  readonly paceTargets = computed(
    () => this.state()?.paceTargets ?? DEFAULT_PACE_TARGETS,
  );
  readonly pace = computed(() => {
    const state = this.state();
    if (!state) return null;
    const targets = this.paceTargets();
    const now = Date.now();
    return buildCareerPace({
      minutesByDay: studyMinutesByDay({
        sessions: this._sessions(),
        tasks: this._tasks(),
        targets,
        characterId: this.profile.activeCharacterId(),
        taskOwnerIds: this.profile.taskOwnerIds(),
      }),
      state,
      targets,
      now,
      weekStartMs: startOfWeekMs(now),
    });
  });
  readonly paceDayMax = computed(() =>
    Math.max(
      this.paceTargets().dailyStudyMinutes,
      ...(this.pace()?.lastDays ?? []).map((day) => day.minutes),
      1,
    ),
  );
  showPaceSettings = false;
  paceDailyHours = 1.5;
  paceWeeklyHours = 10;
  paceWeeklyQuests = 4;
  paceWeeklyEvidence = 3;
  paceCountAcademy = true;
  paceProjectIds = new Set<string>();

  readonly LEVEL_NAMES = CAREER_LEVEL_NAMES;
  readonly CLASS_LABELS = CAREER_CLASS_LABELS;
  readonly LEVELS = [0, 1, 2, 3, 4, 5];
  readonly AI_LABEL = Object.fromEntries([
    ['no-ai', 'NO AI'],
    ['ai-limited', 'AI LIMITED'],
    ['ai-allowed', 'AI ALLOWED'],
  ]) as Record<CareerAiPolicy, string>;
  readonly TYPE_LABEL: Record<CareerQuestType, string> = {
    micro: 'Micro Quest',
    quest: 'Quest',
    project: 'Project Quest',
    boss: 'Boss Quest',
  };
  readonly KIND_LABEL: Record<CareerEvidence['kind'], string> = {
    artifact: 'Artefato',
    explanation: 'Explicação',
    test: 'Teste',
  };

  readonly tab = signal<Tab>('today');
  readonly treeAttribute = signal<CareerAttribute>('technical');
  readonly selectedSkillId = signal<string | null>(null);
  readonly questTypeFilter = signal<CareerQuestType | ''>('');
  readonly draggingQuestId = signal<string | null>(null);
  readonly questGroupFilter = signal('');
  readonly questLevelFilter = signal<number | ''>('');
  /** All skill groups across attributes, for the quest "campo" filter. */
  readonly allGroups = computed(() => [
    ...new Set(this.allSkills().map((skill) => skill.group)),
  ]);

  // ---- state (per character, stored in the RPG profile) ----
  readonly state = computed(() => this.profile.state().careerQuest ?? null);
  /** Catalog skills plus the ones the player added. */
  readonly allSkills = computed(() => {
    const renamed = this.state()?.skillNameOverrides ?? {};
    return [
      ...CAREER_SKILLS.map((skill) =>
        renamed[skill.id] ? { ...skill, name: renamed[skill.id] } : skill,
      ),
      ...(this.state()?.customSkills ?? []).map((skill) => ({
        ...skill,
        horizon: skill.horizon ?? ('next' as const),
      })),
    ];
  });
  /** The four attributes with the player's renames applied. */
  readonly attributes = computed(() => {
    const labels = this.state()?.attributeLabels ?? {};
    return CAREER_ATTRIBUTES.map((attribute) => ({
      ...attribute,
      label: labels[attribute.id] || attribute.label,
    }));
  });
  readonly editingSkillId = signal<string | null>(null);
  editSkillName = '';
  editSkillGroup = '';
  readonly editingAttribute = signal(false);
  editAttributeLabel = '';
  readonly CLASSES: CareerSkillClass[] = ['core', 'important', 'supporting', 'awareness'];
  readonly groupsForAttribute = computed(() => [
    ...new Set(
      this.allSkills()
        .filter((skill) => skill.attribute === this.treeAttribute())
        .map((skill) => skill.group),
    ),
  ]);
  showNewSkill = false;
  newSkillName = '';
  newSkillGroup = '';
  newSkillClass: CareerSkillClass = 'important';
  newSkillTarget12 = 2;
  newSkillTarget24 = 3;
  newSkillStartMonth = 1;

  readonly overall = computed(() => {
    const state = this.state();
    return state ? progressTowardTargets(this.allSkills(), state) : 0;
  });
  readonly attributeCards = computed(() => {
    const state = this.state();
    return this.attributes().map((attribute) => {
      const skills = this.allSkills().filter((skill) => skill.attribute === attribute.id);
      return {
        ...attribute,
        progress: state
          ? progressTowardTargets(this.allSkills(), state, attribute.id)
          : 0,
        atTarget12: state
          ? skills.filter((skill) => skillLevel(state, skill.id) >= skill.target12).length
          : 0,
        total: skills.length,
      };
    });
  });
  // ---- Skill Tree filters ----
  readonly filterGroup = signal('');
  readonly filterLevel = signal<number | ''>('');
  readonly filterClass = signal<CareerSkillClass | ''>('');
  readonly filterStatus = signal<
    '' | 'blocked' | 'available' | 'provisional' | 'below12' | 'target'
  >('');
  readonly filterText = signal('');
  readonly filterHorizon = signal<'' | 'focus' | CareerHorizon>('');
  readonly hasTreeFilters = computed(
    () =>
      !!this.filterHorizon() ||
      !!this.filterGroup() ||
      this.filterLevel() !== '' ||
      !!this.filterClass() ||
      !!this.filterStatus() ||
      !!this.filterText().trim(),
  );

  readonly groupedTree = computed(() => {
    const state = this.state();
    const text = this.filterText().trim().toLowerCase();
    const groups = new Map<string, CareerSkillDef[]>();
    for (const skill of this.allSkills()) {
      if (skill.attribute !== this.treeAttribute()) continue;
      if (this.filterGroup() && skill.group !== this.filterGroup()) continue;
      if (this.filterClass() && skill.skillClass !== this.filterClass()) continue;
      const horizonFilter = this.filterHorizon();
      if (horizonFilter === 'focus' && !this.isFocused(skill.id)) continue;
      if (
        horizonFilter &&
        horizonFilter !== 'focus' &&
        horizonOf(skill, state) !== horizonFilter
      ) {
        continue;
      }
      const level = state ? skillLevel(state, skill.id) : 0;
      if (this.filterLevel() !== '' && level !== Number(this.filterLevel())) continue;
      if (
        text &&
        !skill.name.toLowerCase().includes(text) &&
        !skill.id.toLowerCase().includes(text)
      ) {
        continue;
      }
      const blocked = state ? unmetPrerequisites(skill, state).length > 0 : false;
      const status = this.filterStatus();
      if (status === 'blocked' && !blocked) continue;
      if (status === 'available' && blocked) continue;
      if (status === 'provisional' && !state?.skills[skill.id]?.provisional) continue;
      if (status === 'below12' && level >= skill.target12) continue;
      if (status === 'target' && level < skill.target24) continue;
      groups.set(skill.group, [...(groups.get(skill.group) ?? []), skill]);
    }
    return [...groups.entries()].map(([group, skills]) => ({ group, skills }));
  });
  readonly selectedSkill = computed(
    () => this.allSkills().find((skill) => skill.id === this.selectedSkillId()) ?? null,
  );
  readonly gapSort = signal<'gap' | 'priority' | 'horizon'>('priority');
  readonly gapHorizonFilter = signal<'' | CareerHorizon>('');
  readonly gapClassFilter = signal<CareerSkillClass | ''>('');
  readonly gaps = computed(() => {
    const state = this.state();
    if (!state) return [];
    const horizonRank: Record<CareerHorizon, number> = { now: 0, next: 1, later: 2 };
    const rows = skillGaps(this.allSkills(), state)
      .map((row) => ({
        ...row,
        horizon: horizonOf(row.skill, state),
        score: careerPriorityScore(row.skill, state),
      }))
      .filter(
        (row) =>
          (!this.gapHorizonFilter() || row.horizon === this.gapHorizonFilter()) &&
          (!this.gapClassFilter() || row.skill.skillClass === this.gapClassFilter()),
      );
    const sort = this.gapSort();
    if (sort === 'priority') {
      rows.sort((a, b) => b.score - a.score || b.gap24 - a.gap24);
    } else if (sort === 'horizon') {
      rows.sort(
        (a, b) => horizonRank[a.horizon] - horizonRank[b.horizon] || b.score - a.score,
      );
    }
    return rows;
  });

  // ---- Active Focus ----
  readonly FOCUS_LIMITS = FOCUS_LIMITS;
  readonly HORIZON_LABELS = CAREER_HORIZON_LABELS;
  readonly HORIZONS: CareerHorizon[] = ['now', 'next', 'later'];
  readonly focusSkills = computed(() => {
    const ids = new Set(this.state()?.focus ?? []);
    return this.allSkills().filter((skill) => ids.has(skill.id));
  });

  // ---- Hoje ----
  readonly todayPlan = computed(() => {
    const state = this.state();
    return state ? buildTodayPlan(state, this.allSkills()) : null;
  });

  // ---- Capstones ----
  readonly CAPSTONES = CAREER_CAPSTONES;
  readonly openRubrics = signal(new Set<string>());
  readonly openSolutions = signal(new Set<string>());
  /** Quests after the campo / nível / tipo filters. */
  private readonly _filteredQuests = computed(() => {
    const groupOf = new Map(this.allSkills().map((skill) => [skill.id, skill.group]));
    return (this.state()?.quests ?? []).filter((quest) => {
      if (
        this.questGroupFilter() &&
        !quest.skillIds.some((id) => groupOf.get(id) === this.questGroupFilter())
      ) {
        return false;
      }
      if (
        this.questLevelFilter() !== '' &&
        quest.level !== Number(this.questLevelFilter())
      ) {
        return false;
      }
      return !this.questTypeFilter() || quest.type === this.questTypeFilter();
    });
  });
  readonly KANBAN_COLUMNS: { status: CareerQuestStatus; label: string; icon: string }[] =
    [
      { status: 'todo', label: 'A fazer', icon: 'inbox' },
      { status: 'doing', label: 'Em andamento', icon: 'play_circle' },
      { status: 'done', label: 'Concluídas', icon: 'task_alt' },
    ];
  readonly kanban = computed(() => {
    const columns: Record<CareerQuestStatus, CareerQuest[]> = {
      todo: [],
      doing: [],
      done: [],
    };
    for (const quest of this._filteredQuests()) columns[quest.status].push(quest);
    columns.todo.sort((a, b) => (a.week ?? 99) - (b.week ?? 99));
    columns.doing.sort((a, b) => (a.week ?? 99) - (b.week ?? 99));
    columns.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return columns;
  });
  /** History for the "Concluídas" tab, newest first. */
  readonly completedQuests = computed(() =>
    (this.state()?.quests ?? [])
      .filter((quest) => quest.status === 'done')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
  );
  readonly doingQuests = computed(() =>
    (this.state()?.quests ?? []).filter((quest) => quest.status === 'doing'),
  );
  readonly nextQuests = computed(() =>
    (this.state()?.quests ?? [])
      .filter((quest) => quest.status === 'todo' && quest.type !== 'boss')
      .sort((a, b) => (a.week ?? 99) - (b.week ?? 99))
      .slice(0, 4),
  );
  readonly provisionalCount = computed(
    () =>
      Object.values(this.state()?.skills ?? {}).filter(
        (skill) => skill.provisional && skill.level > 0,
      ).length,
  );

  // ---- Academia Arcana link (playlists) ----
  readonly academyNodes = signal<StudyNode[]>([]);
  private readonly _academyAreas = signal<StudyArea[]>([]);
  private readonly _sessions = signal<StudySession[]>([]);
  /** Minutes studied per node, including everything under it. */
  readonly nodeMinutes = computed(() => {
    const nodes = this.academyNodes();
    const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
    const totals = new Map<string, number>();
    for (const session of this._sessions()) {
      if (session.status !== 'completed' || !session.nodeId) continue;
      let current: string | null | undefined = session.nodeId;
      const minutes = session.actualMinutes || session.plannedMinutes;
      while (current) {
        totals.set(current, (totals.get(current) ?? 0) + minutes);
        current = parentOf.get(current);
      }
    }
    return totals;
  });
  readonly linkedNode = computed(() => {
    const skill = this.selectedSkill();
    const nodeId = skill ? this.state()?.skills[skill.id]?.academyNodeId : null;
    return nodeId
      ? (this.academyNodes().find((node) => node.id === nodeId) ?? null)
      : null;
  });
  playlistLabel = '';
  playlistUrl = '';

  // ---- forms ----
  evidenceKind: CareerEvidence['kind'] = 'artifact';
  evidenceTitle = '';
  evidenceUrl = '';
  evidenceNote = '';
  evidenceAiPolicy: CareerAiPolicy = 'no-ai';
  evidencePassed = true;
  evidenceLevel = 1;
  readonly message = signal('');

  newQuestTitle = '';
  newQuestType: CareerQuestType = 'quest';
  newQuestSkill = 'PY-02';
  newQuestAiPolicy: CareerAiPolicy = 'no-ai';
  newQuestObjective = '';
  newQuestDeliverable = '';
  newQuestHours = 2;
  newQuestContent = '';
  showQuestPreview = false;

  ngOnInit(): void {
    this._ensureSeeded();
    void this._loadAcademy();
    // Includes archived tasks, so "finish day" doesn't erase past study time.
    void this._taskService
      .getAllTasksEverywhere()
      .then((tasks) => this._tasks.set(tasks));
  }

  openPaceSettings(): void {
    const targets = this.paceTargets();
    this.paceDailyHours = targets.dailyStudyMinutes / 60;
    this.paceWeeklyHours = targets.weeklyStudyMinutes / 60;
    this.paceWeeklyQuests = targets.weeklyQuests;
    this.paceWeeklyEvidence = targets.weeklyEvidence;
    this.paceCountAcademy = targets.countAcademy;
    this.paceProjectIds = new Set(targets.studyProjectIds);
    this.showPaceSettings = true;
  }

  togglePaceProject(projectId: string): void {
    const next = new Set(this.paceProjectIds);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    this.paceProjectIds = next;
  }

  savePaceSettings(): void {
    const hoursToMinutes = (hours: number): number =>
      Math.max(0, Math.round((Number(hours) || 0) * 60));
    this._update((state) => ({
      ...state,
      paceTargets: {
        dailyStudyMinutes: hoursToMinutes(this.paceDailyHours),
        weeklyStudyMinutes: hoursToMinutes(this.paceWeeklyHours),
        weeklyQuests: Math.max(0, Math.round(Number(this.paceWeeklyQuests) || 0)),
        weeklyEvidence: Math.max(0, Math.round(Number(this.paceWeeklyEvidence) || 0)),
        countAcademy: this.paceCountAcademy,
        studyProjectIds: [...this.paceProjectIds],
      },
    }));
    this.showPaceSettings = false;
  }

  pacePercent(value: number, target: number): number {
    return target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 100;
  }

  // ---------------- skills ----------------
  level(skillId: string): number {
    const state = this.state();
    return state ? skillLevel(state, skillId) : 0;
  }

  isProvisional(skillId: string): boolean {
    return !!this.state()?.skills[skillId]?.provisional;
  }

  skillProgress(skill: CareerSkillDef): number {
    return skill.target24
      ? Math.min(100, Math.round((this.level(skill.id) / skill.target24) * 100))
      : 100;
  }

  blockers(skill: CareerSkillDef): string {
    const state = this.state();
    if (!state) return '';
    return unmetPrerequisites(skill, state)
      .map((item) => `${item.id} L${item.level} (está em L${item.current})`)
      .join(' · ');
  }

  checklist(skillId: string): ReturnType<typeof promotionChecklist> {
    const state = this.state();
    const skill = this.allSkills().find((item) => item.id === skillId);
    return state ? promotionChecklist(skillId, state, skill) : null;
  }

  skillEvidence(skillId: string): CareerEvidence[] {
    return (this.state()?.evidence ?? [])
      .filter((item) => item.skillId === skillId)
      .sort((a, b) => b.level - a.level || b.at - a.at);
  }

  questsForSkill(skillId: string): CareerQuest[] {
    return (this.state()?.quests ?? []).filter((quest) =>
      quest.skillIds.includes(skillId),
    );
  }

  skillName(skillId: string): string {
    return this.allSkills().find((skill) => skill.id === skillId)?.name ?? skillId;
  }

  selectSkill(skillId: string): void {
    this.selectedSkillId.set(skillId);
    this.evidenceLevel = Math.min(5, this.level(skillId) + 1);
    this.message.set('');
  }

  isCustomSkill(skillId: string): boolean {
    return !!this.state()?.customSkills?.some((skill) => skill.id === skillId);
  }

  /** Adds a skill of the player's own to the current attribute's tree. */
  addCustomSkill(): void {
    const name = this.newSkillName.trim();
    const group = this.newSkillGroup.trim() || 'Minhas skills';
    if (!name) return;
    const attribute = this.treeAttribute();
    const prefix = { technical: 'TX', english: 'ENX', evidence: 'EVX', interview: 'INX' }[
      attribute
    ];
    const count = (this.state()?.customSkills ?? []).filter((skill) =>
      skill.id.startsWith(`${prefix}-`),
    ).length;
    const target12 = Math.max(0, Math.min(5, Number(this.newSkillTarget12)));
    const skill: CareerSkillDef = {
      id: `${prefix}-${String(count + 1).padStart(2, '0')}`,
      attribute,
      group,
      name,
      skillClass: this.newSkillClass,
      target12,
      target24: Math.max(target12, Math.min(5, Number(this.newSkillTarget24))),
      startMonth: Math.max(1, Number(this.newSkillStartMonth) || 1),
      prerequisites: [],
      criteria: CAREER_GENERIC_CRITERIA[attribute],
      horizon: 'next',
    };
    this._update((state) => ({
      ...state,
      customSkills: [...(state.customSkills ?? []), skill],
      skills: { ...state.skills, [skill.id]: { level: 0, provisional: true } },
    }));
    this.newSkillName = '';
    this.showNewSkill = false;
    this.selectSkill(skill.id);
  }

  removeCustomSkill(skill: CareerSkillDef): void {
    if (!confirmDialog(`Remover a skill "${skill.name}" e as evidências dela?`)) return;
    this._update((state) => {
      const skills = { ...state.skills };
      delete skills[skill.id];
      return {
        ...state,
        skills,
        customSkills: (state.customSkills ?? []).filter((item) => item.id !== skill.id),
        evidence: state.evidence.filter((item) => item.skillId !== skill.id),
      };
    });
    this.selectedSkillId.set(null);
  }

  /** Full instructions (e.g. entrance tests), revealed only once the quest is started. */
  /** Structured content of catalog quests (prompt / rubric / solution kept apart). */
  questContent(quest: CareerQuest): CareerQuestContent | null {
    const catalog = CAREER_QUEST_CONTENT.get(quest.id);
    if (catalog) return catalog;
    // Custom quests: builder markup → blocks.
    return quest.content?.trim()
      ? { promptContent: parseCareerMarkup(quest.content) }
      : null;
  }

  isRubricOpen(questId: string): boolean {
    return this.openRubrics().has(questId);
  }

  isSolutionOpen(questId: string): boolean {
    return this.openSolutions().has(questId);
  }

  toggleRubric(questId: string): void {
    const next = new Set(this.openRubrics());
    if (next.has(questId)) next.delete(questId);
    else next.add(questId);
    this.openRubrics.set(next);
  }

  /** The solution is never shown by default; before finishing it asks first. */
  toggleSolution(quest: CareerQuest): void {
    const next = new Set(this.openSolutions());
    if (next.has(quest.id)) {
      next.delete(quest.id);
    } else {
      if (
        quest.status !== 'done' &&
        !confirmDialog(
          'Ver a solução antes de terminar invalida o teste/quest como diagnóstico. Abrir mesmo assim?',
        )
      ) {
        return;
      }
      next.add(quest.id);
    }
    this.openSolutions.set(next);
  }

  /** "Começar" from the Hoje tab: starts the quest and shows it on the board. */
  startQuest(quest: CareerQuest): void {
    if (quest.status === 'todo') this.setQuestStatus(quest, 'doing');
    this.tab.set('quests');
  }

  /** Academia node linked to a skill (its study playlist), if any. */
  playlistFor(skillId: string): StudyNode | null {
    const nodeId = this.state()?.skills[skillId]?.academyNodeId;
    return nodeId
      ? (this.academyNodes().find((node) => node.id === nodeId) ?? null)
      : null;
  }

  // ---------------- focus & horizon ----------------
  isFocused(skillId: string): boolean {
    return !!this.state()?.focus?.includes(skillId);
  }

  toggleFocus(skill: CareerSkillDef): void {
    const state = this.state();
    if (!state) return;
    if (this.isFocused(skill.id)) {
      this._update((current) => ({
        ...current,
        focus: (current.focus ?? []).filter((id) => id !== skill.id),
      }));
      return;
    }
    if (!canAddFocus(skill, state, this.allSkills())) {
      this.message.set(
        `Limite de foco atingido: no máximo ${FOCUS_LIMITS[skill.attribute]} skill(s) desse atributo ao mesmo tempo. Tire uma do foco antes.`,
      );
      return;
    }
    this._update((current) => ({
      ...current,
      focus: [...(current.focus ?? []), skill.id],
    }));
  }

  horizon(skill: CareerSkillDef): CareerHorizon {
    return horizonOf(skill, this.state());
  }

  setHorizon(skillId: string, horizon: CareerHorizon): void {
    this._update((state) => ({
      ...state,
      horizonOverrides: { ...state.horizonOverrides, [skillId]: horizon },
    }));
  }

  // ---------------- capstones ----------------
  capstoneState(id: string): CareerCapstoneState {
    return this.state()?.capstones?.[id] ?? { status: 'todo', checked: [] };
  }

  /** "CAP-01" → done?; "PY-03 L3" → level reached? */
  isCapstonePrereqMet(prereq: string): boolean {
    if (prereq.startsWith('CAP-')) return this.capstoneState(prereq).status === 'done';
    const [skillId, levelText] = prereq.split(' ');
    return this.level(skillId) >= Number(levelText?.replace('L', '') ?? 0);
  }

  toggleCapstoneCheck(capstone: CareerCapstoneDef, index: number): void {
    const current = this.capstoneState(capstone.id);
    const checked = current.checked.includes(index)
      ? current.checked.filter((item) => item !== index)
      : [...current.checked, index];
    this._update((state) => ({
      ...state,
      capstones: { ...state.capstones, [capstone.id]: { ...current, checked } },
    }));
  }

  setCapstoneStatus(capstone: CareerCapstoneDef, status: CareerQuestStatus): void {
    const current = this.capstoneState(capstone.id);
    if (status === 'done' && current.checked.length < capstone.checklist.length) {
      this.message.set('Complete todo o checklist do Capstone antes de concluí-lo.');
      return;
    }
    const sourceId = `career-quest:capstone:${capstone.id}`;
    if (status === 'done' && current.status !== 'done') {
      this.profile.grantExternalReward(
        sourceId,
        capstone.xp,
        capstone.coins,
        'career-quest',
      );
      this.message.set(
        `${capstone.id} concluído! +${capstone.xp} XP. Registre as evidências nas skills validadas.`,
      );
    } else if (current.status === 'done' && status !== 'done') {
      this.profile.revokeExternalReward(sourceId, capstone.xp, capstone.coins);
    }
    this._update((state) => ({
      ...state,
      capstones: {
        ...state.capstones,
        [capstone.id]: {
          ...current,
          status,
          completedAt: status === 'done' ? Date.now() : undefined,
        },
      },
    }));
  }

  /** Builder preview: same parser + renderer as saved quests. */
  previewContent(): CareerContent {
    return parseCareerMarkup(this.newQuestContent);
  }

  clearTreeFilters(): void {
    this.filterHorizon.set('');
    this.filterGroup.set('');
    this.filterLevel.set('');
    this.filterClass.set('');
    this.filterStatus.set('');
    this.filterText.set('');
  }

  setTreeAttribute(attribute: CareerAttribute): void {
    this.treeAttribute.set(attribute);
    // Groups belong to one attribute, so a stale group filter would hide everything.
    this.filterGroup.set('');
  }

  startEditSkill(skill: CareerSkillDef): void {
    this.editSkillName = skill.name;
    this.editSkillGroup = skill.group;
    this.editingSkillId.set(skill.id);
  }

  saveSkillEdit(): void {
    const id = this.editingSkillId();
    const name = this.editSkillName.trim();
    if (!id || !name) return;
    this._update((state) => {
      if ((state.customSkills ?? []).some((skill) => skill.id === id)) {
        return {
          ...state,
          customSkills: (state.customSkills ?? []).map((skill) =>
            skill.id === id
              ? { ...skill, name, group: this.editSkillGroup.trim() || skill.group }
              : skill,
          ),
        };
      }
      const original = CAREER_SKILLS.find((skill) => skill.id === id)?.name;
      const overrides = { ...state.skillNameOverrides };
      // Renaming back to the catalog name simply drops the override.
      if (name === original) delete overrides[id];
      else overrides[id] = name;
      return { ...state, skillNameOverrides: overrides };
    });
    this.editingSkillId.set(null);
  }

  restoreSkillName(skillId: string): void {
    this._update((state) => {
      const overrides = { ...state.skillNameOverrides };
      delete overrides[skillId];
      return { ...state, skillNameOverrides: overrides };
    });
    this.editingSkillId.set(null);
  }

  isRenamed(skillId: string): boolean {
    return !!this.state()?.skillNameOverrides?.[skillId];
  }

  startEditAttribute(): void {
    this.editAttributeLabel =
      this.attributes().find((item) => item.id === this.treeAttribute())?.label ?? '';
    this.editingAttribute.set(true);
  }

  saveAttributeLabel(): void {
    const attribute = this.treeAttribute();
    const label = this.editAttributeLabel.trim();
    this._update((state) => {
      const labels = { ...state.attributeLabels };
      // An empty name restores the default.
      if (label) labels[attribute] = label;
      else delete labels[attribute];
      return { ...state, attributeLabels: labels };
    });
    this.editingAttribute.set(false);
  }

  /** Opens a skill in the tree, switching to its attribute. */
  openSkill(skillId: string): void {
    const skill = this.allSkills().find((item) => item.id === skillId);
    if (!skill) return;
    this.treeAttribute.set(skill.attribute);
    this.tab.set('tree');
    this.selectSkill(skillId);
  }

  /** Provisional (pre-test) levels can be adjusted freely; proven ones can't. */
  setProvisionalLevel(skillId: string, level: number): void {
    this._update((state) => ({
      ...state,
      skills: {
        ...state.skills,
        [skillId]: { ...state.skills[skillId], level: Number(level), provisional: true },
      },
    }));
  }

  addEvidence(): void {
    const skill = this.selectedSkill();
    if (!skill || !this.evidenceTitle.trim()) return;
    const evidence: CareerEvidence = {
      id: crypto.randomUUID(),
      skillId: skill.id,
      level: Number(this.evidenceLevel),
      kind: this.evidenceKind,
      title: this.evidenceTitle.trim(),
      url: this.evidenceUrl.trim(),
      note: this.evidenceNote.trim(),
      aiPolicy: this.evidenceAiPolicy,
      passed: this.evidenceKind === 'test' ? this.evidencePassed : undefined,
      at: Date.now(),
    };
    this._update((state) => this._withEvidence(state, evidence));
    this.evidenceTitle = '';
    this.evidenceUrl = '';
    this.evidenceNote = '';
    this.message.set('Evidência registrada.');
  }

  /** Adds evidence; a test also settles the skill's level (see applyTestResult). */
  private _withEvidence(
    state: CareerQuestState,
    evidence: CareerEvidence,
  ): CareerQuestState {
    const current = state.skills[evidence.skillId] ?? { level: 0, provisional: true };
    const next =
      evidence.kind === 'test'
        ? applyTestResult(current, evidence.level, !!evidence.passed, Date.now())
        : current;
    return {
      ...state,
      evidence: [...state.evidence, evidence],
      skills: { ...state.skills, [evidence.skillId]: next },
    };
  }

  // ---------------- in-app self-grading ----------------
  selfGrade(quest: CareerQuest, itemId: string): CareerSelfGrade | undefined {
    return quest.selfGrade?.[itemId];
  }

  setSelfGrade(quest: CareerQuest, itemId: string, grade: CareerSelfGrade): void {
    this._update((state) => ({
      ...state,
      quests: state.quests.map((item) =>
        item.id === quest.id
          ? { ...item, selfGrade: { ...item.selfGrade, [itemId]: grade } }
          : item,
      ),
    }));
  }

  groupScore(
    quest: CareerQuest,
    group: CareerGradingGroup,
  ): ReturnType<typeof gradeGroup> {
    return gradeGroup(group, quest.selfGrade);
  }

  /** Records one Test evidence per graded skill, settles the levels and finishes the quest. */
  recordGrading(quest: CareerQuest, groups: CareerGradingGroup[]): void {
    const unanswered = groups.some(
      (group) => this.groupScore(quest, group).answered < group.items.length,
    );
    if (unanswered) {
      this.message.set('Marque todos os itens antes de registrar o resultado.');
      return;
    }
    if (
      quest.gradedAt &&
      !confirmDialog('Este teste já tem resultado registrado. Registrar de novo?')
    ) {
      return;
    }
    const now = Date.now();
    const summary: string[] = [];
    this._update((state) => {
      let next = state;
      for (const group of groups) {
        const score = gradeGroup(group, quest.selfGrade);
        summary.push(
          `${group.skillId} L${group.level}: ${score.passed ? 'passou' : 'falhou'} (${score.valid}/${score.total})`,
        );
        next = this._withEvidence(next, {
          id: crypto.randomUUID(),
          skillId: group.skillId,
          level: group.level,
          kind: 'test',
          title: `${quest.title} — ${score.valid}/${score.total}`,
          url: '',
          note: group.items
            .map((item) => `${item.label}: ${quest.selfGrade?.[item.id] ?? '-'}`)
            .join(' · '),
          aiPolicy: 'no-ai',
          passed: score.passed,
          at: now,
        });
      }
      return {
        ...next,
        quests: next.quests.map((item) =>
          item.id === quest.id ? { ...item, gradedAt: now } : item,
        ),
      };
    });
    if (quest.status !== 'done') this.setQuestStatus(quest, 'done');
    this.message.set(`Resultado registrado — ${summary.join(' · ')}.`);
  }

  // ---------------- IA (Gemini) ----------------
  readonly gemini = inject(GeminiService);
  private readonly _careerAi = inject(CareerQuestAiService);
  /** Unsaved submission text per quest (saved with the grading). */
  readonly aiDrafts = signal<Record<string, string>>({});
  readonly aiImages = signal<Record<string, string[]>>({});
  readonly aiUsedDocs = signal<Record<string, boolean>>({});
  /** Quest/skill ids with an AI request running. */
  readonly aiBusy = signal<string[]>([]);

  private _setBusy(id: string, busy: boolean): void {
    this.aiBusy.update((ids) =>
      busy ? [...ids, id] : ids.filter((item) => item !== id),
    );
  }

  aiDraft(quest: CareerQuest): string {
    return this.aiDrafts()[quest.id] ?? quest.aiSubmission ?? '';
  }

  setAiDraft(quest: CareerQuest, text: string): void {
    this.aiDrafts.update((drafts) => ({ ...drafts, [quest.id]: text }));
  }

  toggleUsedDocs(quest: CareerQuest, checked: boolean): void {
    this.aiUsedDocs.update((all) => ({ ...all, [quest.id]: checked }));
  }

  usedDocs(quest: CareerQuest): boolean {
    return this.aiUsedDocs()[quest.id] ?? quest.aiUsedDocs ?? false;
  }

  /** Text files go into the submission (with their name); images are sent as images. */
  async attachToSubmission(quest: CareerQuest, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await readFileAsShrunkDataUrl(file, 1600);
        this.aiImages.update((all) => ({
          ...all,
          [quest.id]: [...(all[quest.id] ?? []), dataUrl],
        }));
      } else {
        const text = await file.text();
        this.setAiDraft(
          quest,
          `${this.aiDraft(quest)}\n\n=== arquivo: ${file.name} ===\n${text.slice(0, 30000)}`.trim(),
        );
      }
    }
  }

  removeAiImage(quest: CareerQuest, index: number): void {
    this.aiImages.update((all) => ({
      ...all,
      [quest.id]: (all[quest.id] ?? []).filter((_, i) => i !== index),
    }));
  }

  /** AI grading: fills the self-grade from the AI verdict; the player still records it. */
  async gradeWithAi(quest: CareerQuest, content: CareerQuestContent): Promise<void> {
    const submission = this.aiDraft(quest).trim();
    const images = this.aiImages()[quest.id] ?? [];
    if (!submission && !images.length) {
      this.message.set('Cole sua resposta/código ou anexe arquivos antes de corrigir.');
      return;
    }
    this._setBusy(quest.id, true);
    try {
      const review = await this._careerAi.grade(quest, content, submission, images);
      const usedDocs = this.usedDocs(quest);
      const selfGrade: Record<string, CareerSelfGrade> = { ...quest.selfGrade };
      for (const group of content.grading?.groups ?? []) {
        for (const item of group.items) {
          const verdict = review.items[item.id];
          selfGrade[item.id] = verdict?.passed ? (usedDocs ? 'doc' : 'solo') : 'fail';
        }
      }
      this._update((state) => ({
        ...state,
        quests: state.quests.map((item) =>
          item.id === quest.id
            ? {
                ...item,
                aiReview: review,
                aiSubmission: submission.slice(0, 40000),
                aiUsedDocs: usedDocs,
                selfGrade,
              }
            : item,
        ),
      }));
      this.message.set(
        content.grading
          ? `Corrigido pela IA (${review.score}/100). Confira e clique em "Registrar resultado".`
          : `Corrigido pela IA (${review.score}/100).`,
      );
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this._setBusy(quest.id, false);
    }
  }

  // ---- simulado de entrevista ----
  readonly interview = signal<{
    skillId: string;
    lang: 'pt' | 'en';
    level: number;
    loading: boolean;
    questions: string[];
    answers: string[];
    result: CareerInterviewResult | null;
    error: string;
    recorded: boolean;
  } | null>(null);

  async startInterview(skill: CareerSkillDef, lang: 'pt' | 'en'): Promise<void> {
    const level = Math.min(5, Math.max(1, this.level(skill.id) + 1));
    this.interview.set({
      skillId: skill.id,
      lang,
      level,
      loading: true,
      questions: [],
      answers: [],
      result: null,
      error: '',
      recorded: false,
    });
    try {
      const questions = await this._careerAi.interviewQuestions(skill, level, lang);
      this.interview.update((state) =>
        state?.skillId === skill.id
          ? { ...state, loading: false, questions, answers: questions.map(() => '') }
          : state,
      );
    } catch (e) {
      this.interview.update((state) =>
        state ? { ...state, loading: false, error: (e as Error).message } : state,
      );
    }
  }

  setInterviewAnswer(index: number, text: string): void {
    this.interview.update((state) =>
      state
        ? {
            ...state,
            answers: state.answers.map((answer, i) => (i === index ? text : answer)),
          }
        : state,
    );
  }

  async gradeInterview(skill: CareerSkillDef): Promise<void> {
    const state = this.interview();
    if (!state) return;
    this.interview.set({ ...state, loading: true, error: '' });
    try {
      const result = await this._careerAi.gradeInterview(
        skill,
        state.level,
        state.lang,
        state.questions.map((question, index) => ({
          question,
          answer: state.answers[index] ?? '',
        })),
      );
      this.interview.set({ ...state, loading: false, result });
    } catch (e) {
      this.interview.set({ ...state, loading: false, error: (e as Error).message });
    }
  }

  /** Saves the interview as a written explanation (evidence) for the skill. */
  recordInterview(skill: CareerSkillDef): void {
    const state = this.interview();
    if (!state?.result || state.recorded) return;
    const result = state.result;
    this._update((current) =>
      this._withEvidence(current, {
        id: crypto.randomUUID(),
        skillId: skill.id,
        level: state.level,
        kind: 'explanation',
        title: `Simulado de entrevista (${state.lang === 'en' ? 'inglês' : 'português'}) — ${result.score}/100`,
        url: '',
        note: result.summary,
        aiPolicy: 'no-ai',
        at: Date.now(),
      }),
    );
    this.interview.set({ ...state, recorded: true });
    this.message.set('Simulado registrado como evidência (explicação escrita).');
  }

  // ---- code review dos capstones ----
  readonly reviewDrafts = signal<Record<string, string>>({});
  readonly reviewImages = signal<Record<string, string[]>>({});

  setReviewDraft(capstoneId: string, text: string): void {
    this.reviewDrafts.update((drafts) => ({ ...drafts, [capstoneId]: text }));
  }

  async attachToReview(capstoneId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await readFileAsShrunkDataUrl(file, 1600);
        this.reviewImages.update((all) => ({
          ...all,
          [capstoneId]: [...(all[capstoneId] ?? []), dataUrl],
        }));
      } else {
        const text = await file.text();
        this.setReviewDraft(
          capstoneId,
          `${this.reviewDrafts()[capstoneId] ?? ''}\n\n=== arquivo: ${file.name} ===\n${text.slice(0, 40000)}`.trim(),
        );
      }
    }
  }

  async reviewCapstoneCode(capstone: CareerCapstoneDef): Promise<void> {
    const code = (this.reviewDrafts()[capstone.id] ?? '').trim();
    const images = this.reviewImages()[capstone.id] ?? [];
    if (!code && !images.length) {
      this.message.set('Cole o código ou anexe os arquivos do projeto.');
      return;
    }
    const busyId = `review:${capstone.id}`;
    this._setBusy(busyId, true);
    try {
      const review = await this._careerAi.codeReview(
        capstone.title,
        capstone.summary,
        code,
        images,
      );
      this._update((state) => {
        const current = state.capstones?.[capstone.id] ?? { status: 'todo', checked: [] };
        return {
          ...state,
          capstones: {
            ...state.capstones,
            [capstone.id]: { ...current, codeReview: review },
          },
        };
      });
      this.message.set(`Code review pronto: ${review.score}/100.`);
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this._setBusy(busyId, false);
    }
  }

  /** A new quest for the skill's next level, written by the AI. */
  async generateQuestFor(skill: CareerSkillDef): Promise<void> {
    const busyId = `quest:${skill.id}`;
    this._setBusy(busyId, true);
    try {
      const level = Math.min(5, this.level(skill.id) + 1);
      const draft = await this._careerAi.draftQuest(
        skill,
        level,
        (this.state()?.quests ?? [])
          .filter((quest) => quest.skillIds.includes(skill.id))
          .map((quest) => quest.title),
      );
      const quest: CareerQuest = {
        id: `custom-${crypto.randomUUID()}`,
        type: 'quest',
        title: draft.title,
        skillIds: [skill.id],
        level,
        objective: draft.objective ?? '',
        difficulty: Math.min(5, Math.max(1, level)),
        aiPolicy: 'no-ai',
        deliverable: draft.deliverable ?? '',
        evidence: '',
        estimatedHours: Math.max(0.5, Number(draft.estimatedHours) || 2),
        prerequisites: '',
        status: 'todo',
        content: draft.content,
      };
      this._update((state) => ({ ...state, quests: [...state.quests, quest] }));
      this.message.set(`Quest criada pela IA: ${quest.title}.`);
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this._setBusy(busyId, false);
    }
  }

  /** Builds the skill's study playlist in Academia: modules → topics (search terms). */
  async generateSyllabus(skill: CareerSkillDef): Promise<void> {
    const busyId = `syllabus:${skill.id}`;
    this._setBusy(busyId, true);
    try {
      if (!this.state()?.skills[skill.id]?.academyNodeId)
        await this.createPlaylist(skill);
      const parentId = this.state()?.skills[skill.id]?.academyNodeId;
      const parent = this.academyNodes().find((node) => node.id === parentId);
      if (!parent) throw new Error('Não consegui criar a playlist na Academia.');
      const from = this.level(skill.id);
      const syllabus = await this._careerAi.syllabus(skill, from, Math.min(5, from + 1));
      const now = Date.now();
      const base = {
        createdAt: now,
        updatedAt: now,
        revision: 1,
        deviceId: 'local-device',
        deletedAt: null,
        profileId: parent.profileId,
        areaId: parent.areaId,
        notesMarkdown: '',
        drawing: null,
        color: parent.color,
        coverUrl: null,
        difficulty: 3,
        weight: 1,
        completedAt: null,
      };
      const existing = this.academyNodes().filter(
        (node) => node.parentId === parent.id,
      ).length;
      for (const [moduleIndex, module] of (syllabus.modules ?? []).entries()) {
        const moduleNode: StudyNode = {
          ...base,
          id: crypto.randomUUID(),
          parentId: parent.id,
          kind: 'module',
          title: `${existing + moduleIndex + 1}. ${module.title}`,
          description: module.description ?? '',
          links: [],
          icon: 'folder',
          position: existing + moduleIndex,
        };
        await this._academy.putNode(moduleNode);
        for (const [topicIndex, topic] of (module.topics ?? []).entries()) {
          await this._academy.putNode({
            ...base,
            id: crypto.randomUUID(),
            parentId: moduleNode.id,
            kind: 'topic',
            title: topic.title,
            description: topic.search ? `Buscar: ${topic.search}` : '',
            links: topic.search
              ? [
                  {
                    label: `YouTube: ${topic.search}`,
                    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.search)}`,
                  },
                ]
              : [],
            icon: 'topic',
            position: topicIndex,
          });
        }
      }
      await this._loadAcademy();
      this.message.set(
        `Trilha criada na Academia: ${syllabus.modules?.length ?? 0} módulos para ${skill.name}.`,
      );
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this._setBusy(busyId, false);
    }
  }

  removeEvidence(evidenceId: string): void {
    if (!confirmDialog('Remover esta evidência?')) return;
    this._update((state) => ({
      ...state,
      evidence: state.evidence.filter((item) => item.id !== evidenceId),
    }));
  }

  promote(skill: CareerSkillDef): void {
    const list = this.checklist(skill.id);
    if (!list?.ready) return;
    this._update((state) => ({
      ...state,
      skills: {
        ...state.skills,
        [skill.id]: {
          ...state.skills[skill.id],
          level: list.nextLevel,
          provisional: false,
          levelChangedAt: Date.now(),
        },
      },
    }));
    const reward = promotionReward(list.nextLevel);
    this.profile.grantExternalReward(
      `career-quest:promotion:${skill.id}:${list.nextLevel}`,
      reward.xp,
      reward.coins,
      'career-quest',
    );
    this.evidenceLevel = Math.min(5, list.nextLevel + 1);
    this.message.set(
      `${skill.id} subiu para L${list.nextLevel} — ${CAREER_LEVEL_NAMES[list.nextLevel]}! +${reward.xp} XP`,
    );
  }

  /** Re-validation failed: knowledge without use decays, so the level can drop. */
  demote(skill: CareerSkillDef): void {
    const current = this.level(skill.id);
    if (!current || !confirmDialog(`Rebaixar ${skill.id} para L${current - 1}?`)) return;
    this._update((state) => ({
      ...state,
      skills: {
        ...state.skills,
        [skill.id]: {
          ...state.skills[skill.id],
          level: current - 1,
          levelChangedAt: Date.now(),
        },
      },
    }));
  }

  // ---------------- quests ----------------
  setQuestStatus(quest: CareerQuest, status: CareerQuestStatus): void {
    const wasDone = quest.status === 'done';
    this._update((state) => ({
      ...state,
      quests: state.quests.map((item) =>
        item.id === quest.id
          ? { ...item, status, completedAt: status === 'done' ? Date.now() : undefined }
          : item,
      ),
    }));
    const reward = QUEST_REWARD[quest.type];
    const sourceId = `career-quest:quest:${quest.id}`;
    if (status === 'done' && !wasDone) {
      this.profile.grantExternalReward(sourceId, reward.xp, reward.coins, 'career-quest');
      this.message.set(
        `Quest concluída! +${reward.xp} XP. Registre a evidência na skill.`,
      );
    } else if (wasDone && status !== 'done') {
      this.profile.revokeExternalReward(sourceId, reward.xp, reward.coins);
    }
  }

  /** Moves a card one column left (-1) or right (+1) on the kanban. */
  moveQuest(quest: CareerQuest, direction: -1 | 1): void {
    const order: CareerQuestStatus[] = ['todo', 'doing', 'done'];
    const next = order[order.indexOf(quest.status) + direction];
    if (next) this.setQuestStatus(quest, next);
  }

  onQuestDrop(event: DragEvent, status: CareerQuestStatus): void {
    event.preventDefault();
    const id = this.draggingQuestId() ?? event.dataTransfer?.getData('text/plain');
    this.draggingQuestId.set(null);
    const quest = this.state()?.quests.find((item) => item.id === id);
    if (quest && quest.status !== status) this.setQuestStatus(quest, status);
  }

  onQuestDragStart(event: DragEvent, quest: CareerQuest): void {
    this.draggingQuestId.set(quest.id);
    event.dataTransfer?.setData('text/plain', quest.id);
  }

  addQuest(): void {
    if (!this.newQuestTitle.trim()) return;
    const quest: CareerQuest = {
      id: `custom-${crypto.randomUUID()}`,
      type: this.newQuestType,
      title: this.newQuestTitle.trim(),
      skillIds: [this.newQuestSkill],
      level: Math.min(5, this.level(this.newQuestSkill) + 1),
      objective: this.newQuestObjective.trim(),
      difficulty:
        this.newQuestType === 'micro' ? 1 : this.newQuestType === 'quest' ? 2 : 4,
      aiPolicy: this.newQuestAiPolicy,
      deliverable: this.newQuestDeliverable.trim(),
      evidence: '',
      estimatedHours: Number(this.newQuestHours) || 1,
      prerequisites: '',
      status: 'todo',
      content: this.newQuestContent.trim() || undefined,
    };
    this._update((state) => ({ ...state, quests: [...state.quests, quest] }));
    this.newQuestContent = '';
    this.showQuestPreview = false;
    this.newQuestTitle = '';
    this.newQuestObjective = '';
    this.newQuestDeliverable = '';
  }

  removeQuest(quest: CareerQuest): void {
    if (!confirmDialog(`Remover a quest "${quest.title}"?`)) return;
    if (quest.status === 'done') {
      const reward = QUEST_REWARD[quest.type];
      this.profile.revokeExternalReward(
        `career-quest:quest:${quest.id}`,
        reward.xp,
        reward.coins,
      );
    }
    this._update((state) => ({
      ...state,
      quests: state.quests.filter((item) => item.id !== quest.id),
    }));
  }

  // ---------------- Academia playlists ----------------
  linkAcademyNode(skillId: string, nodeId: string): void {
    this._update((state) => ({
      ...state,
      skills: {
        ...state.skills,
        [skillId]: {
          ...(state.skills[skillId] ?? { level: 0, provisional: true }),
          academyNodeId: nodeId || null,
        },
      },
    }));
  }

  /** Creates a node for the skill under a "Career Quest" area in Academia Arcana and links it. */
  async createPlaylist(skill: CareerSkillDef): Promise<void> {
    const profileId = this.profile.activeCharacterId();
    const now = Date.now();
    const meta = {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deviceId: 'local-device',
      deletedAt: null,
    };
    let area = this._academyAreas().find(
      (item) => item.title === CAREER_AREA_TITLE && !item.deletedAt,
    );
    if (!area) {
      area = {
        ...meta,
        id: crypto.randomUUID(),
        profileId,
        title: CAREER_AREA_TITLE,
        description: 'Playlists de estudo ligadas às skills do Career Quest.',
        color: '#d9a43a',
        icon: 'military_tech',
        coverUrl: null,
        position: this._academyAreas().length,
      };
      await this._academy.putArea(area);
    }
    const node: StudyNode = {
      ...meta,
      id: crypto.randomUUID(),
      profileId,
      areaId: area.id,
      parentId: null,
      kind: 'course',
      title: `${skill.id} · ${skill.name}`,
      description: `Playlist da skill ${skill.id} (Career Quest).`,
      notesMarkdown: '',
      links: [],
      drawing: null,
      color: area.color,
      icon: 'playlist_play',
      coverUrl: null,
      position: this.academyNodes().filter((item) => item.areaId === area.id).length,
      difficulty: 3,
      weight: 1,
      completedAt: null,
    };
    await this._academy.putNode(node);
    await this._loadAcademy();
    this.linkAcademyNode(skill.id, node.id);
  }

  async addPlaylistItem(): Promise<void> {
    const node = this.linkedNode();
    if (!node || !this.playlistLabel.trim()) return;
    await this._saveNode({
      ...node,
      links: [
        ...(node.links ?? []),
        { label: this.playlistLabel.trim(), url: this.playlistUrl.trim() },
      ],
    });
    this.playlistLabel = '';
    this.playlistUrl = '';
  }

  async removePlaylistItem(index: number): Promise<void> {
    const node = this.linkedNode();
    if (!node) return;
    await this._saveNode({
      ...node,
      links: (node.links ?? []).filter((_, i) => i !== index),
    });
  }

  formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${rest}min`;
  }

  private async _saveNode(node: StudyNode): Promise<void> {
    await this._academy.putNode({
      ...node,
      updatedAt: Date.now(),
      revision: node.revision + 1,
    });
    await this._loadAcademy();
  }

  private async _loadAcademy(): Promise<void> {
    const profileId = this.profile.activeCharacterId();
    const now = Date.now();
    const yearsMs = 3 * 365 * 86_400_000;
    const [areas, nodes, sessions] = await Promise.all([
      this._academy.listAreas(profileId),
      this._academy.listNodes(profileId),
      this._academy.listSessions(profileId, now - yearsMs, now, 0, 10_000),
    ]);
    this._academyAreas.set(areas.filter((item) => !item.deletedAt));
    this.academyNodes.set(nodes.filter((item) => !item.deletedAt));
    this._sessions.set(sessions);
  }

  /** First open: starting levels (provisional) + planned quests. Later: add new catalog quests. */
  private _ensureSeeded(): void {
    const existing = this.state();
    // The baseline is the owner's own diagnosis - other characters start at 0.
    const isOwner = this.profile.isOwnerCharacter();
    if (!existing) {
      const skills: CareerQuestState['skills'] = {};
      for (const skill of CAREER_SKILLS) {
        skills[skill.id] = {
          level: isOwner ? (CAREER_BASELINE_LEVELS[skill.id] ?? 0) : 0,
          provisional: true,
        };
      }
      this.profile.updateCareerQuest(() => ({
        skills,
        evidence: [],
        quests: CAREER_SEED_QUESTS.map((quest) => ({ ...quest, status: 'todo' })),
        focus: [...INITIAL_FOCUS],
        seededAt: Date.now(),
      }));
      return;
    }
    // Repair: before the owner check, other characters were seeded with the
    // owner's baseline. Reset them while still untouched (all levels exactly
    // the provisional baseline, no evidence recorded).
    const hasOwnerBaseline =
      !isOwner &&
      !existing.evidence.length &&
      Object.values(CAREER_BASELINE_LEVELS).some((level) => level > 0) &&
      Object.entries(existing.skills).every(
        ([id, skill]) =>
          skill.provisional && skill.level === (CAREER_BASELINE_LEVELS[id] ?? 0),
      );
    if (hasOwnerBaseline) {
      this._update((state) => ({
        ...state,
        skills: Object.fromEntries(
          Object.entries(state.skills).map(([id, skill]) => [id, { ...skill, level: 0 }]),
        ),
      }));
      return;
    }
    const known = new Set(existing.quests.map((quest) => quest.id));
    const missing = CAREER_SEED_QUESTS.filter((quest) => !known.has(quest.id));
    const missingSkills = CAREER_SKILLS.filter((skill) => !existing.skills[skill.id]);
    const needsFocus = existing.focus === undefined;
    if (!missing.length && !missingSkills.length && !needsFocus) return;
    this._update((state) => ({
      ...state,
      focus: state.focus ?? [...INITIAL_FOCUS],
      quests: [
        ...state.quests,
        ...missing.map((quest) => ({ ...quest, status: 'todo' as const })),
      ],
      skills: {
        ...state.skills,
        ...Object.fromEntries(
          missingSkills.map((skill) => [skill.id, { level: 0, provisional: true }]),
        ),
      },
    }));
  }

  private _update(change: (state: CareerQuestState) => CareerQuestState): void {
    this.profile.updateCareerQuest((current) =>
      change(current ?? { skills: {}, evidence: [], quests: [], seededAt: Date.now() }),
    );
  }
}
