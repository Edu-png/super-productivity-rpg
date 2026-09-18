import { TaskRepeatCfg } from '../task-repeat-cfg.model';
import { getNewestPossibleDueDate } from './get-newest-possible-due-date.util';
import { isSameDay } from '../../../util/is-same-day';
import { getDbDateStr } from '../../../util/get-db-date-str';

// selectTaskRepeatCfgsForExactDay is gated on lastTaskCreationDay: once
// skipOverdue (or a plain catch-up run) advances it past a day without ever
// creating an instance for that day, the selector reports "nothing due" for
// it forever after - correct for materialization (never re-create a day
// already processed), wrong for the schedule view asking "did this routine's
// pattern land on this day", which must stay true regardless of whether an
// instance was ever created. This mirrors that selector's filter but checks
// the recurrence pattern directly (via getNewestPossibleDueDate with the
// processing state cleared) instead of gating on processing state, so a
// skipped/never-materialized past day still renders its routine (#past-days-vanish).
export const wouldRepeatCfgOccurOnDay = (
  cfg: TaskRepeatCfg,
  dayDate: number,
): boolean => {
  if (cfg.isPaused) {
    return false;
  }
  // "every N days after completing the previous one" has no fixed calendar
  // pattern to replay without the actual completion history, so there is no
  // reliable way to answer "would this have occurred on this day".
  if (cfg.repeatFromCompletionDate) {
    return false;
  }
  if (cfg.deletedInstanceDates?.includes(getDbDateStr(dayDate))) {
    return false;
  }

  const ungatedCfg: TaskRepeatCfg = {
    ...cfg,
    lastTaskCreation: undefined,
    lastTaskCreationDay: undefined,
  };
  const due = getNewestPossibleDueDate(ungatedCfg, new Date(dayDate));
  return !!due && isSameDay(due, dayDate);
};
