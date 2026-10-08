import { RpgMissionAuto } from './rpg-profile.model';
import { Task } from '../tasks/task.model';
import type { WorkDayStats } from '../work-agenda/work-agenda.util';

/** How much of a day was done. total 0 = nothing to judge that day (skipped, never breaks a streak). */
export interface DayScore {
  done: number;
  total: number;
}

const toDate = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const toDay = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const periodKey = (day: string, period: RpgMissionAuto['period']): string => {
  if (period === 'day') return day;
  if (period === 'month') return day.slice(0, 7);
  // Weeks start on Monday.
  const date = toDate(day);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toDay(date);
};

/**
 * Qualifying periods (day/week/month) from `auto.since` to `today`, in order,
 * as runs of consecutive successes. A period with nothing to judge is skipped;
 * one that missed the threshold ends the run. The current week/month is still
 * open, so it is ignored; today is only counted once it qualifies.
 */
export const missionRuns = (
  auto: RpgMissionAuto,
  today: string,
  scoreFor: (day: string) => DayScore,
): number[] => {
  const periods = new Map<string, DayScore>();
  for (const cursor = toDate(auto.since); toDay(cursor) <= today; ) {
    const day = toDay(cursor);
    const key = periodKey(day, auto.period);
    const score = scoreFor(day);
    const sum = periods.get(key) ?? { done: 0, total: 0 };
    periods.set(key, { done: sum.done + score.done, total: sum.total + score.total });
    cursor.setDate(cursor.getDate() + 1);
  }
  const currentKey = periodKey(today, auto.period);
  const runs: number[] = [0];
  for (const [key, score] of periods) {
    if (!score.total) continue;
    const qualifies =
      auto.threshold > 0
        ? score.done / score.total >= auto.threshold - 1e-9
        : score.done > 0;
    if (key === currentKey && (auto.period !== 'day' || !qualifies)) continue;
    if (qualifies) runs[runs.length - 1]++;
    else if (runs[runs.length - 1]) runs.push(0);
  }
  return runs;
};

/** Current streak (last run) or total qualifying periods. */
export const missionAutoValue = (auto: RpgMissionAuto, runs: number[]): number =>
  auto.count === 'streak' ? runs[runs.length - 1] : runs.reduce((a, b) => a + b, 0);

/** Times a repeatable mission was earned: once per `every` periods (in a row, for streaks). */
export const missionAutoRepeats = (
  auto: RpgMissionAuto,
  runs: number[],
  every: number,
): number => {
  const step = Math.max(1, every);
  return auto.count === 'streak'
    ? runs.reduce((sum, run) => sum + Math.floor(run / step), 0)
    : Math.floor(missionAutoValue(auto, runs) / step);
};

/** Hours tracked since `since` on top-level tasks in scope ('all' | 'project:<id>' | 'tag:<id>'). */
export const trackedHoursSince = (
  tasks: Task[],
  scope: string | undefined,
  since: string,
): number => {
  const [kind, id] = (scope ?? 'all').split(':');
  let ms = 0;
  for (const task of tasks) {
    if (task.parentId) continue;
    if (kind === 'project' && task.projectId !== id) continue;
    if (kind === 'tag' && !task.tagIds.includes(id)) continue;
    for (const [day, spent] of Object.entries(task.timeSpentOnDay ?? {})) {
      if (day >= since) ms += spent;
    }
  }
  return ms / 3_600_000;
};

/** Day score for the "work" source, from the Agenda de Trabalho stats of that day. */
export const workDayScore = (
  metric: RpgMissionAuto['workMetric'],
  stats: WorkDayStats | undefined,
  day: string,
): DayScore => {
  const weekday = toDate(day).getDay();
  if (metric === 'reviewCleared') {
    return stats?.reviewCleared ? { done: 1, total: 1 } : { done: 0, total: 0 };
  }
  if (metric === 'urgentWeek') {
    // Urgent cards closed during the week; whatever is still open on Sunday counts against it.
    const done = stats?.urgentDone ?? 0;
    const open = weekday === 0 ? (stats?.urgentOpen ?? 0) : 0;
    return { done, total: done + open };
  }
  if (stats?.goalMet) return { done: 1, total: 1 };
  // A weekend without work neither counts nor breaks the streak.
  return weekday === 0 || weekday === 6 ? { done: 0, total: 0 } : { done: 0, total: 1 };
};
