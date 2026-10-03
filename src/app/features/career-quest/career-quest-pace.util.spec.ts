import {
  buildCareerPace,
  DEFAULT_PACE_TARGETS,
  studyMinutesByDay,
} from './career-quest-pace.util';
import { CareerQuestState } from './career-quest.model';
import { StudySession } from '../academy-arcana/domain/academy.models';
import { Task } from '../tasks/task.model';

const MON = '2026-09-28';
const TUE = '2026-09-29';
const WED = '2026-09-30';
const at = (d: number, hour = 10): number => new Date(2026, 8, d, hour).getTime();

describe('studyMinutesByDay', () => {
  const sessions = [
    { status: 'completed', startedAt: at(29), actualMinutes: 60 },
    { status: 'planned', startedAt: at(29), actualMinutes: 0, plannedMinutes: 90 },
  ] as unknown as StudySession[];
  const tasks = [
    { id: 'a', projectId: 'study', timeSpentOnDay: { [TUE]: 30 * 60_000 } },
    { id: 'b', projectId: 'work', timeSpentOnDay: { [TUE]: 120 * 60_000 } },
    { id: 'c', projectId: 'study', timeSpentOnDay: { [TUE]: 45 * 60_000 } },
  ] as unknown as Task[];

  it('adds Academia sessions and tasks of the chosen projects, skipping other characters', () => {
    const minutes = studyMinutesByDay({
      sessions,
      tasks,
      targets: { ...DEFAULT_PACE_TARGETS, studyProjectIds: ['study'] },
      characterId: 'me',
      taskOwnerIds: { c: 'someone-else' },
    });
    expect(minutes.get(TUE)).toBe(90);
  });
});

describe('buildCareerPace', () => {
  const state = {
    skills: {},
    evidence: [{ at: at(29) }, { at: at(20) }],
    quests: [
      { status: 'done', completedAt: at(30) },
      { status: 'done', completedAt: at(20) },
      { status: 'doing' },
    ],
    seededAt: 0,
  } as unknown as CareerQuestState;
  const minutesByDay = new Map([
    ['2026-09-27', 100],
    [MON, 95],
    [TUE, 120],
    [WED, 30],
  ]);
  const pace = buildCareerPace({
    minutesByDay,
    state,
    targets: DEFAULT_PACE_TARGETS,
    now: at(30, 15),
    weekStartMs: new Date(2026, 8, 28).getTime(),
  });

  it('sums the week from Monday and counts this week only', () => {
    expect(pace.todayMinutes).toBe(30);
    expect(pace.weekMinutes).toBe(245);
    expect(pace.weekQuests).toBe(1);
    expect(pace.weekEvidence).toBe(1);
  });

  it('does not break the streak just because today is not finished', () => {
    // 27, 28 and 29 met the 90-min target; today (30) not yet.
    expect(pace.streak).toBe(3);
    expect(pace.lastDays.length).toBe(7);
    expect(pace.lastDays[6].day).toBe(WED);
  });
});
