import { Task } from '../tasks/task.model';
import { RpgContract, RpgMedalTier, RpgPenalty } from './rpg-profile.model';

const HOUR_MS = 60 * 60 * 1000;

/** Local Monday 00:00 of the week containing `now`. */
export const startOfWeekMs = (now: number): number => {
  const date = new Date(now);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
};

/** How many times a penalty was already applied in the current week. */
export const penaltyWeekCount = (penalty: RpgPenalty, now: number): number => {
  const weekStart = startOfWeekMs(now);
  return (penalty.weekAppliedAt ?? []).filter((at) => at >= weekStart).length;
};

/**
 * Current progress of a contract: tracked hours inside its window (and scope)
 * or the manual counter. Only top-level tasks are summed - a parent's
 * timeSpentOnDay already includes its subtasks' time.
 */
export const contractProgress = (contract: RpgContract, tasks: Task[]): number => {
  if (contract.metric === 'manual') {
    return contract.manualProgress;
  }
  let ms = 0;
  for (const task of tasks) {
    if (task.parentId) continue;
    if (contract.scopeKind === 'project' && task.projectId !== contract.scopeId) continue;
    if (contract.scopeKind === 'tag' && !task.tagIds.includes(contract.scopeId ?? '')) {
      continue;
    }
    for (const [day, spent] of Object.entries(task.timeSpentOnDay ?? {})) {
      if (day >= contract.startDay && day <= contract.deadlineDay) {
        ms += spent;
      }
    }
  }
  return ms / HOUR_MS;
};

/** 100% of the target = bronze, 120% = silver, 150% = gold. */
export const medalTierFor = (ratio: number): RpgMedalTier | null => {
  if (ratio >= 1.5) return 'gold';
  if (ratio >= 1.2) return 'silver';
  if (ratio >= 1) return 'bronze';
  return null;
};

/** Extra base-rewards granted on top of the regular (bronze) medal reward. */
export const MEDAL_TIER_EXTRA: Record<RpgMedalTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
};

export const MEDAL_TIER_THRESHOLD: Record<RpgMedalTier, number> = {
  bronze: 1,
  silver: 1.2,
  gold: 1.5,
};
