import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LS } from '../../core/persistence/storage-keys.const';
import { Task } from '../tasks/task.model';
import { TaskService } from '../tasks/task.service';
import { TaskHabit, TaskHabitLink, TaskHabitState } from './task-habit.model';
import { DomainStateStore } from '../../core/persistence/domain-state-store.service';
import { TaskRepeatCfgService } from '../task-repeat-cfg/task-repeat-cfg.service';
import {
  TASK_REPEAT_WEEKDAY_MAP,
  TaskRepeatCfg,
} from '../task-repeat-cfg/task-repeat-cfg.model';
import { ScheduleService } from '../schedule/schedule.service';

const EMPTY_STATE: TaskHabitState = {
  habits: [],
  taskCompletions: {},
  manualCompletions: {},
};

const normalizeTitle = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase();

@Injectable({ providedIn: 'root' })
export class TaskHabitService {
  private readonly _taskService = inject(TaskService);
  private readonly _taskRepeatCfgService = inject(TaskRepeatCfgService);
  private readonly _scheduleService = inject(ScheduleService);
  private readonly _domainState = inject(DomainStateStore);
  private readonly _state = signal<TaskHabitState>(this._load());
  private readonly _tasks = signal<Task[]>([]);
  private readonly _repeatCfgs = signal<TaskRepeatCfg[]>([]);
  // Task ids explicitly marked "not done" via the RPG profile's
  // markTaskAsFailed - pushed in from RpgProfileService (which already
  // depends on this service) rather than injected here, to avoid a circular
  // DI dependency. A failed task still has isDone:true (so it leaves the
  // Today/overdue lists and the penalty applies), but it must not also count
  // as an automatic habit completion.
  private readonly _failedTaskIds = signal<ReadonlySet<string>>(new Set());

