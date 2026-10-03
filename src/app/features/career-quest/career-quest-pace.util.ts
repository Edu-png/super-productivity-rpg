import { Task } from '../tasks/task.model';
import { StudySession } from '../academy-arcana/domain/academy.models';
import { CareerPaceTargets, CareerQuestState } from './career-quest.model';

export const DEFAULT_PACE_TARGETS: CareerPaceTargets = {
  dailyStudyMinutes: 90,
  weeklyStudyMinutes: 600,
  weeklyQuests: 4,
  weeklyEvidence: 3,
  countAcademy: true,
  studyProjectIds: [],
};

export interface CareerPace {
  todayMinutes: number;
  weekMinutes: number;
  weekQuests: number;
  weekEvidence: number;
  /** Consecutive days (ending today, or yesterday if today isn't met yet) at or above the daily target. */
  streak: number;
  /** Oldest first, today last. */
  lastDays: { day: string; label: string; minutes: number }[];
}

const dayKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Study minutes per day: Academia sessions + tracked time on tasks of the chosen projects. */
export const studyMinutesByDay = (input: {
  sessions: StudySession[];
  tasks: Task[];
  targets: CareerPaceTargets;
  characterId: string;
  taskOwnerIds: Record<string, string>;
}): Map<string, number> => {
  const minutes = new Map<string, number>();
  const add = (day: string, value: number): void => {
    minutes.set(day, (minutes.get(day) ?? 0) + value);
  };
  if (input.targets.countAcademy) {
    for (const session of input.sessions) {
      if (session.status !== 'completed') continue;
      add(
        dayKey(new Date(session.startedAt)),
        session.actualMinutes || session.plannedMinutes,
      );
    }
  }
  const projects = new Set(input.targets.studyProjectIds);
  if (projects.size) {
    for (const task of input.tasks) {
      // A parent's timeSpentOnDay already includes its subtasks' time.
      if (task.parentId || !task.projectId || !projects.has(task.projectId)) continue;
      const owner = input.taskOwnerIds[task.id];
      if (owner && owner !== input.characterId) continue;
      for (const [day, ms] of Object.entries(task.timeSpentOnDay ?? {})) {
        add(day, ms / 60_000);
      }
    }
  }
  return minutes;
};

export const buildCareerPace = (input: {
  minutesByDay: Map<string, number>;
  state: CareerQuestState;
  targets: CareerPaceTargets;
  now: number;
  weekStartMs: number;
}): CareerPace => {
  const today = new Date(input.now);
  const minutesOn = (date: Date): number =>
    Math.round(input.minutesByDay.get(dayKey(date)) ?? 0);

  let weekMinutes = 0;
  for (
    const cursor = new Date(input.weekStartMs);
    cursor.getTime() <= input.now;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    weekMinutes += minutesOn(cursor);
  }

  const lastDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      day: dayKey(date),
      label: WEEKDAYS[date.getDay()],
      minutes: minutesOn(date),
    };
  });

  const target = input.targets.dailyStudyMinutes;
  let streak = 0;
  if (target > 0) {
    const cursor = new Date(today);
    // Today only breaks the streak once it's over - not met yet ≠ failed.
    if (minutesOn(cursor) < target) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 366 && minutesOn(cursor) >= target; i++) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return {
    todayMinutes: minutesOn(today),
    weekMinutes,
    weekQuests: input.state.quests.filter(
      (quest) => quest.status === 'done' && (quest.completedAt ?? 0) >= input.weekStartMs,
    ).length,
    weekEvidence: input.state.evidence.filter((item) => item.at >= input.weekStartMs)
      .length,
    streak,
    lastDays,
  };
};
