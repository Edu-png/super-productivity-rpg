// Historical monthly-medal outcomes imported from the owner's previous
// (external, Notion) habit tracking, predating this app's own habit-tracker
// feature. These are authoritative final results for 2026, not live-computed
// from in-app habit completions - the numbers simply don't exist as real
// habit-tracker data for months before the feature existed.
export interface RpgMonthlyMedalHistoryEntry {
  month: number; // 1-12
  description: string;
  metricType: 'days' | 'currency';
  target: number;
  progress: number;
}

export const RPG_MONTHLY_MEDAL_HISTORY_YEAR = 2026;

// Personal history is never committed: the repository ships this empty and the
// owner keeps the real entries only in their local copy of this file.
export const RPG_MONTHLY_MEDAL_HISTORY: RpgMonthlyMedalHistoryEntry[] = [];

export function monthlyMedalHistoryFor(
  year: number,
  monthIndex: number,
): RpgMonthlyMedalHistoryEntry | undefined {
  if (year !== RPG_MONTHLY_MEDAL_HISTORY_YEAR) return undefined;
  return RPG_MONTHLY_MEDAL_HISTORY.find((entry) => entry.month === monthIndex + 1);
}

export function isMonthlyMedalHistoryCompleted(
  entry: RpgMonthlyMedalHistoryEntry,
): boolean {
  return entry.progress >= entry.target;
}

export function monthlyMedalHistoryPercentage(
  entry: RpgMonthlyMedalHistoryEntry,
): number {
  return Math.min(100, Math.round((entry.progress / entry.target) * 100));
}

// Deterministic completion timestamps (America/Sao_Paulo, UTC-3 year-round
// since Brazil dropped DST in 2019) - last instant of the month, except July
// which completed today and must not use a later date.
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
function endOfMonthSaoPaulo(year: number, month1based: number, day: number): number {
  return Date.UTC(year, month1based - 1, day, 23, 59, 59) + SAO_PAULO_OFFSET_MS;
}

export const RPG_MONTHLY_MEDAL_COMPLETION_DATES: Record<number, number> = {};

export interface RpgTrophyClaimLike {
  claimedAt: number;
  xp: number;
  gold: number;
}

export const RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY = 'monthly-history-2026-bonus-applied';
const MONTHLY_HISTORY_REWARD = { xp: 50, gold: 50 };

// Pure, side-effect-free core of the one-time historical import: given the
// current trophyClaims record and bonus totals, returns what they should be.
// Idempotent by construction - calling it twice (or a hundred times) with its
// own prior output as input always returns the same result unchanged, so it's
// safe to run on every reactive cycle without special "only once" guarding.
export function applyMonthlyMedalHistorySeed(
  claims: Record<string, RpgTrophyClaimLike>,
  questBonusXp: number,
  questBonusCoins: number,
): {
  claims: Record<string, RpgTrophyClaimLike>;
  questBonusXp: number;
  questBonusCoins: number;
  changed: boolean;
} {
  const nextClaims = { ...claims };
  let changed = false;

  for (const [monthStr, claimedAt] of Object.entries(
    RPG_MONTHLY_MEDAL_COMPLETION_DATES,
  )) {
    const key = `monthly:${RPG_MONTHLY_MEDAL_HISTORY_YEAR}-${monthStr}`;
    const existing = nextClaims[key];
    if (
      !existing ||
      existing.claimedAt !== claimedAt ||
      existing.xp !== MONTHLY_HISTORY_REWARD.xp ||
      existing.gold !== MONTHLY_HISTORY_REWARD.gold
    ) {
      nextClaims[key] = { claimedAt, ...MONTHLY_HISTORY_REWARD };
      changed = true;
    }
  }

  let nextXp = questBonusXp;
  let nextGold = questBonusCoins;
  if (!nextClaims[RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY]) {
    const monthsImported = Object.keys(RPG_MONTHLY_MEDAL_COMPLETION_DATES).length;
    const bonusXp = monthsImported * MONTHLY_HISTORY_REWARD.xp;
    const bonusGold = monthsImported * MONTHLY_HISTORY_REWARD.gold;
    nextClaims[RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY] = {
      claimedAt: Date.now(),
      xp: bonusXp,
      gold: bonusGold,
    };
    nextXp += bonusXp;
    nextGold += bonusGold;
    changed = true;
  }

  return { claims: nextClaims, questBonusXp: nextXp, questBonusCoins: nextGold, changed };
}
