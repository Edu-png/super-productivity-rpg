export interface TaskHabitLink {
  sourceTaskId?: string;
  repeatCfgId?: string;
  normalizedTitle: string;
}

export interface TaskHabit {
  id: string;
  title: string;
  icon: string;
  sourceTaskId: string;
  repeatCfgId?: string;
  normalizedTitle: string;
  createdAt: number;
  activeFrom?: string;
  links?: TaskHabitLink[];
  characterIds?: string[];
  // Manual override for the habit's time-of-day, in "HH:MM". Takes precedence
  // over whatever the schedule mapper resolves - useful when the underlying
  // repeating task has no fixed startTime (it becomes a flexible/auto-packed
  // block that can land anywhere in the day) or resolves to the wrong slot.
  manualTime?: string;
}

export interface TaskHabitState {
  habits: TaskHabit[];
  taskCompletions: Record<string, Record<string, string[]>>;
  manualCompletions: Record<string, Record<string, boolean>>;
}
