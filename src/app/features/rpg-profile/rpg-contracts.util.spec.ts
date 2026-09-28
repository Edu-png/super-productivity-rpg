import {
  contractProgress,
  medalTierFor,
  penaltyWeekCount,
  startOfWeekMs,
} from './rpg-contracts.util';
import { RpgContract, RpgPenalty } from './rpg-profile.model';
import { Task } from '../tasks/task.model';

const HOUR = 60 * 60 * 1000;
const MON = '2026-09-21';
const TUE = '2026-09-22';
const BEFORE = '2026-09-19';

describe('rpg-contracts.util', () => {
  it('starts the week on Monday 00:00 local time', () => {
    const thursday = new Date(2026, 8, 24, 15).getTime();
    const sunday = new Date(2026, 8, 27, 23).getTime();
    const monday = new Date(2026, 8, 21).getTime();
    expect(startOfWeekMs(thursday)).toBe(monday);
    expect(startOfWeekMs(sunday)).toBe(monday);
  });

  it('counts only this week applications of a penalty', () => {
    const penalty = {
      weekAppliedAt: [
        new Date(2026, 8, 20).getTime(),
        new Date(2026, 8, 22).getTime(),
        new Date(2026, 8, 23).getTime(),
      ],
    } as RpgPenalty;
    expect(penaltyWeekCount(penalty, new Date(2026, 8, 24).getTime())).toBe(2);
  });

  it('maps target ratio to medal rarity', () => {
    expect(medalTierFor(0.9)).toBeNull();
    expect(medalTierFor(1)).toBe('bronze');
    expect(medalTierFor(1.2)).toBe('silver');
    expect(medalTierFor(1.9)).toBe('gold');
  });

  describe('contractProgress', () => {
    const tasks = [
      {
        id: 'a',
        projectId: 'P',
        tagIds: [],
        timeSpentOnDay: { [MON]: HOUR, [BEFORE]: HOUR },
      },
      // subtask time is already included in its parent's timeSpentOnDay
      {
        id: 'b',
        parentId: 'a',
        projectId: 'P',
        tagIds: [],
        timeSpentOnDay: { [MON]: HOUR },
      },
      {
        id: 'c',
        projectId: 'Q',
        tagIds: ['T'],
        timeSpentOnDay: { [TUE]: HOUR / 2 },
      },
    ] as unknown as Task[];
    const contract = {
      metric: 'hours',
      scopeKind: 'all',
      startDay: '2026-09-21',
      deadlineDay: '2026-09-27',
      manualProgress: 0,
    } as RpgContract;

    it('sums top-level tracked hours inside the window', () => {
      expect(contractProgress(contract, tasks)).toBe(1.5);
    });

    it('filters by project and tag', () => {
      expect(
        contractProgress({ ...contract, scopeKind: 'project', scopeId: 'P' }, tasks),
      ).toBe(1);
      expect(
        contractProgress({ ...contract, scopeKind: 'tag', scopeId: 'T' }, tasks),
      ).toBe(0.5);
    });

    it('uses the manual counter for manual contracts', () => {
      expect(
        contractProgress({ ...contract, metric: 'manual', manualProgress: 3 }, tasks),
      ).toBe(3);
    });
  });
});
