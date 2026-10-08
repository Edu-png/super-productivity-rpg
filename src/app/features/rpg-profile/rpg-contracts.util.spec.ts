import {
  contractProgress,
  medalTierFor,
  penaltyMultiplier,
  startOfWeekMs,
} from './rpg-contracts.util';
import { RpgContract, RpgPenalty, RpgPenaltyLogEntry } from './rpg-profile.model';
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

  it('escalates penalties by 1.3 per recent repeat, faster when close together', () => {
    const penalty = { id: 'p1' } as RpgPenalty;
    const now = new Date(2026, 8, 24, 12).getTime();
    const day = 24 * HOUR;
    const log = (...ages: number[]): RpgPenaltyLogEntry[] =>
      ages.map((age) => ({
        penaltyId: 'p1',
        title: '',
        at: now - age,
        xp: 0,
        coins: 0,
        money: 0,
      }));
    expect(penaltyMultiplier(penalty, [], now)).toBe(1);
    expect(penaltyMultiplier(penalty, log(10 * day), now)).toBe(1.3);
    expect(penaltyMultiplier(penalty, log(2 * day), now)).toBe(1.48);
    expect(penaltyMultiplier(penalty, log(5 * HOUR), now)).toBe(1.69);
    expect(penaltyMultiplier(penalty, log(40 * day), now)).toBe(1);
    expect(
      penaltyMultiplier(penalty, [{ ...log(HOUR)[0], penaltyId: 'other' }], now),
    ).toBe(1);
    expect(
      penaltyMultiplier(penalty, log(HOUR, day / 2, 2 * day, 3 * day, 4 * day), now),
    ).toBe(5);
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
