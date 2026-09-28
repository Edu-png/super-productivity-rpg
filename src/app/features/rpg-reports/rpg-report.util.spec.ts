import { buildRpgReport, daysInRange, RpgReportRange } from './rpg-report.util';
import { Task } from '../tasks/task.model';
import { RpgProfileState } from '../rpg-profile/rpg-profile.model';

const HOUR = 60 * 60 * 1000;
const D21 = '2026-09-21';
const D22 = '2026-09-22';
const D30 = '2026-08-30';
const MEDAL = '2026-9';

const weekRange: RpgReportRange = {
  startDay: '2026-09-21',
  endDay: '2026-09-27',
  startMs: new Date(2026, 8, 21).getTime(),
  endMs: new Date(2026, 8, 28).getTime(),
};
const inWeek = new Date(2026, 8, 23, 12).getTime();
const beforeWeek = new Date(2026, 8, 10).getTime();

const tasks = [
  {
    id: 'a',
    projectId: 'P',
    tagIds: [],
    subTaskIds: ['b'],
    isDone: false,
    timeSpentOnDay: { [D21]: 2 * HOUR, [D30]: HOUR },
  },
  // subtask: its time is already inside the parent's timeSpentOnDay
  {
    id: 'b',
    parentId: 'a',
    projectId: 'P',
    tagIds: [],
    subTaskIds: [],
    isDone: true,
    doneOn: inWeek,
    timeSpentOnDay: { [D21]: 2 * HOUR },
  },
  // credited to another character - must not show up in this report
  {
    id: 'other',
    projectId: 'P',
    tagIds: [],
    subTaskIds: [],
    isDone: true,
    doneOn: inWeek,
    timeSpentOnDay: { [D21]: 5 * HOUR },
  },
  {
    id: 'c',
    projectId: 'Q',
    tagIds: [],
    subTaskIds: [],
    isDone: true,
    doneOn: beforeWeek,
    timeSpentOnDay: { [D22]: HOUR },
  },
] as unknown as Task[];

const state = {
  projectAttributes: { P: 'intelligence' },
  xpLedger: {
    x1: { taskId: 'b', projectId: 'P', xp: 100, earnedAt: inWeek },
    x2: { taskId: 'c', projectId: 'Q', xp: 50, earnedAt: beforeWeek },
  },
  penalties: [
    {
      id: 'f1',
      title: 'Não concluída: algo',
      xpLoss: 20,
      coinsLoss: 2,
      createdAt: inWeek,
      sourceTaskId: 'z',
    },
  ],
  penaltyLog: [
    {
      penaltyId: 'p1',
      title: 'Hábito proibido',
      at: inWeek,
      xp: 100,
      coins: 10,
      money: 30,
    },
    {
      penaltyId: 'p1',
      title: 'Hábito proibido',
      at: inWeek,
      xp: 200,
      coins: 20,
      money: 60,
    },
    { penaltyId: 'p2', title: 'Dieta', at: beforeWeek, xp: 50, coins: 5, money: 10 },
  ],
  penaltyMoneyTransfers: [{ at: inWeek, amount: 40 }],
  contracts: [
    { id: 'k1', title: 'Estudar', status: 'won', resolvedAt: inWeek, stakeMoney: 50 },
    { id: 'k2', title: 'Treinar', status: 'lost', resolvedAt: inWeek, stakeMoney: 25 },
    { id: 'k3', title: 'Ler', status: 'active', stakeMoney: 10 },
  ],
  trophyClaims: {
    [`monthly:${MEDAL}`]: { claimedAt: inWeek, xp: 50, gold: 50 },
    [`monthly-tier:${MEDAL}`]: { claimedAt: inWeek, xp: 50, gold: 50, tier: 'silver' },
  },
  annualGoals: [],
} as unknown as RpgProfileState;

describe('buildRpgReport', () => {
  const report = buildRpgReport({
    range: weekRange,
    tasks,
    projects: [
      { id: 'P', title: 'Estudos' },
      { id: 'Q', title: 'Trabalho' },
    ],
    state,
    monthlyMedalTitles: { [MEDAL]: 'Energia Relâmpago' },
    attributeLabels: { intelligence: 'Inteligência' },
    xpMultiplier: 1.5,
    characterId: 'me',
    taskOwnerIds: { b: 'me', other: 'someone-else' },
  });

  it('sums hours of top-level tasks within the range only', () => {
    expect(report.totalHours).toBe(3);
    expect(report.hoursByProject.map((bar) => [bar.label, bar.hours])).toEqual([
      ['Estudos', 2],
      ['Trabalho', 1],
    ]);
    expect(report.hoursByAttribute).toEqual([
      { id: 'intelligence', label: 'Inteligência', hours: 2 },
    ]);
    expect(report.timeline.length).toBe(7);
  });

  it('counts done tasks and multiplied XP inside the range', () => {
    expect(report.tasksDone).toBe(1);
    expect(report.xpEarned).toBe(150);
  });

  it('groups penalties by type, most frequent first', () => {
    expect(report.penalties.map((row) => [row.title, row.count])).toEqual([
      ['Hábito proibido', 2],
      ['Tarefas não concluídas', 1],
    ]);
    expect(report.penaltyTotals.money).toBe(90);
  });

  it('reports contracts, money box and medals for the range', () => {
    expect(report.contractsWon.map((c) => c.id)).toEqual(['k1']);
    expect(report.contractsLost.map((c) => c.id)).toEqual(['k2']);
    expect(report.moneyAdded).toBe(115);
    expect(report.moneyTransferred).toBe(40);
    expect(report.medals).toEqual([
      {
        title: 'Energia Relâmpago',
        tier: 'silver',
        isUpgrade: false,
        xp: 100,
        gold: 100,
      },
    ]);
  });

  it('lists every day of a range', () => {
    expect(daysInRange(weekRange)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
  });
});
