// Day-keyed records (YYYY-MM-DD) are the real shape of these logs.
/* eslint-disable @typescript-eslint/naming-convention */
import { WorkDoneEntry } from './work-agenda.model';
import {
  DayListCard,
  dayListGroups,
  estimateAccuracy,
  matchAcademyTopics,
  monthListGroups,
  nextDailySnapshot,
  syncTimeLog,
  timesheetCsv,
  timesheetRows,
  workingDaysBack,
  workDayStats,
} from './work-agenda.util';
import { workDayScore } from '../rpg-profile/rpg-mission-progress';

const done = (overrides: Partial<WorkDoneEntry>): WorkDoneEntry => ({
  day: '2026-10-06',
  title: 'card',
  estimateMin: 60,
  ...overrides,
});

describe('work agenda insights', () => {
  it('keeps tracked minutes per day, even for cards no longer on the board', () => {
    const log = syncTimeLog({}, [
      {
        taskId: 'a',
        title: 'API',
        companyId: 'c1',
        timeSpentOnDay: { '2026-10-06': 90 * 60_000, '2026-10-07': 30_000 },
      },
      { taskId: 'b', title: 'nada', timeSpentOnDay: {} },
    ]);
    expect(log['a'].minutesByDay).toEqual({ '2026-10-06': 90 });
    expect(log['b']).toBeUndefined();
    expect(syncTimeLog(log, [])).toBe(log);
  });

  it('builds the month timesheet and its CSV', () => {
    const log = {
      a: {
        title: 'API; v2',
        companyId: 'c1',
        minutesByDay: { '2026-10-06': 90, '2026-09-30': 60 },
      },
    };
    const rows = timesheetRows(log, '2026-10');
    expect(rows.length).toBe(1);
    expect(rows[0].minutes).toBe(90);
    const csv = timesheetCsv(
      rows,
      () => 'Acme',
      () => 'Sem projeto',
    );
    expect(csv.split('\n')[1]).toBe('06/10/2026;Acme;Sem projeto;"API; v2";1,50');
  });

  it('learns how much longer cards take than estimated, per group', () => {
    const entries = [
      done({ companyId: 'c1', estimateMin: 60, spentMin: 90 }),
      done({ companyId: 'c1', estimateMin: 60, spentMin: 80 }),
      done({ companyId: 'c1', estimateMin: 60, spentMin: 82 }),
      done({ companyId: 'c2', estimateMin: 60, spentMin: 60 }),
      done({ companyId: 'c1', estimateMin: 0, spentMin: 500 }),
    ];
    const result = estimateAccuracy(entries, (entry) => entry.companyId);
    expect(result).toEqual([{ key: 'c1', count: 3, ratio: 1.4 }]);
  });

  it('records the day "Revisão" was emptied', () => {
    const first = nextDailySnapshot({}, [], '2026-10-06', {
      reviewCount: 2,
      urgentOpen: 1,
    })!;
    expect(first.clearedDays).toEqual([]);
    const cleared = nextDailySnapshot(first.snapshots, first.clearedDays, '2026-10-07', {
      reviewCount: 0,
      urgentOpen: 0,
    })!;
    expect(cleared.clearedDays).toEqual(['2026-10-07']);
    expect(
      nextDailySnapshot(cleared.snapshots, cleared.clearedDays, '2026-10-07', {
        reviewCount: 0,
        urgentOpen: 0,
      }),
    ).toBeNull();
  });

  it('turns the logs into per-day work stats, carrying the open urgent count forward', () => {
    const stats = workDayStats(
      {
        a: done({ day: '2026-10-05', estimateMin: 240, priority: 'urgent' }),
        b: done({ day: '2026-10-05', estimateMin: 150 }),
      },
      { '2026-10-04': { reviewCount: 1, urgentOpen: 2 } },
      ['2026-10-06'],
      '2026-10-04',
      '2026-10-06',
    );
    expect(stats['2026-10-05']).toEqual({
      estimatedMin: 390,
      goalMet: true,
      urgentDone: 1,
      urgentOpen: 2,
      reviewCleared: false,
    });
    expect(stats['2026-10-06'].reviewCleared).toBeTrue();
  });

  it('scores work mission days: 6h goal, weekends neutral, urgent weeks closed on Sunday', () => {
    const base = {
      estimatedMin: 0,
      goalMet: false,
      urgentDone: 0,
      urgentOpen: 0,
      reviewCleared: false,
    };
    // 2026-10-05 Monday, 2026-10-10 Saturday, 2026-10-11 Sunday
    expect(workDayScore('dailyGoal', { ...base, goalMet: true }, '2026-10-05')).toEqual({
      done: 1,
      total: 1,
    });
    expect(workDayScore('dailyGoal', base, '2026-10-05')).toEqual({ done: 0, total: 1 });
    expect(workDayScore('dailyGoal', base, '2026-10-10')).toEqual({ done: 0, total: 0 });
    expect(
      workDayScore('urgentWeek', { ...base, urgentDone: 1, urgentOpen: 2 }, '2026-10-11'),
    ).toEqual({ done: 1, total: 3 });
    expect(
      workDayScore('urgentWeek', { ...base, urgentDone: 1, urgentOpen: 2 }, '2026-10-08'),
    ).toEqual({ done: 1, total: 1 });
  });

  it('matches Academia topics sharing meaningful words with the card', () => {
    const topics = [
      { id: '1', title: 'Regressão Linear' },
      { id: '2', title: 'Redes Neurais' },
      { id: '3', title: 'Para iniciantes' },
    ];
    expect(
      matchAcademyTopics('Modelo de regressao para previsão de vendas', topics).map(
        (topic) => topic.id,
      ),
    ).toEqual(['1']);
  });

  it('groups the daily list into overdue, planned, due and finished', () => {
    const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const card = (
      id: string,
      task: Partial<DayListCard['task']>,
      priority?: 'urgent',
    ): DayListCard => ({
      task: { id, title: id, isDone: false, ...task },
      meta: priority
        ? { taskId: id, columnId: 'todo' as const, order: 0, priority }
        : undefined,
    });
    const cards = [
      card('late', { dueDay: '2026-10-06' }),
      card('b', { dueDay: '2026-10-07' }),
      card('a', { dueDay: '2026-10-07' }, 'urgent'),
      card('due', { deadlineDay: '2026-10-07' }),
      card('done', { isDone: true, doneOn: Date.UTC(2026, 9, 7, 12) }),
      card('other', { dueDay: '2026-10-09' }),
    ];
    const today = dayListGroups(cards, '2026-10-07', '2026-10-07', dayOf);
    expect(today.planned.map((c) => c.task.id)).toEqual(['a', 'b']);
    expect(today.overdue.map((c) => c.task.id)).toEqual(['late']);
    expect(today.deadline.map((c) => c.task.id)).toEqual(['due']);
    expect(today.done.map((c) => c.task.id)).toEqual(['done']);
    // Overdue only shows up when looking at today
    expect(dayListGroups(cards, '2026-10-07', '2026-10-08', dayOf).overdue).toEqual([]);
  });

  it('groups a month by day: done day, else planned day, else deadline', () => {
    const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const card = (id: string, task: Partial<DayListCard['task']>): DayListCard => ({
      task: { id, title: id, isDone: false, ...task },
    });
    const groups = monthListGroups(
      [
        card('planned', { dueDay: '2026-10-09', deadlineDay: '2026-10-20' }),
        card('deadline', { deadlineDay: '2026-10-20' }),
        card('done', {
          isDone: true,
          doneOn: Date.UTC(2026, 9, 7, 12),
          dueDay: '2026-10-09',
        }),
        card('november', { dueDay: '2026-11-02' }),
        card('loose', {}),
      ],
      '2026-10',
      dayOf,
    );
    expect(groups.map((group) => [group.day, group.cards.map((c) => c.task.id)])).toEqual(
      [
        ['2026-10-07', ['done']],
        ['2026-10-09', ['planned']],
        ['2026-10-20', ['deadline']],
      ],
    );
  });

  it('lists the last working days, keeping a weekend only if it had work', () => {
    // 2026-10-05 is a Monday
    expect(workingDaysBack('2026-10-06', 3, () => false)).toEqual([
      '2026-10-02',
      '2026-10-05',
      '2026-10-06',
    ]);
    expect(workingDaysBack('2026-10-06', 3, (day) => day === '2026-10-04')).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ]);
  });
});
