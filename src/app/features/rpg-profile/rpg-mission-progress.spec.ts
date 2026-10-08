import { RpgMissionAuto } from './rpg-profile.model';
import {
  DayScore,
  missionAutoRepeats,
  missionAutoValue,
  missionRuns,
} from './rpg-mission-progress';
import { missionAutoFromTemplate } from './rpg-missions.data';

const auto = (overrides: Partial<RpgMissionAuto> = {}): RpgMissionAuto => ({
  source: 'habits',
  ids: [],
  period: 'day',
  threshold: 1,
  count: 'streak',
  every: 1,
  since: '2026-10-01',
  ...overrides,
});

const DONE: DayScore = { done: 1, total: 1 };
const MISSED: DayScore = { done: 0, total: 1 };
const NOTHING: DayScore = { done: 0, total: 0 };

const scores =
  (byDay: Array<[string, DayScore]>) =>
  (day: string): DayScore =>
    new Map(byDay).get(day) ?? NOTHING;

describe('rpg mission progress', () => {
  it('counts the current streak, skipping days with nothing to judge', () => {
    const config = auto();
    const runs = missionRuns(
      config,
      '2026-10-06',
      scores([
        ['2026-10-01', DONE],
        ['2026-10-02', MISSED],
        ['2026-10-03', DONE],
        // 10-04 has no habits that day: neither counts nor breaks
        ['2026-10-05', DONE],
        ['2026-10-06', DONE],
      ]),
    );
    expect(missionAutoValue(config, runs)).toBe(3);
    expect(missionAutoValue(auto({ count: 'total' }), runs)).toBe(4);
  });

  it('does not break the streak because today is not done yet', () => {
    const config = auto();
    const runs = missionRuns(
      config,
      '2026-10-03',
      scores([
        ['2026-10-01', DONE],
        ['2026-10-02', DONE],
        ['2026-10-03', MISSED],
      ]),
    );
    expect(missionAutoValue(config, runs)).toBe(2);
  });

  it('only counts weeks that are over', () => {
    const config = auto({ period: 'week', since: '2026-09-28' });
    const allDone = (): DayScore => DONE;
    // 2026-09-28 is a Monday; on 10-07 (Wednesday) only the first week is closed.
    expect(missionAutoValue(config, missionRuns(config, '2026-10-07', allDone))).toBe(1);
  });

  it('applies the threshold to the whole period, 0 meaning at least one', () => {
    const twoOfThree = (): DayScore => ({ done: 2, total: 3 });
    const strict = auto({ count: 'total' });
    const loose = auto({ count: 'total', threshold: 0.6 });
    const anyOne = auto({ count: 'total', threshold: 0 });
    const today = '2026-10-03';
    expect(missionAutoValue(strict, missionRuns(strict, today, twoOfThree))).toBe(0);
    expect(missionAutoValue(loose, missionRuns(loose, today, twoOfThree))).toBe(3);
    expect(missionAutoValue(anyOne, missionRuns(anyOne, today, twoOfThree))).toBe(3);
  });

  it('earns a repeatable streak mission once per full block in a row', () => {
    const config = auto({ every: 3 });
    // runs of 7 and 4 days -> 2 + 1 blocks of three
    expect(missionAutoRepeats(config, [7, 4], 3)).toBe(3);
    expect(missionAutoRepeats(auto({ count: 'total' }), [7, 4], 3)).toBe(3);
    expect(missionAutoRepeats(auto({ count: 'total' }), [2, 2], 3)).toBe(1);
  });

  it('links the example missions by habit or penalty title', () => {
    const habits = [
      { id: 'h1', title: 'Estudar Dados' },
      { id: 'h2', title: 'Estudos diversos' },
      { id: 'h3', title: 'Academia/Cardio' },
    ];
    const penalties = [{ id: 'p1', title: 'Hábito proibido' }];
    expect(
      missionAutoFromTemplate('Aprendiz Consistente', habits, penalties, '2026-10-07'),
    ).toEqual(jasmine.objectContaining({ ids: ['h1', 'h2'], threshold: 0 }));
    expect(
      missionAutoFromTemplate('Resistência', habits, penalties, '2026-10-07')?.ids,
    ).toEqual(['p1']);
    // No reading habit -> stays manual
    expect(
      missionAutoFromTemplate('Leitor Consistente', habits, penalties, '2026-10-07'),
    ).toBeUndefined();
    // "any penalty" templates need no match
    expect(
      missionAutoFromTemplate('Semana Perfeita', habits, penalties, '2026-10-07'),
    ).toEqual(jasmine.objectContaining({ ids: [], every: 7, source: 'noPenalty' }));
  });
});
