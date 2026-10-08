import { TopicReviewState } from './academy.models';

/**
 * XP lost per overdue topic review: 3 XP on the first late day, +1 per extra
 * day, capped at 10 XP per day. Only days from REVIEW_DELAY_START_DAY on are
 * charged, and that first charged day counts as late day 1.
 */
export const REVIEW_DELAY_XP = { first: 3, step: 1, maxPerDay: 10 };
export const REVIEW_DELAY_START_DAY = '2026-10-06';

/** Open late streak of one topic, persisted on the character. */
export interface ReviewDelayStreak {
  /** Day before late day 1 - escalation counts from here. */
  since: string;
  /** Last day already charged. */
  last: string;
  /** lastReviewedAt when the streak began; a real review changes it and ends the streak. */
  reviewedAt: number | null;
}

export interface ReviewDelayCharge {
  nodeId: string;
  days: number;
  xp: number;
}

const DAY_MS = 86_400_000;

const toUtc = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
};

const addDays = (day: string, days: number): string => {
  const offset = days * DAY_MS;
  return new Date(toUtc(day) + offset).toISOString().slice(0, 10);
};

const diffDays = (from: string, to: string): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

const maxDay = (a: string, b: string): string => (a > b ? a : b);

export const reviewDelayXpForLateDay = (lateDay: number): number => {
  const growth = (lateDay - 1) * REVIEW_DELAY_XP.step;
  const xp = REVIEW_DELAY_XP.first + growth;
  return Math.min(REVIEW_DELAY_XP.maxPerDay, xp);
};

/**
 * XP a topic already lost in its open late streak and what tomorrow would
 * cost if it stays unreviewed. Without a streak (due today, or not charged
 * yet) nothing was lost and tomorrow would be late day 1.
 */
export const reviewDelayStatus = (
  streak: ReviewDelayStreak | undefined,
  today: string,
): { lost: number; tomorrow: number } => {
  if (!streak) return { lost: 0, tomorrow: reviewDelayXpForLateDay(1) };
  let lost = 0;
  for (let lateDay = 1; lateDay <= diffDays(streak.since, streak.last); lateDay++) {
    lost += reviewDelayXpForLateDay(lateDay);
  }
  return { lost, tomorrow: reviewDelayXpForLateDay(diffDays(streak.since, today) + 1) };
};

/**
 * Charges every not-yet-charged late day up to `today` (inclusive). "Pular"
 * moves dueAt forward without reviewing, so an open streak keeps charging
 * until lastReviewedAt changes - postponing never dodges the penalty.
 */
export const reviewDelayCharges = (
  reviews: Pick<TopicReviewState, 'nodeId' | 'dueAt' | 'lastReviewedAt'>[],
  streaks: Record<string, ReviewDelayStreak>,
  today: string,
  dayOf: (ms: number) => string,
): { streaks: Record<string, ReviewDelayStreak>; charges: ReviewDelayCharge[] } => {
  const nextStreaks: Record<string, ReviewDelayStreak> = {};
  const charges: ReviewDelayCharge[] = [];
  for (const review of reviews) {
    const open = streaks[review.nodeId];
    let streak: ReviewDelayStreak | null = null;
    let from = '';
    if (open && open.reviewedAt === review.lastReviewedAt) {
      streak = open;
      from = addDays(open.last, 1);
    } else {
      const dueDay = dayOf(review.dueAt);
      if (dueDay >= today) continue;
      const since = maxDay(dueDay, addDays(REVIEW_DELAY_START_DAY, -1));
      streak = { since, last: since, reviewedAt: review.lastReviewedAt };
      from = addDays(since, 1);
    }
    let xp = 0;
    let days = 0;
    for (let day = from; day <= today; day = addDays(day, 1)) {
      xp += reviewDelayXpForLateDay(diffDays(streak.since, day));
      days++;
    }
    nextStreaks[review.nodeId] = { ...streak, last: maxDay(streak.last, today) };
    if (days) charges.push({ nodeId: review.nodeId, days, xp });
  }
  return { streaks: nextStreaks, charges };
};