  readonly state = this._state.asReadonly();
  readonly habits = computed(() => this._state().habits);
  readonly tasks = this._tasks.asReadonly();
  readonly candidates = computed(() => {
    const seen = new Set<string>();
    return this._tasks()
      .filter((task) => !task.parentId && task.title?.trim())
      .filter((task) => {
        const key = task.repeatCfgId
          ? `repeat:${task.repeatCfgId}`
          : `title:${normalizeTitle(task.title)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  constructor() {
    void this._hydrateDomainState();
    this._taskService.allTasks$.pipe(takeUntilDestroyed()).subscribe((tasks) => {
      this._tasks.set(tasks);
      this._syncCompletedTasks(tasks);
    });
    this._taskRepeatCfgService.taskRepeatCfgs$
      .pipe(takeUntilDestroyed())
      .subscribe((repeatCfgs) => this._repeatCfgs.set(repeatCfgs));
  }

  habitsForCharacters(characterIds: readonly string[]): TaskHabit[] {
    if (!characterIds.length) return [];
    return this._state().habits.filter(
      (habit) =>
        !habit.characterIds?.length ||
        habit.characterIds.some((id) => characterIds.includes(id)),
    );
  }

  habitsForDate(date: string, characterIds?: readonly string[]): TaskHabit[] {
    const habits = characterIds
      ? this.habitsForCharacters(characterIds)
      : this._state().habits;
    return habits.filter((habit) => this.isActiveOn(habit, date));
  }

  isActiveOn(habit: TaskHabit, date: string): boolean {
    const activeFrom = habit.activeFrom || this._dateKey(new Date(habit.createdAt));
    return date >= activeFrom && this._matchesWeekday(habit, date);
  }

  // A habit linked to a WEEKLY repeat config only counts on the config's
  // checked weekdays - e.g. a "Trabalhar" habit set Mon-Fri no longer shows
  // up (or needs completing) on Sat/Sun, letting weekend editing stay
  // separate from the weekday list without duplicating anything. Habits with
  // no repeat config, or backed by a non-weekly cycle (daily/monthly/yearly),
  // are unaffected and always active, same as before.
  private _matchesWeekday(habit: TaskHabit, date: string): boolean {
    if (!habit.repeatCfgId) return true;
    const cfg = this._repeatCfgs().find(
      (candidate) => candidate.id === habit.repeatCfgId,
    );
    if (!cfg || cfg.repeatCycle !== 'WEEKLY') return true;
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    return cfg[TASK_REPEAT_WEEKDAY_MAP[weekday]] === true;
  }

  isLinked(task: Task, characterIds?: readonly string[]): boolean {
    return this._state().habits.some(
      (habit) =>
        (!characterIds?.length ||
          !habit.characterIds?.length ||
          habit.characterIds.some((id) => characterIds.includes(id))) &&
        this._matches(habit, task),
    );
  }

  addFromTask(task: Task, characterIds: string[] = []): void {
    const existing = this._state().habits.find((habit) =>
      task.repeatCfgId
        ? habit.repeatCfgId === task.repeatCfgId
        : !habit.repeatCfgId && habit.normalizedTitle === normalizeTitle(task.title),
    );
    if (existing) {
      this.assignCharacters(existing.id, characterIds);
      return;
    }
    const habit: TaskHabit = {
      id: crypto.randomUUID(),
      title: task.title,
      icon: 'check_circle',
      sourceTaskId: task.id,
      repeatCfgId: task.repeatCfgId,
      normalizedTitle: normalizeTitle(task.title),
      createdAt: Date.now(),
      activeFrom: this._dateKey(new Date()),
      links: [this._linkFromTask(task)],
      characterIds: [...new Set(characterIds)],
    };
    this._save({
      ...this._state(),
      habits: [...this._state().habits, habit],
    });
    this._syncCompletedTasks(this._tasks());
  }

  createManualHabit(title: string, characterIds: string[] = []): string | null {
    const cleaned = title.trim();
    if (!cleaned) return null;
    const habit: TaskHabit = {
      id: crypto.randomUUID(),
      title: cleaned,
      icon: 'link',
      sourceTaskId: '',
      normalizedTitle: normalizeTitle(cleaned),
      createdAt: Date.now(),
      activeFrom: this._dateKey(new Date()),
      links: [],
      characterIds: [...new Set(characterIds)],
    };
    this._save({ ...this._state(), habits: [...this._state().habits, habit] });
    return habit.id;
  }

  isTaskLinkedToHabit(habitId: string, task: Task): boolean {
    const habit = this._state().habits.find((item) => item.id === habitId);
    return (
      !!habit && this._habitLinks(habit).some((link) => this._linkMatches(link, task))
    );
  }

  toggleTaskForHabit(habitId: string, task: Task): void {
    const habit = this._state().habits.find((item) => item.id === habitId);
    if (!habit) return;
    const links = this._habitLinks(habit);
    const exists = links.some((link) => this._linkMatches(link, task));
    const nextLinks = exists
      ? links.filter((link) => !this._linkMatches(link, task))
      : [...links, this._linkFromTask(task)];
    this._save({
      ...this._state(),
      habits: this._state().habits.map((item) =>
        item.id === habitId ? { ...item, links: nextLinks } : item,
      ),
    });
    this._syncCompletedTasks(this._tasks());
  }

  assignCharacters(habitId: string, characterIds: readonly string[]): void {
    const ids = [...new Set(characterIds)];
    this._save({
      ...this._state(),
      habits: this._state().habits.map((habit) =>
        habit.id === habitId
          ? {
              ...habit,
              characterIds: [...new Set([...(habit.characterIds ?? []), ...ids])],
            }
          : habit,
      ),
    });
  }

  unassignCharacters(habitId: string, characterIds: readonly string[]): void {
    const blocked = new Set(characterIds);
    const habit = this._state().habits.find((candidate) => candidate.id === habitId);
    if (!habit) return;
    const remaining = (habit.characterIds ?? []).filter((id) => !blocked.has(id));
    if (!habit.characterIds?.length || !remaining.length) {
      this.remove(habitId);
      return;
    }
    this._save({
      ...this._state(),
      habits: this._state().habits.map((candidate) =>
        candidate.id === habitId ? { ...candidate, characterIds: remaining } : candidate,
      ),
    });
  }

  remove(habitId: string): void {
    const { [habitId]: _task, ...taskCompletions } = this._state().taskCompletions;
    const { [habitId]: _manual, ...manualCompletions } = this._state().manualCompletions;
    this._save({
      habits: this._state().habits.filter((habit) => habit.id !== habitId),
      taskCompletions,
      manualCompletions,
    });
  }

  rename(habitId: string, title: string): void {
    const cleaned = title.trim();
    if (!cleaned) return;
    this._save({
      ...this._state(),
      habits: this._state().habits.map((habit) =>
        habit.id === habitId ? { ...habit, title: cleaned } : habit,
      ),
    });
  }

  // Habits with no characterIds are shared by everyone, so they're included
  // in every character's backup too (there's nothing character-specific to
  // separate out for them).
  exportForCharacter(characterId: string): TaskHabitState {
    const state = this._state();
    const habits = state.habits.filter(
      (habit) => !habit.characterIds?.length || habit.characterIds.includes(characterId),
    );
    const habitIds = new Set(habits.map((habit) => habit.id));
    const taskCompletions = Object.fromEntries(
      Object.entries(state.taskCompletions).filter(([id]) => habitIds.has(id)),
    );
    const manualCompletions = Object.fromEntries(
      Object.entries(state.manualCompletions).filter(([id]) => habitIds.has(id)),
    );
    return { habits, taskCompletions, manualCompletions };
  }

  importForCharacter(data: TaskHabitState): void {
    const state = this._state();
    const habitsById = new Map(state.habits.map((habit) => [habit.id, habit]));
    for (const habit of data.habits) habitsById.set(habit.id, habit);
    this._save({
      habits: [...habitsById.values()],
      taskCompletions: { ...state.taskCompletions, ...data.taskCompletions },
      manualCompletions: { ...state.manualCompletions, ...data.manualCompletions },
    });
  }

  isComplete(habitId: string, date: string): boolean {
    const state = this._state();
    // Three-state: an explicit manual value (true or false) always wins - it
    // lets you override an automatic completion back to "not done" - only an
    // untouched (undefined) day falls through to the automatic task record.
    const manual = state.manualCompletions[habitId]?.[date];
    if (manual === true || manual === false) return manual;
    return (state.taskCompletions[habitId]?.[date]?.length ?? 0) > 0;
  }

  isAutomatic(habitId: string, date: string): boolean {
    return (this._state().taskCompletions[habitId]?.[date]?.length ?? 0) > 0;
  }

  toggleManual(habitId: string, date: string): void {
    const current = this._state().manualCompletions[habitId] ?? {};
    this._save({
      ...this._state(),
      manualCompletions: {
        ...this._state().manualCompletions,
        [habitId]: {
          ...current,
          [date]: !this.isComplete(habitId, date),
        },
      },
    });
  }

  completionRate(date: string, characterIds?: readonly string[]): number {
    const habits = this.habitsForDate(date, characterIds);
    if (!habits.length) return 0;
    const completed = habits.filter((habit) => this.isComplete(habit.id, date)).length;
    return Math.round((completed / habits.length) * 100);
  }

  setManualTime(habitId: string, time: string | null): void {
    this._save({
      ...this._state(),
      habits: this._state().habits.map((habit) =>
        habit.id === habitId ? { ...habit, manualTime: time ?? undefined } : habit,
      ),
    });
  }

  scheduledAt(habitId: string, date: string): number | null {
    const habit = this._state().habits.find((candidate) => candidate.id === habitId);
    if (!habit) return null;

    // A manual override always wins - this is the escape hatch for habits
    // whose underlying repeating task has no fixed startTime (so it gets
    // auto-packed into whatever free slot the schedule finds that day) or
    // otherwise resolves to the wrong time.
    if (habit.manualTime) {
      const manual = this._timestampFromClock(date, habit.manualTime);
      if (manual !== null) return manual;
    }

    // Use the exact resolved entries rendered by Agenda. This covers concrete
    // tasks as well as future repeat projections whose time is inherited by the
    // schedule mapper and is not persisted on the task instance yet.
    const contextDate = this._dateFromKey(date);
    contextDate.setHours(12, 0, 0, 0);
    const scheduleDay = this._scheduleService
      .createScheduleDaysWithContext({
        daysToShow: [date],
        contextNow: contextDate.getTime(),
        realNow: Date.now(),
        currentTaskId: this._taskService.currentTaskId() ?? null,
      })
      .find((day) => day.dayDate === date);
    const resolvedTimes = (scheduleDay?.entries ?? [])
      .filter((entry) => this._matchesScheduleEntry(habit, entry.data))
      .map((entry) => entry.start)
      .filter((timestamp) => Number.isFinite(timestamp))
      .sort((a, b) => a - b);
    if (resolvedTimes.length) return resolvedTimes[0];

    // Future recurring instances are projections and therefore do not exist in
    // TaskService yet. Their canonical clock time lives on TaskRepeatCfg.
    const repeatTimes = this._habitLinks(habit)
      .map((link) =>
        link.repeatCfgId
          ? this._repeatCfgs().find((cfg) => cfg.id === link.repeatCfgId)?.startTime
          : undefined,
      )
      .filter((time): time is string => !!time)
      .map((time) => this._timestampFromClock(date, time))
      .filter((timestamp): timestamp is number => timestamp !== null)
      .sort((a, b) => a - b);
    if (repeatTimes.length) return repeatTimes[0];

    const matchingScheduledTasks = this._tasks()
      .filter((task) => this._matches(habit, task) && !!task.dueWithTime)
      .map((task) => task.dueWithTime!)
      .sort((a, b) => a - b);
    const scheduledOnDate = matchingScheduledTasks.filter(
      (timestamp) => this._dateKey(new Date(timestamp)) === date,
    );
    if (scheduledOnDate.length) return scheduledOnDate[0];

    // Recurring instances are often only materialized for the current day.
    // For future days, inherit the latest explicit time from the preceding
    // schedule. A later explicit edit naturally becomes the next anchor.
    const targetStart = this._dateFromKey(date).getTime();
    const previous = matchingScheduledTasks.filter(
      (timestamp) => timestamp < targetStart,
    );
    const latestPrevious = previous.at(-1);
    if (!latestPrevious) return null;

    const source = new Date(latestPrevious);
    const inherited = this._dateFromKey(date);
    inherited.setHours(
      source.getHours(),
      source.getMinutes(),
      source.getSeconds(),
      source.getMilliseconds(),
    );
    return inherited.getTime();
  }

  scheduledTime(habitId: string, date: string): string | null {
    const timestamp = this.scheduledAt(habitId, date);
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Pushed in from RpgProfileService whenever its failedTaskIds change (see
   * class-level comment on _failedTaskIds for why this is a push rather than
   * an injected dependency). Re-runs the completion sync so a task that just
   * got marked failed is immediately dropped from today's automatic count.
   */
  setFailedTaskIds(ids: ReadonlySet<string>): void {
    this._failedTaskIds.set(ids);
    this._syncCompletedTasks(this._tasks());
  }

  private _syncCompletedTasks(tasks: Task[]): void {
    const state = this._state();
    const failedTaskIds = this._failedTaskIds();
    const next: TaskHabitState['taskCompletions'] = structuredClone(
      state.taskCompletions,
    );
    let changed = false;

    for (const habit of state.habits) {
      next[habit.id] ??= {};
      const matchingTasks = tasks.filter((task) => this._matches(habit, task));
      const visibleIds = new Set(matchingTasks.map((task) => task.id));

      for (const [date, ids] of Object.entries(next[habit.id])) {
        const filtered = ids.filter((id) => {
          const task = matchingTasks.find((item) => item.id === id);
          return !visibleIds.has(id) || (task?.isDone && !failedTaskIds.has(id));
        });
        if (filtered.length !== ids.length) {
          next[habit.id][date] = filtered;
          changed = true;
        }
      }

      for (const task of matchingTasks.filter(
        (item) => item.isDone && !failedTaskIds.has(item.id),
      )) {
        const date = this._completionDate(task);
        const ids = next[habit.id][date] ?? [];
        if (!ids.includes(task.id)) {
          next[habit.id][date] = [...ids, task.id];
          changed = true;
        }
      }
    }

    if (changed) {
      this._save({ ...state, taskCompletions: next });
    }
  }

  private _matches(habit: TaskHabit, task: Task): boolean {
    return this._habitLinks(habit).some((link) => this._linkMatches(link, task));
  }

  private _habitLinks(habit: TaskHabit): TaskHabitLink[] {
    if (habit.links) return habit.links;
    return [
      {
        sourceTaskId: habit.sourceTaskId,
        repeatCfgId: habit.repeatCfgId,
        normalizedTitle: habit.normalizedTitle,
      },
    ];
  }

  private _linkFromTask(task: Task): TaskHabitLink {
    return {
      sourceTaskId: task.id,
      repeatCfgId: task.repeatCfgId,
      normalizedTitle: normalizeTitle(task.title),
    };
  }

  private _linkMatches(link: TaskHabitLink, task: Task): boolean {
    return link.repeatCfgId
      ? task.repeatCfgId === link.repeatCfgId
      : normalizeTitle(task.title) === link.normalizedTitle;
  }

  private _matchesScheduleEntry(habit: TaskHabit, data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const candidate = data as {
      id?: string;
      repeatCfgId?: string;
      title?: string | null;
    };
    return this._habitLinks(habit).some((link) => {
      if (
        link.repeatCfgId &&
        (candidate.id === link.repeatCfgId || candidate.repeatCfgId === link.repeatCfgId)
      ) {
        return true;
      }
      if (link.sourceTaskId && candidate.id === link.sourceTaskId) return true;
      return (
        !!candidate.title && normalizeTitle(candidate.title) === link.normalizedTitle
      );
    });
  }

  private _completionDate(task: Task): string {
    // The day a habit counts for is the day it was SCHEDULED for, not the
    // literal moment it got clicked done - completing a nightly task at
    // 00:30 (technically the next calendar day per doneOn) must still
    // credit the day it was due, or the habit tracker silently attributes
    // it to the wrong day (and the wrong day then reads as "not done").
    if (task.dueDay) return task.dueDay;
    if (task.dueWithTime) {
      const date = new Date(task.dueWithTime);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    if (task.doneOn) {
      const date = new Date(task.doneOn);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private _dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private _dateFromKey(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private _timestampFromClock(date: string, clock: string): number | null {
    const match = clock.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const result = this._dateFromKey(date);
    result.setHours(hours, minutes, 0, 0);
    return result.getTime();
  }

  private _load(): TaskHabitState {
    try {
      const raw = localStorage.getItem(LS.TASK_HABITS);
      return raw ? { ...EMPTY_STATE, ...JSON.parse(raw) } : EMPTY_STATE;
    } catch {
      return EMPTY_STATE;
    }
  }

  private _save(state: TaskHabitState): void {
    this._state.set(state);
    void this._domainState.put('habit-tracker:state', state);
  }

  private async _hydrateDomainState(): Promise<void> {
    if (localStorage.getItem(LS.TASK_HABITS)) {
      await this._domainState.put('habit-tracker:state', this._state());
      localStorage.removeItem(LS.TASK_HABITS);
      return;
    }
    const stored = await this._domainState.get<TaskHabitState>('habit-tracker:state');
    if (stored) {
      this._state.set({ ...EMPTY_STATE, ...stored });
      this._syncCompletedTasks(this._tasks());
    }
  }
}
