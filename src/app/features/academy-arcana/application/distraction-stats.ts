import { StudySession } from '../domain/academy.models';

export const DEFAULT_DISTRACTION_CATEGORIES = [
  'Celular',
  'Redes sociais',
  'Pensamentos',
  'Pessoas/barulho',
  'Fome/cansaço',
  'Outro',
];

export interface DistractionBlock {
  id: string;
  title: string;
  startedAt: number;
  minutes: number;
  count: number;
  perHour: number;
}

export interface DistractionStats {
  blocks: DistractionBlock[];
  /** Mean distractions per block over the blocks shown. */
  average: number;
  /** Distractions per studied hour over the blocks shown. */
  averagePerHour: number;
  categories: { category: string; count: number }[];
  total: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Only blocks that were tracked count: sessions created after distraction
 * tracking existed carry a `distractions` array (possibly empty); older ones
 * don't, and including them as zeros would drag the average down.
 */
const isTracked = (session: StudySession): boolean =>
  Array.isArray(session.distractions) &&
  (session.status === 'completed' || session.status === 'active');

const blockMinutes = (session: StudySession, now: number): number =>
  session.status === 'active'
    ? Math.max(1, Math.round((now - session.startedAt) / 60_000))
    : Math.max(1, session.actualMinutes || session.plannedMinutes);

const localDayKey = (at: number): string => {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const buildDistractionStats = (
  sessions: StudySession[],
  now: number,
  limit = 20,
): DistractionStats => {
  const tracked = sessions
    .filter(isTracked)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-limit);

  const categoryCounts = new Map<string, number>();
  let totalMinutes = 0;
  const blocks = tracked.map((session) => {
    const minutes = blockMinutes(session, now);
    const distractions = session.distractions ?? [];
    for (const distraction of distractions) {
      categoryCounts.set(
        distraction.category,
        (categoryCounts.get(distraction.category) ?? 0) + 1,
      );
    }
    totalMinutes += minutes;
    return {
      id: session.id,
      title: session.title,
      startedAt: session.startedAt,
      minutes,
      count: distractions.length,
      perHour: round1((distractions.length / minutes) * 60),
    };
  });

  const total = blocks.reduce((sum, block) => sum + block.count, 0);
  return {
    blocks,
    average: blocks.length ? round1(total / blocks.length) : 0,
    averagePerHour: totalMinutes ? round1((total / totalMinutes) * 60) : 0,
    categories: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    total,
  };
};

export interface DistractionDay {
  day: string;
  count: number;
  minutes: number;
  perHour: number;
  blocks: number;
  /** Distractions that day per category. */
  categories: Record<string, number>;
  /** Trailing average over this and up to 6 previous tracked days - the "progress" line. */
  movingAverage: number;
}

export interface DailyDistractionStats {
  days: DistractionDay[];
  /** Mean distractions per tracked day. */
  average: number;
  /** Last 7 tracked days vs. the 7 before them, in %; negative = fewer distractions. */
  trendPercent: number | null;
}

export interface DistractionImpact {
  category: string;
  daysWith: number;
  daysWithout: number;
  /** Mean study minutes on days this category showed up / didn't. */
  minutesWith: number;
  minutesWithout: number;
  /** minutesWith - minutesWithout; negative = days with it were weaker. */
  deltaMinutes: number;
  deltaPercent: number;
}

/**
 * How each distraction category relates to how much you studied that day:
 * mean study minutes on tracked days where it appeared vs. tracked days where
 * it didn't. Needs 2+ days on each side; weakest days first. Correlation only -
 * it doesn't prove the distraction caused the shorter day.
 */
export const buildDistractionImpact = (
  sessions: StudySession[],
  now: number,
): DistractionImpact[] => {
  const days = new Map<
    string,
    { minutes: number; tracked: boolean; cats: Set<string> }
  >();
  for (const session of sessions) {
    if (session.status !== 'completed' && session.status !== 'active') continue;
    const key = localDayKey(session.startedAt);
    const day = days.get(key) ?? { minutes: 0, tracked: false, cats: new Set<string>() };
    day.minutes += blockMinutes(session, now);
    if (isTracked(session)) day.tracked = true;
    for (const distraction of session.distractions ?? [])
      day.cats.add(distraction.category);
    days.set(key, day);
  }
  const tracked = [...days.values()].filter((day) => day.tracked);
  const categories = new Set(tracked.flatMap((day) => [...day.cats]));
  const mean = (list: { minutes: number }[]): number =>
    list.reduce((sum, day) => sum + day.minutes, 0) / list.length;
  const result: DistractionImpact[] = [];
  for (const category of categories) {
    const withIt = tracked.filter((day) => day.cats.has(category));
    const without = tracked.filter((day) => !day.cats.has(category));
    if (withIt.length < 2 || without.length < 2) continue;
    const minutesWith = Math.round(mean(withIt));
    const minutesWithout = Math.round(mean(without));
    result.push({
      category,
      daysWith: withIt.length,
      daysWithout: without.length,
      minutesWith,
      minutesWithout,
      deltaMinutes: minutesWith - minutesWithout,
      deltaPercent: minutesWithout
        ? Math.round(((minutesWith - minutesWithout) / minutesWithout) * 100)
        : 0,
    });
  }
  return result.sort((a, b) => a.deltaPercent - b.deltaPercent);
};

/** Distractions per study day (only days with at least one tracked block). */
export const buildDailyDistractionStats = (
  sessions: StudySession[],
  now: number,
  limitDays = 30,
): DailyDistractionStats => {
  const byDay = new Map<
    string,
    { count: number; minutes: number; blocks: number; categories: Record<string, number> }
  >();
  for (const session of sessions.filter(isTracked)) {
    const key = localDayKey(session.startedAt);
    const entry = byDay.get(key) ?? { count: 0, minutes: 0, blocks: 0, categories: {} };
    entry.count += session.distractions?.length ?? 0;
    for (const distraction of session.distractions ?? []) {
      entry.categories[distraction.category] =
        (entry.categories[distraction.category] ?? 0) + 1;
    }
    entry.minutes += blockMinutes(session, now);
    entry.blocks++;
    byDay.set(key, entry);
  }
  const sorted = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const days = sorted.map(([day, entry], index) => {
    const window = sorted.slice(Math.max(0, index - 6), index + 1);
    const windowTotal = window.reduce((sum, [, item]) => sum + item.count, 0);
    return {
      day,
      count: entry.count,
      minutes: entry.minutes,
      perHour: round1((entry.count / entry.minutes) * 60),
      blocks: entry.blocks,
      categories: entry.categories,
      movingAverage: round1(windowTotal / window.length),
    };
  });
  const shown = days.slice(-limitDays);
  const total = shown.reduce((sum, day) => sum + day.count, 0);
  const mean = (list: DistractionDay[]): number =>
    list.reduce((sum, day) => sum + day.count, 0) / list.length;
  const last7 = days.slice(-7);
  const previous7 = days.slice(-14, -7);
  const previousMean = previous7.length ? mean(previous7) : 0;
  const trendPercent =
    last7.length && previousMean > 0
      ? Math.round(((mean(last7) - previousMean) / previousMean) * 100)
      : null;
  return {
    days: shown,
    average: shown.length ? round1(total / shown.length) : 0,
    trendPercent,
  };
};
