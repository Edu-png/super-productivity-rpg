import { buildReviewHighlights, summarizeWeekDistractions } from './weekly-review.util';
import { RpgReport, RpgReportRange } from './rpg-report.util';
import { StudySession } from '../academy-arcana/domain/academy.models';

const range: RpgReportRange = {
  startDay: '2026-09-21',
  endDay: '2026-09-27',
  startMs: new Date(2026, 8, 21).getTime(),
  endMs: new Date(2026, 8, 28).getTime(),
};
const inWeek = new Date(2026, 8, 23, 10).getTime();

const emptyReport = (overrides: Partial<RpgReport> = {}): RpgReport => ({
  totalHours: 0,
  tasksDone: 0,
  xpEarned: 0,
  hoursByProject: [],
  hoursByAttribute: [],
  timeline: [],
  penalties: [],
  penaltyTotals: { title: 'Total', count: 0, xp: 0, coins: 0, money: 0 },
  contractsWon: [],
  contractsLost: [],
  medals: [],
  moneyAdded: 0,
  moneyTransferred: 0,
  ...overrides,
});

const noDistractions = { count: 0, blocks: 0, minutes: 0, topCategory: null };

describe('summarizeWeekDistractions', () => {
  it('counts only tracked blocks started inside the week', () => {
    const sessions = [
      {
        startedAt: inWeek,
        status: 'completed',
        actualMinutes: 60,
        distractions: [
          { category: 'Celular' },
          { category: 'Celular' },
          { category: 'Fome' },
        ],
      },
      { startedAt: inWeek, status: 'completed', actualMinutes: 60 },
      {
        startedAt: new Date(2026, 8, 10).getTime(),
        status: 'completed',
        actualMinutes: 60,
        distractions: [{ category: 'Celular' }],
      },
    ] as unknown as StudySession[];
    expect(summarizeWeekDistractions(sessions, range)).toEqual({
      count: 3,
      blocks: 1,
      minutes: 60,
      topCategory: 'Celular',
    });
  });
});

describe('buildReviewHighlights', () => {
  it('compares hours with the previous week and celebrates a clean week', () => {
    const highlights = buildReviewHighlights({
      report: emptyReport({ totalHours: 15 }),
      previous: emptyReport({ totalHours: 10 }),
      distractions: noDistractions,
      previousDistractions: noDistractions,
    });
    expect(highlights[0]).toEqual({
      icon: 'schedule',
      text: '15h registradas (+50% vs. semana anterior)',
      tone: 'good',
    });
    expect(highlights.some((item) => item.text === 'Semana sem punições 🎉')).toBe(true);
  });

  it('flags the most frequent penalty', () => {
    const highlights = buildReviewHighlights({
      report: emptyReport({
        penalties: [{ title: 'Hábito proibido', count: 2, xp: 0, coins: 0, money: 0 }],
        penaltyTotals: { title: 'Total', count: 2, xp: 0, coins: 0, money: 0 },
      }),
      previous: emptyReport(),
      distractions: noDistractions,
      previousDistractions: noDistractions,
    });
    expect(highlights.find((item) => item.icon === 'gavel')?.text).toBe(
      '2 punições · mais frequente: Hábito proibido (2×)',
    );
  });
});
