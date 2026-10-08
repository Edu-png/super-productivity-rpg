import {
  RepeatCfgScheduleSnapshot,
  TaskRepeatCfg,
  TaskRepeatCfgCopy,
} from './task-repeat-cfg.model';

/** Fields that decide where a repeat cfg lands in the schedule. */
export const REPEAT_CFG_SCHEDULE_FIELDS = [
  'startTime',
  'defaultEstimate',
  'repeatCycle',
  'repeatEvery',
  'startDate',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'monthlyWeekOfMonth',
  'monthlyWeekday',
  'monthlyLastDay',
] as const satisfies readonly (keyof TaskRepeatCfgCopy)[];

/**
 * Editing when/how often a routine happens should only affect today onwards:
 * when `changes` alters a schedule field, the version in effect until now is
 * kept in `scheduleHistory` (valid through yesterday) so past days keep
 * showing what was actually planned for them. Several edits on the same day
 * keep only the version from before that day.
 */
export const withScheduleHistory = (
  cfg: TaskRepeatCfg,
  changes: Partial<TaskRepeatCfg>,
  todayStr: string,
  yesterdayStr: string,
): Partial<TaskRepeatCfg> => {
  const isScheduleChange = REPEAT_CFG_SCHEDULE_FIELDS.some(
    (field) => field in changes && changes[field] !== cfg[field],
  );
  const history = cfg.scheduleHistory ?? [];
  if (!isScheduleChange || history.some((entry) => entry.until >= yesterdayStr)) {
    return changes;
  }
  // A cfg that only starts today or later has no past to protect.
  if (cfg.startDate && cfg.startDate >= todayStr) {
    return changes;
  }
  const snapshot: RepeatCfgScheduleSnapshot = { until: yesterdayStr };
  for (const field of REPEAT_CFG_SCHEDULE_FIELDS) {
    if (cfg[field] !== undefined) {
      (snapshot as Record<string, unknown>)[field] = cfg[field];
    }
  }
  return { ...changes, scheduleHistory: [...history, snapshot] };
};

/** The cfg as it was planned on `dayStr` (YYYY-MM-DD) - the current one when it never changed since. */
export const repeatCfgAsOfDay = (cfg: TaskRepeatCfg, dayStr: string): TaskRepeatCfg => {
  const entry = [...(cfg.scheduleHistory ?? [])]
    .sort((a, b) => a.until.localeCompare(b.until))
    .find((item) => item.until >= dayStr);
  if (!entry) {
    return cfg;
  }
  const fields: Partial<RepeatCfgScheduleSnapshot> = { ...entry };
  delete fields.until;
  return { ...cfg, ...fields };
};
