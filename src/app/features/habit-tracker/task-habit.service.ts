import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LS } from '../../core/persistence/storage-keys.const';
import { Task } from '../tasks/task.model';
import { TaskService } from '../tasks/task.service';
import { TaskHabit, TaskHabitState } from './task-habit.model';
import { DomainStateStore } from '../../core/persistence/domain-state-store.service';

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
  private readonly _domainState = inject(DomainStateStore);
  private readonly _state = signal<TaskHabitState>(this._load());
  private readonly _tasks = signal<Task[]>([]);

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
    this._taskService.allTasks$
      .pipe(takeUntilDestroyed())
      .subscribe((tasks) => {
        this._tasks.set(tasks);
        this._syncCompletedTasks(tasks);
      });
  }

  habitsForCharacters(characterIds: readonly string[]): TaskHabit[] {
    if (!characterIds.length) return [];
    return this._state().habits.filter(
      (habit) =>
        !habit.characterIds?.length ||
        habit.characterIds.some((id) => characterIds.includes(id)),
    );
  }

  isLinked(task: Task, characterIds?: readonly string[]): boolean {
    return this._state().habits.some(
      (habit) =>
        (!characterIds?.length ||
          !habit.characterIds?.length ||
          habit.characterIds.some((id) => characterIds.includes(id))) &&
        (task.repeatCfgId
          ? habit.repeatCfgId === task.repeatCfgId
          : !habit.repeatCfgId &&
            habit.normalizedTitle === normalizeTitle(task.title)),
    );
  }

  addFromTask(task: Task, characterIds: string[] = []): void {
    const existing = this._state().habits.find((habit) =>
      task.repeatCfgId
        ? habit.repeatCfgId === task.repeatCfgId
        : !habit.repeatCfgId &&
          habit.normalizedTitle === normalizeTitle(task.title),
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
      characterIds: [...new Set(characterIds)],
    };
    this._save({
      ...this._state(),
      habits: [...this._state().habits, habit],
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
              characterIds: [
                ...new Set([...(habit.characterIds ?? []), ...ids]),
              ],
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
        candidate.id === habitId
          ? { ...candidate, characterIds: remaining }
          : candidate,
      ),
    });
  }

  remove(habitId: string): void {
    const { [habitId]: _task, ...taskCompletions } =
      this._state().taskCompletions;
    const { [habitId]: _manual, ...manualCompletions } =
      this._state().manualCompletions;
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

  isComplete(habitId: string, date: string): boolean {
    const state = this._state();
    return (
      state.manualCompletions[habitId]?.[date] === true ||
      (state.taskCompletions[habitId]?.[date]?.length ?? 0) > 0
    );
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
    const habits = characterIds
      ? this.habitsForCharacters(characterIds)
      : this._state().habits;
    if (!habits.length) return 0;
    const completed = habits.filter((habit) => this.isComplete(habit.id, date)).length;
    return Math.round((completed / habits.length) * 100);
  }

  scheduledAt(habitId: string, date: string): number | null {
    const habit = this._state().habits.find((candidate) => candidate.id === habitId);
    if (!habit) return null;
    const scheduled = this._tasks()
      .filter((task) => this._matches(habit, task) && !!task.dueWithTime)
      .filter((task) => this._dateKey(new Date(task.dueWithTime!)) === date)
      .map((task) => task.dueWithTime!)
      .sort((a, b) => a - b);
    return scheduled[0] ?? null;
  }

  scheduledTime(habitId: string, date: string): string | null {
    const timestamp = this.scheduledAt(habitId, date);
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private _syncCompletedTasks(tasks: Task[]): void {
    const state = this._state();
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
          return !visibleIds.has(id) || task?.isDone;
        });
        if (filtered.length !== ids.length) {
          next[habit.id][date] = filtered;
          changed = true;
        }
      }

      for (const task of matchingTasks.filter((item) => item.isDone)) {
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
    if (habit.repeatCfgId) {
      return task.repeatCfgId === habit.repeatCfgId;
    }
    return normalizeTitle(task.title) === habit.normalizedTitle;
  }

  private _completionDate(task: Task): string {
    if (task.doneOn) {
      const date = new Date(task.doneOn);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    if (task.dueDay) return task.dueDay;
    if (task.dueWithTime) {
      const date = new Date(task.dueWithTime);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private _dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
    const stored = await this._domainState.get<TaskHabitState>(
      'habit-tracker:state',
    );
    if (stored) {
      this._state.set({ ...EMPTY_STATE, ...stored });
      this._syncCompletedTasks(this._tasks());
    }
  }
}
