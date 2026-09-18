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

export const RPG_MONTHLY_MEDAL_HISTORY: RpgMonthlyMedalHistoryEntry[] = [
  {
    month: 1,
    description: 'Acordar no horário ao menos 20 dias de janeiro.',
    metricType: 'days',
    target: 20,
    progress: 22,
  },
  {
    month: 2,
    description: 'Estudar conversação por ao menos 15 dias no mês.',
    metricType: 'days',
    target: 15,
    progress: 16,
  },
  {
    month: 3,
    description: 'Descansar por pelo menos 15 dias no mês.',
    metricType: 'days',
    target: 15,
    progress: 17,
  },
  {
    month: 4,
    description: 'Trabalhar focado ao menos 20 dias por pelo menos 1 hora.',
    metricType: 'days',
    target: 20,
    progress: 12,
  },
  {
    month: 5,
    description: 'Estudar ao menos 15 dias no mês.',
    metricType: 'days',
    target: 15,
    progress: 17,
  },
  {
    month: 6,
    description: 'Ler ao menos 1 hora por dia durante 20 dias.',
    metricType: 'days',
    target: 20,
    progress: 20,
  },
  {
    month: 7,
    description: 'Ir à academia ao menos 20 dias no mês.',
    metricType: 'days',
    target: 20,
    progress: 20,
  },
  // Months 8-11 have no real external (Notion) history - the app's own
  // Habit Tracker was already in use by then, so those medals are
  // live-computed from actual habit completions (see monthlyMedals() in
  // rpg-profile.service.ts) instead of being hardcoded here. Keeping them in
  // this array with progress:0 previously made them permanently stuck at 0%
  // forever, since a month present in this history list always overrides the
  // live computation regardless of what habits get configured for it.
  {
    month: 12,
    description: 'Investir R$ 4.000 durante o mês.',
    metricType: 'currency',
    target: 4000,
    progress: 0,
  },
];

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

export const RPG_MONTHLY_MEDAL_COMPLETION_DATES: Record<number, number> = {
  1: endOfMonthSaoPaulo(2026, 1, 31),
  2: endOfMonthSaoPaulo(2026, 2, 28),
  3: endOfMonthSaoPaulo(2026, 3, 31),
  5: endOfMonthSaoPaulo(2026, 5, 31),
  6: endOfMonthSaoPaulo(2026, 6, 30),
  7: endOfMonthSaoPaulo(2026, 7, 31),
};

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
