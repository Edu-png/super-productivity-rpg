import {
  reviewDelayCharges,
  reviewDelayStatus,
  reviewDelayXpForLateDay,
} from './review-delay-penalty';

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const at = (day: string): number => Date.parse(`${day}T12:00:00Z`);

describe('review-delay-penalty', () => {
  it('costs 3 XP on late day 1, +1 per day, capped at 10', () => {
    expect(reviewDelayXpForLateDay(1)).toBe(3);
    expect(reviewDelayXpForLateDay(2)).toBe(4);
    expect(reviewDelayXpForLateDay(30)).toBe(10);
  });

  it('only charges from the start day, which counts as late day 1', () => {
    const review = { nodeId: 'a', dueAt: at('2026-10-03'), lastReviewedAt: 1 };
    const first = reviewDelayCharges([review], {}, '2026-10-06', dayOf);
    expect(first.charges).toEqual([{ nodeId: 'a', days: 1, xp: 3 }]);
    const next = reviewDelayCharges([review], first.streaks, '2026-10-08', dayOf);
    expect(next.charges).toEqual([{ nodeId: 'a', days: 2, xp: 4 + 5 }]);
  });

  it('never charges the same day twice, nor reviews not yet late', () => {
    const late = { nodeId: 'a', dueAt: at('2026-10-10'), lastReviewedAt: 1 };
    const dueToday = { nodeId: 'b', dueAt: at('2026-10-12'), lastReviewedAt: 1 };
    const first = reviewDelayCharges([late, dueToday], {}, '2026-10-12', dayOf);
    expect(first.charges).toEqual([{ nodeId: 'a', days: 2, xp: 3 + 4 }]);
    const again = reviewDelayCharges(
      [late, dueToday],
      first.streaks,
      '2026-10-12',
      dayOf,
    );
    expect(again.charges).toEqual([]);
  });

  it('keeps charging after "Pular" until a real review happens', () => {
    const late = { nodeId: 'a', dueAt: at('2026-10-10'), lastReviewedAt: 1 };
    const first = reviewDelayCharges([late], {}, '2026-10-11', dayOf);
    const skipped = { ...late, dueAt: at('2026-10-13') };
    const next = reviewDelayCharges([skipped], first.streaks, '2026-10-12', dayOf);
    expect(next.charges).toEqual([{ nodeId: 'a', days: 1, xp: 4 }]);
    const reviewed = { ...skipped, lastReviewedAt: 2 };
    const done = reviewDelayCharges([reviewed], next.streaks, '2026-10-13', dayOf);
    expect(done.charges).toEqual([]);
    expect(done.streaks).toEqual({});
  });

  it('reports XP lost so far and the cost of tomorrow', () => {
    expect(reviewDelayStatus(undefined, '2026-10-06')).toEqual({ lost: 0, tomorrow: 3 });
    const streak = { since: '2026-10-05', last: '2026-10-07', reviewedAt: 1 };
    expect(reviewDelayStatus(streak, '2026-10-07')).toEqual({ lost: 3 + 4, tomorrow: 5 });
  });
});
