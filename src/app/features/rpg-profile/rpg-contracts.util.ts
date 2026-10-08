import { Task } from '../tasks/task.model';
import {
  RpgContract,
  RpgMedalTier,
  RpgPenalty,
  RpgPenaltyLogEntry,
} from './rpg-profile.model';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Local Monday 00:00 of the week containing `now`. */
export const startOfWeekMs = (now: number): number => {
  const date = new Date(now);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
};

/** Recidivism escalation of a penalty - see penaltyMultiplier. */
export const PENALTY_ESCALATION = {
  base: 1.3,
  windowDays: 30,
  maxMultiplier: 5,
};

/**
 * How much heavier the next application is, from the previous ones in the
 * last 30 days. Each one compounds ×1.3; one from the last 3 days counts
 * 1.5 steps and one from the last 24h counts 2, so repeating often and close
 * together escalates much faster than an isolated slip. Capped at ×5.
 */
export const penaltyMultiplier = (
  penalty: RpgPenalty,
  log: RpgPenaltyLogEntry[],
  now: number,
): number => {
  let steps = 0;
  for (const entry of log) {
    if (entry.penaltyId !== penalty.id) continue;
    const ageDays = (now - entry.at) / DAY_MS;
    if (ageDays < 0 || ageDays > PENALTY_ESCALATION.windowDays) continue;
    steps += 1 + proximityBonus(ageDays);
  }
  const raw = PENALTY_ESCALATION.base ** steps;
  const multiplier = Math.round(raw * 100) / 100;
  return Math.min(PENALTY_ESCALATION.maxMultiplier, multiplier);
};

const proximityBonus = (ageDays: number): number => {
  if (ageDays <= 1) return 1;
  if (ageDays <= 3) return 0.5;
  return 0;
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
