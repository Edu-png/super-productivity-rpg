import { scheduleNextReview } from './spaced-repetition';

describe('scheduleNextReview intervalFactor', () => {
  it('shortens the interval without changing stability', () => {
    const base = scheduleNextReview(10, 5, 10, 3);
    const mindMap = scheduleNextReview(10, 5, 10, 3, 0.7);
    expect(mindMap.stability).toBe(base.stability);
    expect(mindMap.intervalDays).toBeLessThan(base.intervalDays);
  });

  it('never goes below one day', () => {
    expect(scheduleNextReview(0.5, 5, 0, 1, 0.1).intervalDays).toBe(1);
  });
});
