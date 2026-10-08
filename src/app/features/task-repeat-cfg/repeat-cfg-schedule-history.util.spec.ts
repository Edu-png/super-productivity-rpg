import { DEFAULT_TASK_REPEAT_CFG, TaskRepeatCfg } from './task-repeat-cfg.model';
import {
  repeatCfgAsOfDay,
  withScheduleHistory,
} from './repeat-cfg-schedule-history.util';

const cfg = (overrides: Partial<TaskRepeatCfg> = {}): TaskRepeatCfg => ({
  ...DEFAULT_TASK_REPEAT_CFG,
  id: 'yoga',
  title: 'Yoga',
  startTime: '06:30',
  defaultEstimate: 15 * 60_000,
  ...overrides,
});

const TODAY = '2026-10-07';
const YESTERDAY = '2026-10-06';

describe('repeat cfg schedule history', () => {
  it('keeps the previous schedule, valid through yesterday, when the time changes', () => {
    const changes = withScheduleHistory(cfg(), { startTime: '07:00' }, TODAY, YESTERDAY);
    expect(changes.startTime).toBe('07:00');
    expect(changes.scheduleHistory).toEqual([
      jasmine.objectContaining({ until: YESTERDAY, startTime: '06:30', monday: true }),
    ]);
  });

  it('records nothing for changes that do not move the routine', () => {
    expect(withScheduleHistory(cfg(), { title: 'Yoga 2' }, TODAY, YESTERDAY)).toEqual({
      title: 'Yoga 2',
    });
    expect(withScheduleHistory(cfg(), { startTime: '06:30' }, TODAY, YESTERDAY)).toEqual({
      startTime: '06:30',
    });
  });

  it('keeps only the pre-today version when edited several times in one day', () => {
    const first = cfg({
      startTime: '07:00',
      scheduleHistory: [{ until: YESTERDAY, startTime: '06:30' }],
    });
    const changes = withScheduleHistory(first, { startTime: '07:30' }, TODAY, YESTERDAY);
    expect(changes.scheduleHistory).toBeUndefined();
  });

  it('skips the history for a routine that only starts today', () => {
    const fresh = cfg({ startDate: TODAY });
    expect(
      withScheduleHistory(fresh, { startTime: '07:00' }, TODAY, YESTERDAY)
        .scheduleHistory,
    ).toBeUndefined();
  });

  it('shows past days with the version that was in effect on them', () => {
    const current = cfg({
      startTime: '08:00',
      tuesday: false,
      scheduleHistory: [
        { until: '2026-09-30', startTime: '06:00', tuesday: true },
        { until: YESTERDAY, startTime: '07:00', tuesday: true },
      ],
    });
    expect(repeatCfgAsOfDay(current, '2026-09-29').startTime).toBe('06:00');
    expect(repeatCfgAsOfDay(current, '2026-10-02').startTime).toBe('07:00');
    expect(repeatCfgAsOfDay(current, YESTERDAY).tuesday).toBeTrue();
    expect(repeatCfgAsOfDay(current, TODAY)).toBe(current);
  });
});
