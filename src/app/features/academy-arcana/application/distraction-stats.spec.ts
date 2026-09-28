import { buildDailyDistractionStats, buildDistractionStats } from './distraction-stats';
import { StudyDistraction, StudySession } from '../domain/academy.models';

const distraction = (category: string): StudyDistraction => ({
  id: category + Math.random(),
  at: 0,
  category,
  note: '',
});

const session = (
  id: string,
  startedAt: number,
  minutes: number,
  distractions?: StudyDistraction[],
  status: StudySession['status'] = 'completed',
): StudySession =>
  ({
    id,
    title: id,
    startedAt,
    actualMinutes: minutes,
    plannedMinutes: minutes,
    status,
    distractions,
  }) as StudySession;

describe('buildDistractionStats', () => {
  const sessions = [
    session('b2', 2000, 30, [distraction('Celular')]),
    session('b1', 1000, 60, [
      distraction('Celular'),
      distraction('Celular'),
      distraction('Pensamentos'),
    ]),
    // tracked before distractions existed: must not drag the average down
    session('old', 500, 60),
    session('planned', 3000, 60, [], 'planned'),
  ];
  const stats = buildDistractionStats(sessions, 0);

  it('keeps only tracked blocks, oldest first', () => {
    expect(stats.blocks.map((block) => block.id)).toEqual(['b1', 'b2']);
  });

  it('computes per-block counts, average and per-hour rate', () => {
    expect(stats.blocks.map((block) => block.count)).toEqual([3, 1]);
    expect(stats.average).toBe(2);
    expect(stats.blocks[1].perHour).toBe(2);
    expect(stats.averagePerHour).toBe(2.7);
  });

  it('ranks categories by how often they distract', () => {
    expect(stats.categories).toEqual([
      { category: 'Celular', count: 3 },
      { category: 'Pensamentos', count: 1 },
    ]);
    expect(stats.total).toBe(4);
  });

  it('limits to the most recent blocks', () => {
    const many = Array.from({ length: 25 }, (_, i) => session(`s${i}`, i, 30, []));
    const limited = buildDistractionStats(many, 0, 20);
    expect(limited.blocks.length).toBe(20);
    expect(limited.blocks[0].id).toBe('s5');
  });
});

describe('buildDailyDistractionStats', () => {
  const day = (d: number, hour: number): number => new Date(2026, 8, d, hour).getTime();
  const many = (n: number): StudyDistraction[] =>
    Array.from({ length: n }, () => distraction('Celular'));
  const sessions = [
    session('a', day(21, 9), 60, many(4)),
    session('b', day(21, 14), 60, many(2)),
    session('c', day(22, 9), 30, many(1)),
    session('d', day(23, 9), 60, many(3)),
    session('old', day(23, 15), 60),
  ];
  const stats = buildDailyDistractionStats(sessions, 0);

  it('sums distractions per study day', () => {
    expect(stats.days.map((item) => [item.day, item.count, item.blocks])).toEqual([
      ['2026-09-21', 6, 2],
      ['2026-09-22', 1, 1],
      ['2026-09-23', 3, 1],
    ]);
    expect(stats.average).toBe(3.3);
  });

  it('tracks progress with a trailing moving average', () => {
    expect(stats.days.map((item) => item.movingAverage)).toEqual([6, 3.5, 3.3]);
    expect(stats.trendPercent).toBeNull();
  });
});
