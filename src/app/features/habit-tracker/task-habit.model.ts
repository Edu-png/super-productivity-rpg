export interface TaskHabit {
  id: string;
  title: string;
  icon: string;
  sourceTaskId: string;
  repeatCfgId?: string;
  normalizedTitle: string;
  createdAt: number;
  characterIds?: string[];
}

export interface TaskHabitState {
  habits: TaskHabit[];
  taskCompletions: Record<string, Record<string, string[]>>;
  manualCompletions: Record<string, Record<string, boolean>>;
}
